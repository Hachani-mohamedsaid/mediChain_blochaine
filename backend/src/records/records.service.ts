import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { keccak256 } from 'ethers';
import { JsonStoreService } from '../common/persistence/json-store.service.js';
import { Role } from '../common/enums/role.enum.js';
import type { UserEntity } from '../users/user.entity.js';
import type { MedicalRecordEntity } from './record.entity.js';
import { AccessService } from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UsersService } from '../users/users.service.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import {
  decryptBuffer,
  demoCidFromHash,
  encryptBuffer,
} from '../common/crypto/file-crypto.js';

const RECORDS_FILE = 'records.json';

@Injectable()
export class RecordsService {
  readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor(
    private readonly store: JsonStoreService,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly blockchain: BlockchainService,
    private readonly config: ConfigService,
  ) {}

  private encryptionSecret(): string {
    return (
      this.config.get<string>('FILE_ENCRYPTION_KEY') ||
      'medichain-dev-file-key-change-me'
    );
  }

  private inferCategory(
    title: string,
  ): MedicalRecordEntity['category'] {
    const t = title.toLowerCase();
    if (/ordo|prescription/.test(t)) return 'ordonnance';
    if (/certificat|arrêt|arret/.test(t)) return 'certificat';
    if (/radio|irm|scanner|imagerie|echo/.test(t)) return 'imagerie';
    if (/analyse|sang|labo|biologie/.test(t)) return 'analyse';
    if (/compte.?rendu|\bcr\b/.test(t)) return 'compte_rendu';
    return 'autre';
  }

  private async persistEncrypted(
    filePath: string,
    plain: Buffer,
  ): Promise<{ encrypted: boolean; contentCid: string; contentHash: string }> {
    const contentHash = keccak256(plain);
    const contentCid = demoCidFromHash(contentHash);
    const enc = encryptBuffer(plain, this.encryptionSecret());
    await writeFile(filePath, enc);
    return { encrypted: true, contentCid, contentHash };
  }

  async readDecryptedFile(record: MedicalRecordEntity): Promise<Buffer> {
    const raw = await readFile(record.filePath);
    return decryptBuffer(raw, this.encryptionSecret());
  }

  private async loadAll(): Promise<MedicalRecordEntity[]> {
    return this.store.read<MedicalRecordEntity[]>(RECORDS_FILE, []);
  }

  private async saveAll(records: MedicalRecordEntity[]): Promise<void> {
    await this.store.write(RECORDS_FILE, records);
  }

  async findById(id: string): Promise<MedicalRecordEntity | undefined> {
    const records = await this.loadAll();
    return records.find((r) => r.id === id);
  }

  /** Patient peut supprimer uniquement ses imports (pas les docs médecin) */
  async deletePatientImport(
    user: UserEntity,
    recordId: string,
  ): Promise<{ ok: true }> {
    if (user.role !== Role.Patient) {
      throw new ForbiddenException('Réservé au patient');
    }
    const records = await this.loadAll();
    const index = records.findIndex((r) => r.id === recordId);
    if (index === -1) throw new NotFoundException('Document introuvable');
    const record = records[index]!;
    if (record.ownerId !== user.id) throw new ForbiddenException();
    if (record.kind !== 'patient_upload') {
      throw new ForbiddenException(
        'Tu ne peux supprimer que les fiches que tu as importées',
      );
    }
    records.splice(index, 1);
    await this.saveAll(records);
    try {
      const { unlink } = await import('node:fs/promises');
      await unlink(record.filePath);
    } catch {
      /* fichier déjà absent */
    }
    await this.auditService.appendFromApp({
      eventType: 'DocumentUploaded',
      actorId: user.id,
      patientId: user.id,
      documentHash: record.contentHash,
      metadata: `deleted-import:${record.title}`,
    });
    return { ok: true };
  }

  async anchorNft(
    user: UserEntity,
    recordId: string,
    input: { tokenId: number; mintTxHash: string; nftContract?: string },
  ): Promise<MedicalRecordEntity> {
    const records = await this.loadAll();
    const index = records.findIndex((r) => r.id === recordId);
    if (index === -1) throw new NotFoundException('Record not found');
    const record = records[index]!;
    const isOwner = record.ownerId === user.id;
    const isIssuer =
      user.role === Role.Doctor && record.issuedByDoctorId === user.id;
    if (!isOwner && !isIssuer && user.role !== Role.Admin) {
      throw new ForbiddenException(
        'Seul le patient ou le médecin émetteur peut ancrer le NFT',
      );
    }
    record.tokenId = input.tokenId;
    record.mintTxHash = input.mintTxHash;
    if (input.nftContract) record.nftContract = input.nftContract;
    records[index] = record;
    await this.saveAll(records);
    return record;
  }

