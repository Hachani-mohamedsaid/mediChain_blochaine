import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verifyMessage } from 'ethers';
import { Role } from '../common/enums/role.enum.js';
import { UsersService } from '../users/users.service.js';
import { RecordsService } from '../records/records.service.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { WalletAuthDto } from './dto/wallet-auth.dto.js';
import type { JwtPayload } from './strategies/jwt.strategy.js';
import type { UserEntity } from '../users/user.entity.js';
import { roleForWallet } from './wallet-roles.js';

const ROLE_LABEL: Record<string, string> = {
  [Role.Patient]: 'Patient MediChain',
  [Role.Doctor]: 'Médecin MediChain',
  [Role.Pharmacy]: 'Pharmacie MediChain',
  [Role.Supplier]: 'Fournisseur MediChain',
};

@Injectable()
export class AuthService {
  private readonly nonces = new Map<string, string>();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly recordsService: RecordsService,
    private readonly blockchain: BlockchainService,
  ) {}

  issueNonce(address: string): { nonce: string; message: string } {
    const addr = address.toLowerCase();
    const nonce = `mc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.nonces.set(addr, nonce);
    return { nonce, message: this.buildSignMessage(addr, nonce) };
  }

  private buildSignMessage(address: string, nonce: string): string {
    return `MediChain login\nAddress: ${address}\nNonce: ${nonce}`;
  }

  async loginWithWallet(dto: WalletAuthDto) {
    const addr = dto.address.toLowerCase();
    const nonce = this.nonces.get(addr);
    if (!nonce) {
      throw new UnauthorizedException('Nonce manquant — redemandez /auth/nonce');
    }
    const message = this.buildSignMessage(addr, nonce);
    let recovered: string;
    try {
      recovered = verifyMessage(message, dto.signature).toLowerCase();
    } catch {
      throw new UnauthorizedException('Signature invalide');
    }
    if (recovered !== addr) {
      throw new UnauthorizedException('Adresse ≠ signature');
    }
    this.nonces.delete(addr);

    const mapped = roleForWallet(addr);
    const roleFromClient =
      dto.role === 'patient' ||
      dto.role === 'doctor' ||
      dto.role === 'pharmacy' ||
      dto.role === 'supplier'
        ? (dto.role as Role)
        : undefined;
    const desiredRole = mapped ?? roleFromClient;

    let user = await this.usersService.findByWalletAndRole(
      addr,
      desiredRole,
    );
    if (!user) {
      user = await this.usersService.findByWallet(addr);
    }

    if (!user) {
      if (!desiredRole || desiredRole === Role.Admin) {
        throw new BadRequestException({
          code: 'ROLE_REQUIRED',
          message:
            'Wallet non mappé. Utilisez Compte 1 (patient), 2 (médecin) ou 3 (pharmacie).',
        });
      }
      user = await this.usersService.ensureWalletUser({
        walletAddress: addr,
        role: desiredRole,
        displayName:
          dto.displayName?.trim() ||
          ROLE_LABEL[desiredRole] ||
          'Utilisateur MediChain',
      });
      if (desiredRole === Role.Doctor && !user.specialty) {
        await this.usersService.updateProfile(user.id, {
          specialty: 'Médecine générale',
        });
        user.specialty = 'Médecine générale';
      }
    } else if (
      desiredRole &&
      user.role !== desiredRole &&
      user.role !== Role.Admin
    ) {
      // Aligner sur Compte 1/2/3 (map ou rôle envoyé par le client)
      const aligned = await this.usersService.findByWalletAndRole(
        addr,
        desiredRole,
      );
      if (aligned) {
        user = aligned;
      } else {
        user = await this.usersService.ensureWalletUser({
          walletAddress: addr,
          role: desiredRole,
          displayName: ROLE_LABEL[desiredRole],
        });
      }
    }

    if (user.role === Role.Admin) {
      throw new ForbiddenException('Compte admin désactivé');
    }

    if (user.role === Role.Patient) {
      await this.recordsService.ensurePatientDossier(user);
    }
    if (user.role === Role.Doctor && user.walletAddress) {
      try {
        await this.blockchain.ensureDoctorLicensed(
          user.walletAddress,
          user.specialty || 'Médecine générale',
        );
      } catch {
        /* ignore */
      }
    }

    return this.buildAuthResponse(user);
  }

  async register(dto: RegisterDto) {
    if (dto.role === Role.Admin) {
      throw new ForbiddenException('Cannot self-register as admin');
    }
    const user = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      role: dto.role,
      displayName: dto.displayName,
      walletAddress: dto.walletAddress,
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.role === Role.Admin) {
      throw new ForbiddenException('Compte admin désactivé');
    }
    const valid = await this.usersService.validatePassword(user, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.buildAuthResponse(user);
  }

  me(userId: string) {
    return this.usersService.findById(userId).then((u) => {
      if (!u) {
        throw new UnauthorizedException();
      }
      return this.usersService.getPublic(u);
    });
  }

  private buildAuthResponse(user: UserEntity) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: this.usersService.getPublic(user),
    };
  }
}
