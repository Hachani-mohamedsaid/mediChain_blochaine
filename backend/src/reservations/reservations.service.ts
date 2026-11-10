import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JsonStoreService } from '../common/persistence/json-store.service.js';
import { Role } from '../common/enums/role.enum.js';
import { UsersService } from '../users/users.service.js';
import type { UserEntity } from '../users/user.entity.js';
import type {
  ReservationEntity,
  ReservationStatus,
} from './reservation.entity.js';

const FILE = 'reservations.json';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly store: JsonStoreService,
    private readonly users: UsersService,
  ) {}

  private async load(): Promise<ReservationEntity[]> {
    return this.store.read<ReservationEntity[]>(FILE, []);
  }

  private async save(rows: ReservationEntity[]): Promise<void> {
    await this.store.write(FILE, rows);
  }

  async create(
    patient: UserEntity,
    input: { doctorId: string; memo?: string; feeEth: string },
  ): Promise<ReservationEntity> {
    if (patient.role !== Role.Patient) {
      throw new ForbiddenException('Réservation réservée aux patients');
    }
    const fee = Number(input.feeEth);
    if (!Number.isFinite(fee) || fee <= 0) {
      throw new BadRequestException('Tarif médecin manquant ou invalide');
    }
    const doctor = await this.users.findById(input.doctorId);
    if (!doctor || doctor.role !== Role.Doctor) {
      throw new BadRequestException('Médecin introuvable');
    }
    if (!doctor.walletAddress) {
      throw new BadRequestException('Médecin sans wallet');
    }

    const rows = await this.load();
    const duplicate = rows.find(
      (r) =>
        r.patientId === patient.id &&
        r.doctorId === doctor.id &&
        (r.status === 'pending' || r.status === 'accepted'),
    );
    if (duplicate) {
      throw new BadRequestException(
        'Une demande est déjà en cours avec ce médecin',
      );
    }

    const row: ReservationEntity = {
      id: uuidv4(),
      patientId: patient.id,
      doctorId: doctor.id,
      patientName: patient.displayName,
      doctorName: doctor.displayName,
      memo: input.memo?.trim() || 'Consultation',
      feeEth: input.feeEth,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    rows.unshift(row);
    await this.save(rows);
    return row;
  }

  async listMine(user: UserEntity): Promise<ReservationEntity[]> {
    const rows = await this.load();
    if (user.role === Role.Patient) {
      return rows.filter((r) => r.patientId === user.id);
    }
    if (user.role === Role.Doctor) {
      return rows.filter((r) => r.doctorId === user.id);
    }
    return [];
  }

  async accept(doctor: UserEntity, id: string): Promise<ReservationEntity> {
    return this.setStatus(doctor, id, 'accepted');
  }

  async reject(doctor: UserEntity, id: string): Promise<ReservationEntity> {
    return this.setStatus(doctor, id, 'rejected');
  }

  async cancel(patient: UserEntity, id: string): Promise<ReservationEntity> {
    if (patient.role !== Role.Patient) throw new ForbiddenException();
    const rows = await this.load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundException('Demande introuvable');
    const row = rows[idx];
    if (row.patientId !== patient.id) throw new ForbiddenException();
    if (row.status !== 'pending' && row.status !== 'accepted') {
      throw new BadRequestException('Impossible d’annuler cette demande');
    }
    row.status = 'cancelled';
    rows[idx] = row;
    await this.save(rows);
    return row;
  }

  async markPaid(
    patient: UserEntity,
    id: string,
    meta: { paymentId: number; txHash: string },
  ): Promise<ReservationEntity> {
    if (patient.role !== Role.Patient) throw new ForbiddenException();
    const rows = await this.load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundException('Demande introuvable');
    const row = rows[idx];
    if (row.patientId !== patient.id) throw new ForbiddenException();
    if (row.status !== 'accepted') {
      throw new BadRequestException(
        'Paiement possible seulement après acceptation du médecin',
      );
    }
    row.status = 'paid';
    row.paidAt = new Date().toISOString();
    row.paymentId = meta.paymentId;
    row.txHash = meta.txHash;
    rows[idx] = row;
    await this.save(rows);
    return row;
  }

  private async setStatus(
    doctor: UserEntity,
    id: string,
    status: Extract<ReservationStatus, 'accepted' | 'rejected'>,
  ): Promise<ReservationEntity> {
    if (doctor.role !== Role.Doctor) throw new ForbiddenException();
    const rows = await this.load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundException('Demande introuvable');
    const row = rows[idx];
    if (row.doctorId !== doctor.id) throw new ForbiddenException();
    if (row.status !== 'pending') {
      throw new BadRequestException('Cette demande n’est plus en attente');
    }
    row.status = status;
    if (status === 'accepted') row.acceptedAt = new Date().toISOString();
    if (status === 'rejected') row.rejectedAt = new Date().toISOString();
    rows[idx] = row;
    await this.save(rows);
    return row;
  }
}