  /** Dossier médical racine créé à l’inscription patient */
  async ensurePatientDossier(patient: UserEntity): Promise<MedicalRecordEntity> {
    if (patient.role !== Role.Patient) {
      throw new ForbiddenException('Dossier réservé aux patients');
    }
    const records = await this.loadAll();
    const existing = records.find(
      (r) => r.ownerId === patient.id && r.kind === 'dossier',
    );
    if (existing) return existing;

    await mkdir(this.uploadsDir, { recursive: true });
    const id = uuidv4();
    const storedName = `${id}.dossier.enc`;
    const filePath = join(this.uploadsDir, storedName);
    const placeholder = Buffer.from(
      `Dossier médical · ${patient.displayName}\nCréé le ${new Date().toISOString()}`,
      'utf8',
    );
    const stored = await this.persistEncrypted(filePath, placeholder);
    const record: MedicalRecordEntity = {
      id,
      ownerId: patient.id,
      title: `Dossier médical — ${patient.displayName}`,
      description: 'Dossier créé automatiquement à l’inscription',
      fileName: storedName,
      originalName: 'dossier.txt',
      mimeType: 'text/plain',
      filePath,
      contentHash: stored.contentHash,
      sizeBytes: placeholder.length,
      uploadedAt: new Date().toISOString(),
      kind: 'dossier',
      encrypted: stored.encrypted,
      contentCid: stored.contentCid,
      category: 'autre',
    };
    records.push(record);
    await this.saveAll(records);
    await this.auditService.appendFromApp({
      eventType: 'DocumentUploaded',
      actorId: patient.id,
      patientId: patient.id,
      documentHash: stored.contentHash,
      metadata: `dossier:${patient.displayName}`,
    });
    return record;
  }

  /**
   * Import patient (ex. ordo pour pharmacie).
   * N’apparaît pas dans le dossier clinique lecture seule (filtré côté UI).
   */
  async createFromUpload(
    owner: UserEntity,
    file: Express.Multer.File,
    meta: { title: string; description?: string },
  ): Promise<MedicalRecordEntity> {
    if (owner.role !== Role.Patient) {
      throw new ForbiddenException(
        'Import réservé au patient. Le médecin utilise Envoi.',
      );
    }
    await this.ensurePatientDossier(owner);
    await mkdir(this.uploadsDir, { recursive: true });
    const id = uuidv4();
    const ext = extname(file.originalname) || '';
    const storedName = `${id}${ext}.enc`;
    const filePath = join(this.uploadsDir, storedName);
    const stored = await this.persistEncrypted(filePath, file.buffer);
    const title =
      meta.title?.trim() ||
      file.originalname.replace(/\.[^.]+$/, '') ||
      'Ordonnance importée';

    const record: MedicalRecordEntity = {
      id,
      ownerId: owner.id,
      title,
      description: meta.description ?? 'Import patient · pharmacie',
      fileName: storedName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      filePath,
      contentHash: stored.contentHash,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      kind: 'patient_upload',
      encrypted: stored.encrypted,
      contentCid: stored.contentCid,
      category: this.inferCategory(title),
    };
    const records = await this.loadAll();
    records.push(record);
    await this.saveAll(records);

    await this.auditService.appendFromApp({
      eventType: 'DocumentUploaded',
      actorId: owner.id,
      patientId: owner.id,
      documentHash: stored.contentHash,
      metadata: `import-pharma:${title}|${stored.contentCid}`,
    });

    return record;
  }

  async listMine(user: UserEntity): Promise<MedicalRecordEntity[]> {
    const records = await this.loadAll();
    return records.filter((r) => r.ownerId === user.id);
  }

  /** Docs envoyés par le médecin (ordo / certificat) */
  async listIssuedByDoctor(doctor: UserEntity): Promise<MedicalRecordEntity[]> {
    const records = await this.loadAll();
    return records.filter((r) => r.issuedByDoctorId === doctor.id);
  }

