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
import type { SupplierProductEntity } from './supplier-product.entity.js';

const FILE = 'supplier-products.json';

/** Catalogue démo initial (même ids que le frontend MEDICINES) */
const DEFAULT_CATALOG: Omit<
  SupplierProductEntity,
  'id' | 'supplierId' | 'createdAt' | 'updatedAt'
>[] = [
  {
    medicineId: 'paracetamol-500',
    name: 'Paracétamol 500 mg',
    form: 'Boîte 16 comprimés',
    category: 'Antalgique',
    quantity: 100,
    priceMct: 8,
  },
  {
    medicineId: 'amoxicilline-1g',
    name: 'Amoxicilline 1 g',
    form: 'Boîte 14 sachets',
    category: 'Antibiotique',
    quantity: 80,
    priceMct: 22,
  },
  {
    medicineId: 'ibuprofene-400',
    name: 'Ibuprofène 400 mg',
    form: 'Boîte 20 comprimés',
    category: 'Anti-inflammatoire',
    quantity: 90,
    priceMct: 12,
  },
  {
    medicineId: 'ventoline',
    name: 'Salbutamol (Ventoline)',
    form: 'Aérosol 200 doses',
    category: 'Respiratoire',
    quantity: 40,
    priceMct: 35,
  },
  {
    medicineId: 'omeprazole-20',
    name: 'Oméprazole 20 mg',
    form: 'Boîte 14 gélules',
    category: 'Digestif',
    quantity: 60,
    priceMct: 18,
  },
  {
    medicineId: 'vitamine-d',
    name: 'Vitamine D3 100 000 UI',
    form: 'Ampoule buvable',
    category: 'Vitamines',
    quantity: 70,
    priceMct: 15,
  },
  {
    medicineId: 'insuline',
    name: 'Insuline rapide',
    form: 'Stylo 3 ml',
    category: 'Diabète',
    quantity: 30,
    priceMct: 45,
  },
  {
    medicineId: 'aspirine-100',
    name: 'Aspirine Protect 100 mg',
    form: 'Boîte 30 comprimés',
    category: 'Cardio',
    quantity: 100,
    priceMct: 10,
  },
];

@Injectable()
export class SupplierProductsService {
  constructor(
    private readonly store: JsonStoreService,
    private readonly users: UsersService,
  ) {}

  private async load(): Promise<SupplierProductEntity[]> {
    return this.store.read<SupplierProductEntity[]>(FILE, []);
  }

  private async save(rows: SupplierProductEntity[]): Promise<void> {
    await this.store.write(FILE, rows);
  }

  private slugify(name: string): string {
    return (
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'produit'
    );
  }

  private async ensureDefaults(
    supplierId: string,
  ): Promise<SupplierProductEntity[]> {
    const rows = await this.load();
    const mine = rows.filter((r) => r.supplierId === supplierId);
    if (mine.length > 0) return mine;

    const now = new Date().toISOString();
    const seeded = DEFAULT_CATALOG.map((p) => ({
      id: uuidv4(),
      supplierId,
      ...p,
      createdAt: now,
      updatedAt: now,
    }));
    rows.unshift(...seeded);
    await this.save(rows);
    return seeded;
  }

  async listMine(user: UserEntity): Promise<SupplierProductEntity[]> {
    if (user.role !== Role.Supplier) {
      throw new ForbiddenException('Réservé au fournisseur');
    }
    return this.ensureDefaults(user.id);
  }

  async listBySupplier(
    requester: UserEntity,
    supplierId: string,
  ): Promise<SupplierProductEntity[]> {
    if (
      requester.role !== Role.Pharmacy &&
      requester.role !== Role.Supplier &&
      requester.role !== Role.Admin
    ) {
      throw new ForbiddenException();
    }
    const supplier = await this.users.findById(supplierId);
    if (!supplier || supplier.role !== Role.Supplier) {
      throw new BadRequestException('Fournisseur introuvable');
    }
    if (requester.role === Role.Supplier && requester.id !== supplierId) {
      throw new ForbiddenException();
    }
    return this.ensureDefaults(supplierId);
  }

  async create(
    user: UserEntity,
    input: {
      name: string;
      form?: string;
      category?: string;
      quantity: number;
      priceMct?: number;
      medicineId?: string;
    },
  ): Promise<SupplierProductEntity> {
    if (user.role !== Role.Supplier) {
      throw new ForbiddenException('Réservé au fournisseur');
    }
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Nom requis');
    if (!Number.isFinite(input.quantity) || input.quantity < 0) {
      throw new BadRequestException('Quantité invalide');
    }

    await this.ensureDefaults(user.id);
    const now = new Date().toISOString();
    const medicineId =
      input.medicineId?.trim() ||
      `${this.slugify(name)}-${Date.now().toString(36)}`;

    const row: SupplierProductEntity = {
      id: uuidv4(),
      supplierId: user.id,
      medicineId,
      name,
      form: input.form?.trim() || 'Unité',
      category: input.category?.trim() || 'Divers',
      quantity: Math.floor(input.quantity),
      priceMct: Number.isFinite(input.priceMct)
        ? Math.max(0, Number(input.priceMct))
        : 10,
      createdAt: now,
      updatedAt: now,
    };

    const rows = await this.load();
    rows.unshift(row);
    await this.save(rows);
    return row;
  }

  async update(
    user: UserEntity,
    id: string,
    input: {
      name?: string;
      form?: string;
      category?: string;
      quantity?: number;
      priceMct?: number;
    },
  ): Promise<SupplierProductEntity> {
    if (user.role !== Role.Supplier) throw new ForbiddenException();
    const rows = await this.load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundException('Produit introuvable');
    const row = rows[idx];
    if (row.supplierId !== user.id) throw new ForbiddenException();

    if (input.name !== undefined) {
      const n = input.name.trim();
      if (!n) throw new BadRequestException('Nom requis');
      row.name = n;
    }
    if (input.form !== undefined) row.form = input.form.trim() || row.form;
    if (input.category !== undefined) {
      row.category = input.category.trim() || row.category;
    }
    if (input.quantity !== undefined) {
      if (!Number.isFinite(input.quantity) || input.quantity < 0) {
        throw new BadRequestException('Quantité invalide');
      }
      row.quantity = Math.floor(input.quantity);
    }
    if (input.priceMct !== undefined) {
      if (!Number.isFinite(input.priceMct) || input.priceMct < 0) {
        throw new BadRequestException('Prix invalide');
      }
      row.priceMct = Number(input.priceMct);
    }
    row.updatedAt = new Date().toISOString();
    rows[idx] = row;
    await this.save(rows);
    return row;
  }

  async remove(user: UserEntity, id: string): Promise<{ ok: true }> {
    if (user.role !== Role.Supplier) throw new ForbiddenException();
    const rows = await this.load();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new NotFoundException('Produit introuvable');
    if (rows[idx].supplierId !== user.id) throw new ForbiddenException();
    rows.splice(idx, 1);
    await this.save(rows);
    return { ok: true };
  }

  /** Décrémente le stock fournisseur après livraison SC */
  async decrementStock(
    supplierId: string,
    medicineId: string,
    qty: number,
  ): Promise<void> {
    if (qty < 1) return;
    const rows = await this.load();
    const idx = rows.findIndex(
      (r) => r.supplierId === supplierId && r.medicineId === medicineId,
    );
    if (idx < 0) return;
    rows[idx].quantity = Math.max(0, rows[idx].quantity - qty);
    rows[idx].updatedAt = new Date().toISOString();
    await this.save(rows);
  }
}
