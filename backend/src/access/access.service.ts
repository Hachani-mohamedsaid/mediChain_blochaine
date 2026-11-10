import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JsonStoreService } from '../common/persistence/json-store.service.js';
import { Role } from '../common/enums/role.enum.js';
import { UsersService } from '../users/users.service.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { MedicalRecordEntity } from '../records/record.entity.js';
import type { AccessGrantEntity, GrantStatus } from './access-grant.entity.js';
import type { GrantAccessDto } from './dto/grant-access.dto.js';
import type { UserEntity } from '../users/user.entity.js';

const GRANTS_FILE = 'grants.json';
const RECORDS_FILE = 'records.json';
const DEFAULT_DURATION = 7 * 24 * 60 * 60;

@Injectable()
export class AccessService implements OnModuleInit {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    private readonly store: JsonStoreService,
    private readonly usersService: UsersService,
    private readonly blockchain: BlockchainService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.hydrateChainMemory();
  }

  /** Resync mémoire blockchain depuis grants confirmés (après restart API) */
  private async hydrateChainMemory(): Promise<void> {
    const grants = await this.loadAll();
    let n = 0;
    for (const g of grants) {
      if (!g.grantTxHash || !g.chainGrantId) continue;
      const patient = await this.usersService.findById(g.patientId);
      const doctor = await this.usersService.findById(g.doctorId);
      if (!patient?.walletAddress || !doctor?.walletAddress) continue;
      this.blockchain.rememberOnChainGrant({
        grantId: g.chainGrantId,
        patient: patient.walletAddress,
        doctor: doctor.walletAddress,
        documentHash: g.documentHash,
        expiresAt: g.endsAt,
        txHash: g.grantTxHash,
      });
      if (g.status === 'revoked') {
        const mem = this.blockchain
          .getMockLedger()
          .grants.find((x) => x.grantId === g.chainGrantId);
        if (mem) mem.status = 'Revoked';
      }
      n += 1;
    }
    if (n) this.logger.log(`Hydrated ${n} on-chain grants into memory`);
  }

  private async loadAll(): Promise<AccessGrantEntity[]> {
    return this.store.read<AccessGrantEntity[]>(GRANTS_FILE, []);
  }

  private async findRecord(
    recordId: string,
  ): Promise<MedicalRecordEntity | undefined> {
    const records = await this.store.read<MedicalRecordEntity[]>(
      RECORDS_FILE,
      [],
    );
    return records.find((r) => r.id === recordId);
  }

  private async saveAll(grants: AccessGrantEntity[]): Promise<void> {
    await this.store.write(GRANTS_FILE, grants);
  }

  private syncStatus(grant: AccessGrantEntity): GrantStatus {
    if (grant.status === 'active' && Date.now() / 1000 > grant.endsAt) {
      grant.status = 'expired';
    }
    return grant.status;
  }

  async grantAccess(patient: UserEntity, dto: GrantAccessDto) {
    if (patient.role !== Role.Patient && patient.role !== Role.Admin) {
      throw new ForbiddenException();
    }
    const record = await this.findRecord(dto.recordId);
    if (!record) {
      throw new NotFoundException('Record not found');
    }
    if (patient.role === Role.Patient && record.ownerId !== patient.id) {
      throw new ForbiddenException('Not your record');
    }
    const patientUser =
      patient.role === Role.Admin
        ? await this.usersService.findById(record.ownerId)
        : patient;
    if (!patientUser) {
      throw new NotFoundException('Patient owner not found');
    }
    const doctor = await this.usersService.findById(dto.doctorId);
    if (
      !doctor ||
      (doctor.role !== Role.Doctor && doctor.role !== Role.Pharmacy)
    ) {
      throw new BadRequestException('Invalid doctor or pharmacy');
    }
    if (!patientUser.walletAddress || !doctor.walletAddress) {
      throw new BadRequestException(
        'Patient and grantee must have wallet addresses',
      );
    }
    const duration = dto.durationSeconds ?? DEFAULT_DURATION;
    const startsAt = Math.floor(Date.now() / 1000);
    const endsAt = startsAt + duration;

    let grantId: number;
    let txHash: string;

    if (doctor.role === Role.Pharmacy) {
      // Accès fichier API ; preuve médicament = MediChainPharmacy (share/dispense)
      grantId = Date.now() % 1_000_000_000;
      txHash = `pharmacy-grant-${grantId}`;
    } else if (dto.chainGrantId && dto.grantTxHash) {
      // MetaMask a déjà signé grantAccess
      grantId = dto.chainGrantId;
      txHash = dto.grantTxHash;
      this.blockchain.markPatientRegistered(patientUser.walletAddress);
      await this.usersService.markRegisteredOnChain(
        patientUser.id,
        txHash,
      );
      this.blockchain.rememberOnChainGrant({
        grantId,
        patient: patientUser.walletAddress,
        doctor: doctor.walletAddress,
        documentHash: record.contentHash,
        expiresAt: endsAt,
        txHash,
      });
    } else {
      if (!this.blockchain.isPatientRegistered(patientUser.walletAddress)) {
        const { didHash } = await this.blockchain.registerPatient(
          patientUser.walletAddress,
          patientUser.displayName,
          patientUser.id,
        );
        await this.usersService.markRegisteredOnChain(patientUser.id, didHash);
      }
      const onChain = await this.blockchain.grantAccessOnChain({
        patientWallet: patientUser.walletAddress,
        doctorWallet: doctor.walletAddress,
        documentHash: record.contentHash,
        startsAt,
        endsAt,
        purpose: dto.purpose,
      });
      grantId = onChain.grantId;
      txHash = onChain.txHash;
    }

    const onChainConfirmed = Boolean(dto.chainGrantId && dto.grantTxHash);
    const grant: AccessGrantEntity = {
      id: uuidv4(),
      chainGrantId: grantId,
      patientId: patientUser.id,
      doctorId: doctor.id,
      recordId: record.id,
      documentHash: record.contentHash,
      startsAt,
      endsAt,
      status: 'active',
      purpose: dto.emergency
        ? `[URGENCE] ${dto.purpose}${dto.emergencyReason ? ` — ${dto.emergencyReason}` : ''}`
        : dto.purpose,
      grantTxHash: txHash,
      createdAt: new Date().toISOString(),
      permissions: dto.permissions?.length
        ? dto.permissions
        : ['read', 'download'],
      emergency: dto.emergency ?? false,
      emergencyReason: dto.emergencyReason,
      onChainConfirmed,
    };
    const grants = await this.loadAll();
    grants.push(grant);
    await this.saveAll(grants);

    await this.auditService.appendFromApp({
      eventType: 'GrantCreated',
      actorId: patient.id,
      patientId: patientUser.id,
      doctorId: doctor.id,
      grantId: grant.id,
      chainGrantId: grantId,
      documentHash: record.contentHash,
      metadata: dto.purpose,
      txHash,
    });

    return grant;
  }

  async revokeAccess(
    grantId: string,
    user: UserEntity,
    revokeTxHash?: string,
  ) {
    const grants = await this.loadAll();
    const index = grants.findIndex((g) => g.id === grantId);
    if (index === -1) {
      throw new NotFoundException('Grant not found');
    }
    const grant = grants[index]!;
    this.syncStatus(grant);
    if (grant.status !== 'active') {
      throw new BadRequestException('Grant is not active');
    }
    if (
      user.role !== Role.Admin &&
      user.id !== grant.patientId
    ) {
      throw new ForbiddenException();
    }
    const patient = await this.usersService.findById(grant.patientId);
    if (!patient?.walletAddress) {
      throw new BadRequestException('Patient wallet missing');
    }
    let txHash = revokeTxHash;
    if (!txHash) {
      const onChain = await this.blockchain.revokeAccessOnChain(
        grant.chainGrantId,
        patient.walletAddress,
      );
      txHash = onChain.txHash;
    } else {
      const mem = this.blockchain
        .getMockLedger()
        .grants.find((g) => g.grantId === grant.chainGrantId);
      if (mem) mem.status = 'Revoked';
    }
    grant.status = 'revoked';
    grant.revokeTxHash = txHash;
    grants[index] = grant;
    await this.saveAll(grants);

    await this.auditService.appendFromApp({
      eventType: 'GrantRevoked',
      actorId: user.id,
      patientId: grant.patientId,
      doctorId: grant.doctorId,
      grantId: grant.id,
      chainGrantId: grant.chainGrantId,
      documentHash: grant.documentHash,
      metadata: 'revoked',
      txHash,
    });

    return grant;
  }

  async listMine(user: UserEntity) {
    const grants = await this.loadAll();
    return grants
      .filter((g) => g.patientId === user.id)
      .map((g) => {
        this.syncStatus(g);
        return g;
      });
  }

  async listIncoming(user: UserEntity) {
    const grants = await this.loadAll();
    return grants
      .filter((g) => g.doctorId === user.id)
      .map((g) => {
        this.syncStatus(g);
        return g;
      });
  }

  async canAccessRecord(
    user: UserEntity,
    recordId: string,
  ): Promise<boolean> {
    const record = await this.findRecord(recordId);
    if (!record) {
      return false;
    }
    if (user.role === Role.Admin || record.ownerId === user.id) {
      return true;
    }
    if (
      user.role === Role.Doctor &&
      record.issuedByDoctorId === user.id
    ) {
      return true;
    }
    if (
      (user.role !== Role.Doctor && user.role !== Role.Pharmacy) ||
      !user.walletAddress
    ) {
      return false;
    }
    const owner = await this.usersService.findById(record.ownerId);
    if (!owner?.walletAddress) {
      return false;
    }
    // Médecin après consultation : dossier patient complet (historique inclus)
    if (user.role === Role.Doctor) {
      const consulted = await this.blockchain.hasConsultationBetween(
        owner.walletAddress,
        user.walletAddress,
      );
      if (consulted) return true;
    }
    if (
      user.role === Role.Doctor &&
      this.blockchain.hasAccessOnChain(
        user.walletAddress,
        owner.walletAddress,
        record.contentHash,
      )
    ) {
      return true;
    }
    const grants = await this.loadAll();
    const now = Date.now() / 1000;
    return grants.some((g) => {
      this.syncStatus(g);
      return (
        g.recordId === recordId &&
        g.doctorId === user.id &&
        g.status === 'active' &&
        now >= g.startsAt &&
        now <= g.endsAt
      );
    });
  }
}