  async issueToPatient(
    doctor: UserEntity,
    file: Express.Multer.File,
    meta: {
      patientId: string;
      title: string;
      description?: string;
      issueTxHash?: string;
      signOnChain?: boolean;
    },
  ): Promise<MedicalRecordEntity> {
    if (doctor.role !== Role.Doctor) {
      throw new ForbiddenException('Only doctors can issue documents');
    }
    const patient = await this.usersService.findById(meta.patientId);
    if (!patient || patient.role !== Role.Patient) {
      throw new BadRequestException('Invalid patient');
    }
    // Le médecin peut toujours envoyer ordo / certificat / doc au patient
    await this.ensurePatientDossier(patient);
    await mkdir(this.uploadsDir, { recursive: true });
    const id = uuidv4();
    const ext = extname(file.originalname) || '';
    const storedName = `${id}${ext}.enc`;
    const filePath = join(this.uploadsDir, storedName);
    const stored = await this.persistEncrypted(filePath, file.buffer);

    let issueTxHash = meta.issueTxHash;
    if (meta.signOnChain && !issueTxHash) {
      const kind = meta.title.toLowerCase().includes('certificat')
        ? 'certificat'
        : meta.title.toLowerCase().includes('compte')
          ? 'compte_rendu'
          : 'ordonnance';
      const onChain = await this.blockchain.issueDocumentServerSide({
        doctorWallet: doctor.walletAddress,
        patientWallet: patient.walletAddress,
        docHash: stored.contentHash,
        kind,
      });
      issueTxHash = onChain.txHash;
      if (
        !doctor.walletAddress ||
        doctor.walletAddress.toLowerCase() !== onChain.doctorWallet
      ) {
        await this.usersService.updateProfile(doctor.id, {
          walletAddress: onChain.doctorWallet,
        });
      }
      if (
        !patient.walletAddress ||
        patient.walletAddress.toLowerCase() !== onChain.patientWallet
      ) {
        await this.usersService.updateProfile(patient.id, {
          walletAddress: onChain.patientWallet,
        });
      }
    }

    const record: MedicalRecordEntity = {
      id,
      ownerId: patient.id,
      title: meta.title,
      description: meta.description,
      fileName: storedName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      filePath,
      contentHash: stored.contentHash,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      kind: 'doctor_issue',
      issuedByDoctorId: doctor.id,
      issueTxHash,
      encrypted: stored.encrypted,
      contentCid: stored.contentCid,
      category: this.inferCategory(meta.title),
    };
    const records = await this.loadAll();
    records.push(record);
    await this.saveAll(records);

    await this.auditService.appendFromApp({
      eventType: 'DocumentUploaded',
      actorId: doctor.id,
      patientId: patient.id,
      doctorId: doctor.id,
      documentHash: stored.contentHash,
      metadata: `issued:${meta.title}|${stored.contentCid}`,
      txHash: issueTxHash,
    });

    return record;
  }

  /**
   * Dossier médical complet d’un patient pour un médecin
   * qui a déjà une consultation (MediChainPay Locked/Released).
   */
  async listPatientDossierForDoctor(
    doctor: UserEntity,
    patientId: string,
  ): Promise<MedicalRecordEntity[]> {
    if (doctor.role !== Role.Doctor && doctor.role !== Role.Admin) {
      throw new ForbiddenException();
    }
    const patient = await this.usersService.findById(patientId);
    if (!patient || patient.role !== Role.Patient) {
      throw new BadRequestException('Invalid patient');
    }
    if (doctor.role === Role.Doctor) {
      const consulted = await this.blockchain.hasConsultationBetween(
        patient.walletAddress,
        doctor.walletAddress,
      );
      if (!consulted) {
        throw new ForbiddenException(
          'Consultation requise pour ouvrir le dossier complet de ce patient',
        );
      }
    }
    await this.ensurePatientDossier(patient);
    const records = await this.loadAll();
    return records
      .filter((r) => r.ownerId === patient.id)
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
  }

  async listSharedWithDoctor(
    doctor: UserEntity,
  ): Promise<MedicalRecordEntity[]> {
    const incoming = await this.accessService.listIncoming(doctor);
    const now = Date.now() / 1000;
    const activeRecordIds = new Set(
      incoming
        .filter((g) => g.status === 'active' && now >= g.startsAt && now <= g.endsAt)
        .map((g) => g.recordId),
    );
    const records = await this.loadAll();
    const shared = records.filter((r) => activeRecordIds.has(r.id));
    const issued =
      doctor.role === Role.Doctor
        ? records.filter((r) => r.issuedByDoctorId === doctor.id)
        : [];
    const byId = new Map<string, MedicalRecordEntity>();
    for (const r of [...shared, ...issued]) byId.set(r.id, r);
    return [...byId.values()];
  }

  async getByIdForUser(
    id: string,
    user: UserEntity,
  ): Promise<MedicalRecordEntity> {
    const record = await this.findById(id);
    if (!record) {
      throw new NotFoundException('Record not found');
    }
    const allowed = await this.accessService.canAccessRecord(user, id);
    if (!allowed) {
      await this.auditService.appendFromApp({
        eventType: 'AccessDenied',
        actorId: user.id,
        patientId: record.ownerId,
        doctorId: user.role === Role.Doctor ? user.id : undefined,
        documentHash: record.contentHash,
        metadata: `denied:${id}`,
      });
      throw new ForbiddenException('Access denied');
    }

    if (user.role === Role.Doctor) {
      await this.auditService.appendFromApp({
        eventType: 'DocumentAccessed',
        actorId: user.id,
        patientId: record.ownerId,
        doctorId: user.id,
        documentHash: record.contentHash,
        metadata: record.title,
      });
    }

    return record;
  }
}
