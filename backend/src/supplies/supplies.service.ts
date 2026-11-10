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
import type { SupplyEntity } from './supply.entity.js';

const FILE = 'supplies.json';

@Injectable()
export class SuppliesService {
  constructor(
    private readonly store: JsonStoreService,
    private readonly users: UsersService,
  ) {}

  private async load(): Promise<SupplyEntity[]> {
    return this.store.read<SupplyEntity[]>(FILE, []);
  }

  private async save(rows: SupplyEntity[]): Promise<void> {
    await this.store.write(FILE, rows);
  }

  async create(
    supplier: UserEntity,
    input: {
      pharmacyId: string;
      medicineId: string;
      medicineName: string;
      quantity: number;
      location?: string;
      txHash?: string;
      autoReceive?: boolean;
    },
  ): Promise<SupplyEntity> {
    if (supplier.role !== Role.Supplier) {
      throw new ForbiddenException('Réservé au fournisseur');
    }
    if (!Number.isFinite(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('Quantité invalide');
    }
    const pharmacy = await this.users.findById(input.pharmacyId);
    if (!pharmacy || pharmacy.role !== Role.Pharmacy) {
      throw new BadRequestException('Pharmacie introuvable');
    }

    const received = Boolean(input.autoReceive);
    const row: SupplyEntity = {
      id: uuidv4(),
      supplierId: supplier.id,
      supplierName: supplier.displayName,
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.displayName,
      medicineId: input.medicineId,
      medicineName: input.medicineName,
      quantity: input.quantity,
      location: input.location?.trim() || '—',
      status: received ? 'received' : 'sent',
      createdAt: new Date().toISOString(),
      receivedAt: received ? new Date().toISOString() : undefined,
      txHash: input.txHash,
    };
    const rows = await this.load();
    rows.unshift(row);
    await this.save(rows);
    return row;
  }

  async listMine(user: UserEntity): Promise<SupplyEntity[]> {
    const rows = await this.load();
    if (user.role === Role.Supplier) {
      return rows.filter((r) => r.supplierId === user.id);
    }
    if (user.role === Role.Pharmacy) {
      return rows.filter((r) => r.pharmacyId === user.id);
    }
    return [];
  }

  async receive(pharmacy: UserEntity, id: string): Promise<SupplyEntity> {
    if (pharmacy.role !== Role.Pharmacy) throw new ForbiddenException();
    const rows = await this.load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundException('Livraison introuvable');
    const row = rows[idx];
    if (row.pharmacyId !== pharmacy.id) throw new ForbiddenException();
    if (row.status !== 'sent') {
      throw new BadRequestException('Déjà traitée');
    }
    row.status = 'received';
    row.receivedAt = new Date().toISOString();
    rows[idx] = row;
    await this.save(rows);
    return row;
  }
}
