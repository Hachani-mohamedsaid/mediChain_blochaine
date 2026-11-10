import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service.js';
import { Role } from '../common/enums/role.enum.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import { RecordsService } from '../records/records.service.js';

/** Hardhat account #0 */
const PATIENT_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
/** Hardhat account #1 */
const DOCTOR_WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
/** Hardhat account #2 */
const PHARMACY_WALLET = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly blockchain: BlockchainService,
    private readonly config: ConfigService,
    private readonly recordsService: RecordsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('SEED_DEMO') === 'false') {
      return;
    }
    await this.seedDemoUsers();
    try {
      await this.blockchain.ensurePharmacyReady(PHARMACY_WALLET);
      this.logger.log(`Pharmacy on-chain ready · ${PHARMACY_WALLET}`);
    } catch (e) {
      this.logger.warn(
        `Pharmacy on-chain skip: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async seedDemoUsers(): Promise<void> {
    const demos = [
      {
        email: 'patient@medichain.app',
        password: 'Patient123!',
        role: Role.Patient,
        displayName: 'Sara Benali',
        walletAddress: PATIENT_WALLET,
      },
      {
        email: 'doctor@medichain.app',
        password: 'Doctor123!',
        role: Role.Doctor,
        displayName: 'Dr. Youssef Mansouri',
        specialty: 'Médecine interne',
        walletAddress: DOCTOR_WALLET,
      },
      {
        email: 'pharmacy@medichain.app',
        password: 'Pharmacy123!',
        role: Role.Pharmacy,
        displayName: 'Pharmacie Centrale',
        walletAddress: PHARMACY_WALLET,
      },
    ];

    for (const demo of demos) {
      const existing = await this.usersService.findByEmail(demo.email);
      if (existing) {
        const patch: { walletAddress?: string; specialty?: string } = {};
        if (
          demo.walletAddress &&
          existing.walletAddress?.toLowerCase() !==
            demo.walletAddress.toLowerCase()
        ) {
          patch.walletAddress = demo.walletAddress;
        }
        const spec = (demo as { specialty?: string }).specialty;
        if (spec && existing.specialty !== spec) {
          patch.specialty = spec;
        }
        if (Object.keys(patch).length) {
          await this.usersService.updateProfile(existing.id, patch);
          this.logger.log(`Updated demo profile ${demo.email}`);
        }
        continue;
      }
      const passwordHash = await bcrypt.hash(demo.password, 10);
      await this.usersService.upsertSeedUser({
        id: uuidv4(),
        email: demo.email,
        passwordHash,
        role: demo.role,
        displayName: demo.displayName,
        specialty: (demo as { specialty?: string }).specialty,
        walletAddress: demo.walletAddress,
        registeredOnChain: false,
        createdAt: new Date().toISOString(),
      });
      this.logger.log(`Seeded demo user ${demo.email}`);
    }

    const patient = await this.usersService.findByEmail('patient@medichain.app');
    if (patient) {
      await this.recordsService.ensurePatientDossier(patient);
    }

    if (
      patient?.walletAddress &&
      !patient.registeredOnChain &&
      !this.blockchain.isPatientRegistered(patient.walletAddress)
    ) {
      try {
        const { didHash } = await this.blockchain.registerPatient(
          patient.walletAddress,
          patient.displayName,
          patient.id,
        );
        await this.usersService.markRegisteredOnChain(patient.id, didHash);
        this.logger.log('Registered demo patient on mock chain');
      } catch {
        // already registered
      }
    }
  }
}
