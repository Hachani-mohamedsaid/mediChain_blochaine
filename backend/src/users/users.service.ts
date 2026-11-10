import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { JsonStoreService } from '../common/persistence/json-store.service.js';
import { Role } from '../common/enums/role.enum.js';
import type { UserEntity, PublicUser } from './user.entity.js';
import { toPublicUser } from './user.entity.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

const USERS_FILE = 'users.json';

@Injectable()
export class UsersService {
  constructor(private readonly store: JsonStoreService) {}

  private async loadAll(): Promise<UserEntity[]> {
    return this.store.read<UserEntity[]>(USERS_FILE, []);
  }

  private async saveAll(users: UserEntity[]): Promise<void> {
    await this.store.write(USERS_FILE, users);
  }

  async findById(id: string): Promise<UserEntity | undefined> {
    const users = await this.loadAll();
    return users.find((u) => u.id === id);
  }

  async findByEmail(email: string): Promise<UserEntity | undefined> {
    const users = await this.loadAll();
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  async findByWallet(wallet: string): Promise<UserEntity | undefined> {
    const w = wallet.toLowerCase();
    const users = await this.loadAll();
    const matches = users.filter(
      (u) => u.walletAddress?.toLowerCase() === w,
    );
    if (!matches.length) return undefined;
    const seedPreferred = [
      'patient@medichain.app',
      'doctor@medichain.app',
      'pharmacy@medichain.app',
    ];
    return (
      matches.find((u) => seedPreferred.includes(u.email)) ??
      matches.find(
        (u) =>
          u.email.endsWith('@medichain.app') && u.role !== Role.Admin,
      ) ??
      matches.find((u) => u.role !== Role.Admin) ??
      matches[0]
    );
  }

  async findByWalletAndRole(
    wallet: string,
    role?: Role,
  ): Promise<UserEntity | undefined> {
    if (!role) return this.findByWallet(wallet);
    const w = wallet.toLowerCase();
    const users = await this.loadAll();
    return users.find(
      (u) => u.walletAddress?.toLowerCase() === w && u.role === role,
    );
  }

  /**
   * Crée (ou renvoie) un user lié à un wallet Hardhat démo.
   * Email synthétique — auth réelle = signature wallet.
   */
  async ensureWalletUser(input: {
    walletAddress: string;
    role: Role;
    displayName: string;
  }): Promise<UserEntity> {
    const existing = await this.findByWalletAndRole(
      input.walletAddress,
      input.role,
    );
    if (existing) return existing;
    const short = input.walletAddress.slice(2, 8).toLowerCase();
    const email = `${input.role}.${short}@wallet.medichain.local`;
    const users = await this.loadAll();
    const byEmail = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    if (byEmail) {
      byEmail.walletAddress = input.walletAddress.toLowerCase();
      byEmail.role = input.role;
      byEmail.displayName = input.displayName;
      await this.saveAll(users);
      return byEmail;
    }
    const passwordHash = await bcrypt.hash(uuidv4(), 10);
    const user: UserEntity = {
      id: uuidv4(),
      email,
      passwordHash,
      role: input.role,
      displayName: input.displayName,
      walletAddress: input.walletAddress.toLowerCase(),
      registeredOnChain: false,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await this.saveAll(users);
    return user;
  }

  async createUser(input: {
    email: string;
    password: string;
    role: Role;
    displayName: string;
    walletAddress?: string;
  }): Promise<UserEntity> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(input.password, 10);
    const walletAddress =
      input.walletAddress ??
      `0x${[...Array(40)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join('')}`;
    const user: UserEntity = {
      id: uuidv4(),
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
      displayName: input.displayName,
      walletAddress,
      registeredOnChain: false,
      createdAt: new Date().toISOString(),
    };
    const users = await this.loadAll();
    users.push(user);
    await this.saveAll(users);
    return user;
  }

  async validatePassword(user: UserEntity, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<PublicUser> {
    const users = await this.loadAll();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) {
      throw new NotFoundException('User not found');
    }
    const user = users[index]!;
    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName;
    }
    if (dto.specialty !== undefined) {
      user.specialty = dto.specialty.trim() || undefined;
    }
    if (dto.walletAddress !== undefined) {
      user.walletAddress = dto.walletAddress;
    }
    users[index] = user;
    await this.saveAll(users);
    return toPublicUser(user);
  }

  async markRegisteredOnChain(
    userId: string,
    didHash: string,
  ): Promise<UserEntity> {
    const users = await this.loadAll();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) {
      throw new NotFoundException('User not found');
    }
    const user = users[index]!;
    user.registeredOnChain = true;
    user.didHash = didHash;
    users[index] = user;
    await this.saveAll(users);
    return user;
  }

  async listByRole(role: Role): Promise<PublicUser[]> {
    const users = await this.loadAll();
    const filtered = users.filter((u) => u.role === role);
    if (role !== Role.Doctor) {
      return filtered.map(toPublicUser);
    }
    // Un médecin par wallet — priorité : spécialité renseignée, puis @medichain.app
    const byWallet = new Map<string, UserEntity>();
    const noWallet: UserEntity[] = [];
    for (const u of filtered) {
      const w = u.walletAddress?.toLowerCase();
      if (!w) {
        noWallet.push(u);
        continue;
      }
      const prev = byWallet.get(w);
      if (!prev) {
        byWallet.set(w, u);
        continue;
      }
      const score = (x: UserEntity) =>
        (x.specialty ? 2 : 0) +
        (x.email.endsWith('@medichain.app') ? 1 : 0);
      if (score(u) > score(prev)) byWallet.set(w, u);
    }
    return [...byWallet.values(), ...noWallet].map((u) => {
      const pub = toPublicUser(u);
      if (!pub.specialty) pub.specialty = 'Médecine générale';
      return pub;
    });
  }

  getPublic(user: UserEntity): PublicUser {
    return toPublicUser(user);
  }

  async upsertSeedUser(user: UserEntity): Promise<void> {
    const users = await this.loadAll();
    const index = users.findIndex((u) => u.email === user.email);
    if (index >= 0) {
      users[index] = { ...users[index]!, ...user, id: users[index]!.id };
    } else {
      users.push(user);
    }
    await this.saveAll(users);
  }
}
