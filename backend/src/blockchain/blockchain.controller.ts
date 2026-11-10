import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BlockchainService } from './blockchain.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import { RegisterPatientDto } from './dto/register-patient.dto.js';
import { UsersService } from '../users/users.service.js';
import type { UserEntity } from '../users/user.entity.js';

@Controller('blockchain')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlockchainController {
  constructor(
    private readonly blockchain: BlockchainService,
    private readonly usersService: UsersService,
  ) {}

  @Get('status')
  status() {
    return this.blockchain.getStatus();
  }

  @Get('contracts')
  contracts() {
    return this.blockchain.getAddresses();
  }

  @Post('faucet')
  async faucet(@Body() body: { address?: string }) {
    if (!body?.address) {
      throw new BadRequestException('address required');
    }
    return this.blockchain.faucet(body.address);
  }

  /** Enregistre un DocumentOpened après signature MetaMask */
  @Post('log-open')
  @Roles(Role.Doctor)
  logOpen(
    @Body()
    body: {
      grantId?: number;
      doctor?: string;
      patient?: string;
      txHash?: string;
      documentHash?: string;
    },
  ) {
    if (body.grantId == null || !body.doctor || !body.txHash) {
      throw new BadRequestException('grantId, doctor, txHash required');
    }
    return this.blockchain.rememberDocumentOpened({
      grantId: body.grantId,
      doctor: body.doctor,
      patient: body.patient ?? '',
      txHash: body.txHash,
      documentHash: body.documentHash,
    });
  }

  /** Après payConsultation MetaMask : mémoriser la consultation patient↔médecin */
  @Post('log-consultation')
  @Roles(Role.Patient, Role.Doctor, Role.Admin)
  logConsultation(
    @Body() body: { patientWallet?: string; doctorWallet?: string },
  ) {
    if (!body?.patientWallet || !body?.doctorWallet) {
      throw new BadRequestException('patientWallet and doctorWallet required');
    }
    this.blockchain.rememberConsultation(
      body.patientWallet,
      body.doctorWallet,
    );
    return { ok: true };
  }

  /** Médecin connecté : join + licence soulbound (après redeploy Hardhat) */
  @Post('ensure-doctor')
  @Roles(Role.Doctor)
  async ensureDoctor(@CurrentUser() user: UserEntity) {
    if (!user.walletAddress) {
      throw new BadRequestException('Wallet médecin manquant');
    }
    const wallet = await this.blockchain.ensureDoctorReady(
      user.walletAddress,
      user.specialty || 'Médecine générale',
    );
    if (user.walletAddress.toLowerCase() !== wallet) {
      await this.usersService.updateProfile(user.id, {
        walletAddress: wallet,
      });
    }
    return { doctorId: user.id, walletAddress: wallet };
  }

  /** Médecin : s’assurer que le patient est joinAsPatient on-chain (Hardhat) */
  @Post('ensure-patient')
  @Roles(Role.Doctor)
  async ensurePatient(@Body() body: { patientId?: string }) {
    if (!body?.patientId) {
      throw new BadRequestException('patientId required');
    }
    const user = await this.usersService.findById(body.patientId);
    if (!user || user.role !== Role.Patient) {
      throw new BadRequestException('Invalid patient');
    }
    if (!user.walletAddress) {
      throw new BadRequestException(
        'Ce patient n’a pas de wallet — qu’il connecte MetaMask d’abord.',
      );
    }
    // Ne jamais écraser le wallet MetaMask par Hardhat #0
    const wallet = await this.blockchain.ensurePatientReady(
      user.walletAddress,
    );
    return { patientId: user.id, walletAddress: wallet };
  }

  /** Patient / pharmacie : inscrit la pharmacie au registre on-chain (Hardhat local) */
  @Post('ensure-pharmacy')
  @Roles(Role.Patient, Role.Pharmacy, Role.Admin)
  async ensurePharmacy(@Body() body: { pharmacyId?: string }) {
    if (!body?.pharmacyId) {
      throw new BadRequestException('pharmacyId required');
    }
    const user = await this.usersService.findById(body.pharmacyId);
    if (!user || user.role !== Role.Pharmacy) {
      throw new BadRequestException('Invalid pharmacy');
    }
    // Ne pas écraser MetaMask Compte 3 (0x764C…) avec Hardhat #2
    const mmPharmacy =
      user.walletAddress &&
      user.walletAddress.toLowerCase().startsWith('0x764c6') &&
      user.walletAddress.toLowerCase().endsWith('31669');
    if (mmPharmacy) {
      return {
        pharmacyId: user.id,
        walletAddress: user.walletAddress,
        skipped: true,
      };
    }
    const wallet = await this.blockchain.ensurePharmacyReady(
      user.walletAddress,
    );
    if (
      !user.walletAddress ||
      user.walletAddress.toLowerCase() !== wallet
    ) {
      await this.usersService.updateProfile(user.id, { walletAddress: wallet });
    }
    return { pharmacyId: user.id, walletAddress: wallet };
  }

  /** Admin : mint licence médecin soulbound (DoctorLicenseNFT) */
  @Post('mint-doctor-license')
  @Roles(Role.Admin)
  async mintDoctorLicense(
    @Body() body: { doctorId?: string; specialty?: string },
  ) {
    if (!body?.doctorId) {
      throw new BadRequestException('doctorId required');
    }
    const doctor = await this.usersService.findById(body.doctorId);
    if (!doctor || doctor.role !== Role.Doctor) {
      throw new BadRequestException('Invalid doctor');
    }
    if (!doctor.walletAddress) {
      throw new BadRequestException('Doctor has no wallet');
    }
    const specialty =
      body.specialty?.trim() ||
      doctor.specialty ||
      'Médecine générale';
    const result = await this.blockchain.mintDoctorLicense({
      doctorWallet: doctor.walletAddress,
      specialty,
    });
    return {
      doctorId: doctor.id,
      wallet: doctor.walletAddress,
      specialty,
      ...result,
    };
  }

  /** Admin : arbitrage escrow (doctorBps / 10000) */
  @Post('resolve-dispute')
  @Roles(Role.Admin)
  async resolveDispute(
    @Body() body: { paymentId?: number; doctorBps?: number },
  ) {
    if (body?.paymentId == null || body?.doctorBps == null) {
      throw new BadRequestException('paymentId and doctorBps required');
    }
    if (body.doctorBps < 0 || body.doctorBps > 10_000) {
      throw new BadRequestException('doctorBps must be 0..10000');
    }
    return this.blockchain.resolvePayDispute({
      paymentId: body.paymentId,
      doctorBps: body.doctorBps,
    });
  }

  /**
   * Pharmacie → commande supply on-chain via Hardhat impersonate
   * (pas de MetaMask → plus de faux toast « échouée »)
   */
  @Post('supply/request')
  @Roles(Role.Pharmacy)
  async supplyRequest(
    @CurrentUser() user: UserEntity,
    @Body()
    body: {
      supplierId?: string;
      medicineId?: string;
      medicineName?: string;
      quantity?: number;
      memo?: string;
      /** Wallet MetaMask connecté (Compte 3) — prioritaire sur le profil */
      pharmacyWallet?: string;
    },
  ) {
    if (!body?.supplierId || !body.medicineId || !body.medicineName) {
      throw new BadRequestException(
        'supplierId, medicineId, medicineName required',
      );
    }
    const pharmacyWallet = (
      body.pharmacyWallet ||
      user.walletAddress ||
      ''
    ).toLowerCase();
    if (!pharmacyWallet) {
      throw new BadRequestException(
        'Pharmacie sans wallet — connecte MetaMask Compte 3',
      );
    }
    if (
      !user.walletAddress ||
      user.walletAddress.toLowerCase() !== pharmacyWallet
    ) {
      await this.usersService.updateProfile(user.id, {
        walletAddress: pharmacyWallet,
      });
    }
    const supplier = await this.usersService.findById(body.supplierId);
    if (!supplier || supplier.role !== Role.Supplier || !supplier.walletAddress) {
      throw new BadRequestException('Fournisseur invalide / sans wallet');
    }
    return this.blockchain.requestSupplyServer({
      pharmacyWallet,
      supplierWallet: supplier.walletAddress,
      medicineId: body.medicineId,
      medicineName: body.medicineName,
      quantity: Number(body.quantity) || 1,
      memo: body.memo,
    });
  }

  /** Fournisseur → livre une commande supply (Hardhat impersonate) */
  @Post('supply/fulfill')
  @Roles(Role.Supplier)
  async supplyFulfill(
    @CurrentUser() user: UserEntity,
    @Body() body: { orderId?: number; supplierWallet?: string },
  ) {
    if (body?.orderId == null) {
      throw new BadRequestException('orderId required');
    }
    const supplierWallet = (
      body.supplierWallet ||
      user.walletAddress ||
      ''
    ).toLowerCase();
    if (!supplierWallet) {
      throw new BadRequestException(
        'Fournisseur sans wallet — connecte MetaMask Compte 4',
      );
    }
    if (
      !user.walletAddress ||
      user.walletAddress.toLowerCase() !== supplierWallet
    ) {
      await this.usersService.updateProfile(user.id, {
        walletAddress: supplierWallet,
      });
    }
    return this.blockchain.fulfillSupplyServer({
      supplierWallet,
      orderId: Number(body.orderId),
    });
  }

  @Post('register-patient')
  @Roles(Role.Admin)
  async registerPatient(@Body() dto: RegisterPatientDto) {
    const user = await this.usersService.findById(dto.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== Role.Patient) {
      throw new BadRequestException('User must be a patient');
    }
    if (!user.walletAddress) {
      throw new BadRequestException('Patient has no wallet address');
    }
    const { didHash, txHash } = await this.blockchain.registerPatient(
      user.walletAddress,
      user.displayName,
      user.id,
    );
    await this.usersService.markRegisteredOnChain(user.id, didHash);
    return {
      userId: user.id,
      wallet: user.walletAddress,
      didHash,
      txHash,
    };
  }
}
