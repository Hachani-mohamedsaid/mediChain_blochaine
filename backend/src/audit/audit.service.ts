import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JsonStoreService } from '../common/persistence/json-store.service.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import { UsersService } from '../users/users.service.js';
import type { AuditEntryEntity } from './audit-entry.entity.js';
import type { UserEntity } from '../users/user.entity.js';
import { Role } from '../common/enums/role.enum.js';

const AUDIT_FILE = 'audit.json';

@Injectable()
export class AuditService {
  constructor(
    private readonly store: JsonStoreService,
    private readonly blockchain: BlockchainService,
    private readonly usersService: UsersService,
  ) {}

  private async loadAll(): Promise<AuditEntryEntity[]> {
    return this.store.read<AuditEntryEntity[]>(AUDIT_FILE, []);
  }

  private async saveAll(entries: AuditEntryEntity[]): Promise<void> {
    await this.store.write(AUDIT_FILE, entries);
  }

  async appendFromApp(input: {
    eventType: string;
    actorId: string;
    patientId?: string;
    doctorId?: string;
    grantId?: string;
    chainGrantId?: number;
    documentHash?: string;
    metadata?: string;
    txHash?: string;
  }): Promise<AuditEntryEntity> {
    const actor = await this.usersService.findById(input.actorId);
    const patient = input.patientId
      ? await this.usersService.findById(input.patientId)
      : undefined;
    const doctor = input.doctorId
      ? await this.usersService.findById(input.doctorId)
      : undefined;

    if (this.blockchain.getMode() === 'mock') {
      await this.blockchain.logAuditMock({
        eventType: input.eventType,
        actor: actor?.walletAddress ?? input.actorId,
        patient:
          patient?.walletAddress ??
          '0x0000000000000000000000000000000000000000',
        doctor:
          doctor?.walletAddress ??
          '0x0000000000000000000000000000000000000000',
        grantId: input.chainGrantId ?? 0,
        documentHash: input.documentHash ?? '0x' + '0'.repeat(64),
        metadata: input.metadata ?? '',
      });
    }

    const entry: AuditEntryEntity = {
      id: uuidv4(),
      eventType: input.eventType,
      actorId: input.actorId,
      patientId: input.patientId,
      doctorId: input.doctorId,
      grantId: input.grantId,
      chainGrantId: input.chainGrantId,
      documentHash: input.documentHash,
      metadata: input.metadata,
      timestamp: Math.floor(Date.now() / 1000),
      txHash: input.txHash,
    };
    const entries = await this.loadAll();
    entries.push(entry);
    await this.saveAll(entries);
    return entry;
  }

  async listMine(user: UserEntity): Promise<AuditEntryEntity[]> {
    const entries = await this.loadAll();
    if (user.role === Role.Admin) {
      return entries;
    }
    return entries.filter(
      (e) =>
        e.actorId === user.id ||
        e.patientId === user.id ||
        e.doctorId === user.id,
    );
  }

  /** Historique patient pour un médecin ayant consulté */
  async listPatientHistory(
    doctor: UserEntity,
    patientId: string,
  ): Promise<AuditEntryEntity[]> {
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
          'Consultation requise pour voir l’historique de ce patient',
        );
      }
    }
    const entries = await this.loadAll();
    return entries
      .filter((e) => e.patientId === patient.id)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async getChain(user: UserEntity) {
    if (user.role !== Role.Admin) {
      const appEntries = await this.listMine(user);
      const chain = this.blockchain.getMockAuditForWallet(
        user.walletAddress ?? user.id,
      );
      return { app: appEntries, chain };
    }
    const appEntries = await this.loadAll();
    const chain = this.blockchain.getMockAuditChain();
    return { app: appEntries, chain };
  }
}
