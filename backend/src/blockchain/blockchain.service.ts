import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Contract,
  JsonRpcProvider,
  JsonRpcSigner,
  Wallet,
  getBytes,
  isHexString,
  zeroPadValue,
  type InterfaceAbi,
} from 'ethers';
import type {
  BlockchainStatus,
  ChainEvent,
  ChainGrant,
  ContractAddresses,
} from './blockchain.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Hardhat node default accounts (local only) — msg.sender = wallet patient/médecin */
const LOCAL_KEYS: Record<string, string> = {
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266':
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8':
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc':
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x90f79bf6eb2f41bbe6215724739bfbb43eca1cf0':
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65':
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc':
    '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x976ea74026e726554db657fa54763abd0c3a0aa9':
    '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x14dc79964da2c08b23698b3d3cc7ca32193d9955':
    '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f':
    '0xdbda1821b80551c9d339df14970b04ee957b748537f89450d34a9b88c4ffb8a8',
  '0xa0ee7a142d267c1f36714e4a8f75612f20a79720':
    '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
};

/**
 * Couche blockchain mince :
 * - mock : ledger en mémoire
 * - rpc : appels réels au contrat MediChain
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private addresses: ContractAddresses = {};
  private mode: 'mock' | 'rpc' = 'mock';
  private patients = new Set<string>();
  /** `${patientWallet}|${doctorWallet}` lowercase — consultations confirmées */
  private consultations = new Set<string>();
  private grants: ChainGrant[] = [];
  private events: ChainEvent[] = [];
  private nextGrantId = 1;
  private nextEventId = 1;
  private provider?: JsonRpcProvider;
  private wallet?: Wallet;
  private abi: InterfaceAbi = [];
  private doctorAbi: InterfaceAbi = [];
  private licenseAbi: InterfaceAbi = [];
  private payAbi: InterfaceAbi = [];
  private pharmacyAbi: InterfaceAbi = [];
  private tokenAbi: InterfaceAbi = [];
  private supplyAbi: InterfaceAbi = [];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.loadAddresses();
    await this.loadAbi();
    this.mode =
      this.config.get<string>('BLOCKCHAIN_MODE', 'mock') === 'rpc'
        ? 'rpc'
        : 'mock';

    if (this.mode === 'rpc') {
      const rpcUrl = this.config.get<string>('RPC_URL');
      const pk = this.config.get<string>('BLOCKCHAIN_PRIVATE_KEY');
      if (!rpcUrl || !pk || !this.addresses.MediChain || !this.abi.length) {
        this.logger.warn('RPC incomplete (url/key/address/abi) → mock');
        this.mode = 'mock';
      } else {
        this.provider = new JsonRpcProvider(rpcUrl);
        this.wallet = new Wallet(pk, this.provider);
        LOCAL_KEYS[this.wallet.address.toLowerCase()] = pk;
        this.logger.log(
          `RPC ready · signer ${this.wallet.address} · ${this.addresses.MediChain}`,
        );
      }
    } else {
      this.logger.log('Mock ledger (1 contrat MediChain)');
    }
  }

  private async loadAddresses(): Promise<void> {
    try {
      const raw = await readFile(join(__dirname, 'addresses.json'), 'utf8');
      this.addresses = JSON.parse(raw) as ContractAddresses;
    } catch {
      this.addresses = {};
    }
  }

  private async loadAbi(): Promise<void> {
    try {
      const raw = await readFile(join(__dirname, 'MediChain.abi.json'), 'utf8');
      this.abi = JSON.parse(raw) as InterfaceAbi;
    } catch {
      this.abi = [];
    }
    try {
      const raw = await readFile(
        join(__dirname, 'MediChainDoctor.abi.json'),
        'utf8',
      );
      this.doctorAbi = JSON.parse(raw) as InterfaceAbi;
    } catch {
      this.doctorAbi = [];
    }
    try {
      const raw = await readFile(
        join(__dirname, 'DoctorLicenseNFT.abi.json'),
        'utf8',
      );
      this.licenseAbi = JSON.parse(raw) as InterfaceAbi;
    } catch {
      this.licenseAbi = [];
    }
    try {
      const raw = await readFile(
        join(__dirname, 'MediChainPay.abi.json'),
        'utf8',
      );
      this.payAbi = JSON.parse(raw) as InterfaceAbi;
    } catch {
      this.payAbi = [];
    }
    try {
      const raw = await readFile(
        join(__dirname, 'MediChainPharmacy.abi.json'),
        'utf8',
      );
      this.pharmacyAbi = JSON.parse(raw) as InterfaceAbi;
    } catch {
      this.pharmacyAbi = [];
    }
    try {
      const raw = await readFile(
        join(__dirname, 'MediChainToken.abi.json'),
        'utf8',
      );
      this.tokenAbi = JSON.parse(raw) as InterfaceAbi;
    } catch {
      this.tokenAbi = [];
    }
    try {
      const raw = await readFile(
        join(__dirname, 'MediChainSupply.abi.json'),
        'utf8',
      );
      this.supplyAbi = JSON.parse(raw) as InterfaceAbi;
    } catch {
      this.supplyAbi = [];
    }
  }

  private tx(): string {
    return `0x${randomBytes(32).toString('hex')}`;
  }

  private pushEvent(
    partial: Omit<ChainEvent, 'id' | 'timestamp' | 'txHash'> & {
      txHash?: string;
    },
  ): ChainEvent {
    const e: ChainEvent = {
      id: this.nextEventId++,
      timestamp: Math.floor(Date.now() / 1000),
      txHash: partial.txHash ?? this.tx(),
      ...partial,
    };
    this.events.push(e);
    return e;
  }

  private toBytes32(hash: string): string {
    if (isHexString(hash, 32)) return hash;
    if (isHexString(hash) && getBytes(hash).length <= 32) {
      return zeroPadValue(hash, 32);
    }
    throw new BadRequestException('documentHash must be bytes32 hex');
  }

  private signerFor(walletAddress: string): Wallet {
    if (!this.provider) {
      throw new BadRequestException('RPC provider not ready');
    }
    const key = LOCAL_KEYS[walletAddress.toLowerCase()];
    if (!key) {
      throw new BadRequestException(
        `No local key for ${walletAddress}. Use a Hardhat test account wallet.`,
      );
    }
    return new Wallet(key, this.provider);
  }

  /**
   * Hardhat : agit comme n’importe quel wallet MetaMask (sans clé privée).
   * Évite le faux toast MetaMask « échouée » sur les tx supply.
   */
  private async impersonate(walletAddress: string): Promise<JsonRpcSigner> {
    if (!this.provider) {
      throw new BadRequestException('RPC provider not ready');
    }
    const addr = walletAddress.toLowerCase();
    await this.provider.send('hardhat_impersonateAccount', [addr]);
    const bal = await this.provider.getBalance(addr);
    if (bal < 10n ** 17n) {
      await this.provider.send('hardhat_setBalance', [
        addr,
        '0x56BC75E2D63100000', // 100 ETH
      ]);
    }
    // ethers v6 getSigner() ignore les comptes impersonés → JsonRpcSigner direct
    return new JsonRpcSigner(this.provider, addr);
  }

  private supplyContract() {
    if (!this.addresses.MediChainSupply || !this.supplyAbi.length) {
      throw new BadRequestException('MediChainSupply manquant — redéploie');
    }
    return { address: this.addresses.MediChainSupply, abi: this.supplyAbi };
  }

  private contractFor(walletAddress: string): Contract {
    if (!this.addresses.MediChain) {
      throw new BadRequestException('MediChain address missing');
    }
    return new Contract(
      this.addresses.MediChain,
      this.abi,
      this.signerFor(walletAddress),
    );
  }

  private doctorContractFor(walletAddress: string): Contract {
    if (!this.addresses.MediChainDoctor || !this.doctorAbi.length) {
      throw new BadRequestException('MediChainDoctor missing');
    }
    return new Contract(
      this.addresses.MediChainDoctor,
      this.doctorAbi,
      this.signerFor(walletAddress),
    );
  }

  /** Contourne MetaMask : signe join + issueDocument via clés Hardhat locales */
  async issueDocumentServerSide(input: {
    doctorWallet?: string;
    patientWallet?: string;
    docHash: string;
    kind: string;
  }): Promise<{ txHash: string; doctorWallet: string; patientWallet: string }> {
    if (this.mode !== 'rpc' || !this.provider) {
      throw new BadRequestException('RPC mode required for on-chain issue');
    }
    const doctorWallet = (
      input.doctorWallet && LOCAL_KEYS[input.doctorWallet.toLowerCase()]
        ? input.doctorWallet
        : '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
    ).toLowerCase();
    // Garder le vrai wallet patient (MetaMask) — ne pas forcer Hardhat #0
    if (!input.patientWallet) {
      throw new BadRequestException('patientWallet required');
    }
    const patientWallet = await this.ensurePatientReady(input.patientWallet);

    const doctorC = this.doctorContractFor(doctorWallet);
    if (!(await doctorC.isDoctor(doctorWallet))) {
      const joinD = await doctorC.joinAsDoctor();
      await joinD.wait();
    }
    await this.ensureDoctorLicensed(doctorWallet, 'Médecine générale');

    // nonce frais après joins (évite NONCE_EXPIRED sous Hardhat automine)
    const doctorSigner = this.signerFor(doctorWallet);
    const nonce = await this.provider.getTransactionCount(
      doctorWallet,
      'latest',
    );
    const docHash = this.toBytes32(input.docHash);
    const doctorFresh = new Contract(
      this.addresses.MediChainDoctor!,
      this.doctorAbi,
      doctorSigner,
    );
    const tx = await doctorFresh.issueDocument(
      patientWallet,
      docHash,
      input.kind || 'ordonnance',
      { nonce },
    );
    const receipt = await tx.wait();
    const txHash = receipt?.hash ?? tx.hash;
    this.pushEvent({
      type: 'DocumentOpened',
      actor: doctorWallet,
      patient: patientWallet,
      doctor: doctorWallet,
      documentHash: docHash,
      txHash,
    });
    return { txHash, doctorWallet, patientWallet };
  }

  getMode() {
    return this.mode;
  }

  getAddresses() {
    return { ...this.addresses };
  }

  private licenseContract(): Contract {
    if (
      !this.wallet ||
      !this.addresses.DoctorLicenseNFT ||
      !this.licenseAbi.length
    ) {
      throw new BadRequestException('DoctorLicenseNFT unavailable');
    }
    return new Contract(
      this.addresses.DoctorLicenseNFT,
      this.licenseAbi,
      this.wallet,
    );
  }

  /** Admin (deployer) mint une licence soulbound pour un médecin */
  async mintDoctorLicense(input: {
    doctorWallet: string;
    specialty: string;
  }): Promise<{ tokenId: number; txHash: string }> {
    if (this.mode !== 'rpc' || !this.provider || !this.wallet) {
      throw new BadRequestException('RPC mode required');
    }
    const doctor = input.doctorWallet.toLowerCase();
    const license = this.licenseContract();
    if (await license.hasValidLicense(doctor)) {
      const [tokenId] = await license.getLicense(doctor);
      return { tokenId: Number(tokenId), txHash: 'already-licensed' };
    }
    const uri = `data:application/json,${encodeURIComponent(
      JSON.stringify({
        name: `Licence · ${input.specialty}`,
        description: 'MediChain DoctorLicenseNFT soulbound',
        specialty: input.specialty,
      }),
    )}`;
    const tx = await license.mintLicense(
      doctor,
      input.specialty || 'Médecine générale',
      uri,
    );
    const receipt = await tx.wait();
    const [tokenId] = await license.getLicense(doctor);
    return {
      tokenId: Number(tokenId),
      txHash: String(receipt?.hash ?? tx.hash),
    };
  }

  async ensureDoctorLicensed(doctorWallet: string, specialty: string) {
    if (this.mode !== 'rpc' || !this.addresses.DoctorLicenseNFT) return;
    const license = this.licenseContract();
    if (!(await license.hasValidLicense(doctorWallet))) {
      await this.mintDoctorLicense({ doctorWallet, specialty });
    }
  }

  /** Join registre médecin (si clé locale) + licence admin — pour MetaMask doctor */
  async ensureDoctorReady(
    preferredWallet: string,
    specialty = 'Médecine générale',
  ): Promise<string> {
    if (this.mode !== 'rpc' || !this.provider) {
      throw new BadRequestException('RPC mode required');
    }
    if (!this.addresses.MediChainDoctor || !this.doctorAbi.length) {
      throw new BadRequestException('MediChainDoctor manquant');
    }
    const doctorWallet = preferredWallet.toLowerCase();
    if (LOCAL_KEYS[doctorWallet]) {
      const doctorC = this.doctorContractFor(doctorWallet);
      if (!(await doctorC.isDoctor(doctorWallet))) {
        const tx = await doctorC.joinAsDoctor();
        await tx.wait();
        this.logger.log(`Doctor joined · ${doctorWallet}`);
      }
    }
    await this.ensureDoctorLicensed(doctorWallet, specialty);
    return doctorWallet;
  }

  rememberConsultation(patientWallet: string, doctorWallet: string): void {
    if (!patientWallet || !doctorWallet) return;
    this.consultations.add(
      `${patientWallet.toLowerCase()}|${doctorWallet.toLowerCase()}`,
    );
  }

  /**
   * True si consultation patient↔médecin :
   * - mémoire API, ou
   * - paiement MediChainPay Locked (1) / Released (2).
   */
  async hasConsultationBetween(
    patientWallet?: string,
    doctorWallet?: string,
  ): Promise<boolean> {
    if (!patientWallet || !doctorWallet) return false;
    const p = patientWallet.toLowerCase();
    const d = doctorWallet.toLowerCase();
    if (this.consultations.has(`${p}|${d}`)) return true;
    if (this.mode !== 'rpc' || !this.provider || !this.addresses.MediChainPay) {
      return false;
    }
    if (!this.payAbi.length) return false;
    try {
      const pay = new Contract(
        this.addresses.MediChainPay,
        this.payAbi,
        this.provider,
      );
      const next = Number(await pay.nextPaymentId());
      for (let id = 1; id < next; id++) {
        const row = await pay.payments(id);
        const status = Number(row.status ?? row[7]);
        const patient = String(row.patient ?? row[0]).toLowerCase();
        const doctor = String(row.doctor ?? row[1]).toLowerCase();
        // Locked=1, Released=2
        if (patient === p && doctor === d && (status === 1 || status === 2)) {
          this.rememberConsultation(p, d);
          return true;
        }
      }
    } catch (e) {
      this.logger.warn(`hasConsultationBetween: ${String(e)}`);
      return false;
    }
    return false;
  }

  async resolvePayDispute(input: {
    paymentId: number;
    doctorBps: number;
  }): Promise<{ txHash: string }> {
    if (this.mode !== 'rpc' || !this.wallet || !this.addresses.MediChainPay) {
      throw new BadRequestException('RPC / MediChainPay required');
    }
    if (!this.payAbi.length) throw new BadRequestException('Pay ABI missing');
    const pay = new Contract(
      this.addresses.MediChainPay,
      this.payAbi,
      this.wallet,
    );
    const tx = await pay.resolveDispute(input.paymentId, input.doctorBps);
    const receipt = await tx.wait();
    return { txHash: String(receipt?.hash ?? tx.hash) };
  }

  /**
   * Prépare un patient pour une issue MetaMask :
   * utilise le vrai wallet (ex. MetaMask patient), sans le remplacer par Hardhat #0.
   * Join via clé locale ou impersonation Hardhat.
   */
  async ensurePatientReady(preferredWallet?: string): Promise<string> {
    if (this.mode !== 'rpc' || !this.provider) {
      throw new BadRequestException('RPC mode required');
    }
    if (!preferredWallet) {
      throw new BadRequestException(
        'Wallet patient manquant — le patient doit d’abord connecter MetaMask.',
      );
    }
    const patientWallet = preferredWallet.toLowerCase();
    const reader = new Contract(
      this.addresses.MediChain!,
      this.abi,
      this.provider,
    );
    if (await reader.isPatient(patientWallet)) {
      this.markPatientRegistered(patientWallet);
      return patientWallet;
    }

    if (LOCAL_KEYS[patientWallet]) {
      const mediPatient = this.contractFor(patientWallet);
      const join = await mediPatient.joinAsPatient();
      await join.wait();
      this.markPatientRegistered(patientWallet);
      return patientWallet;
    }

    // MetaMask / wallet sans clé locale → impersonation Hardhat
    try {
      await this.provider.send('hardhat_impersonateAccount', [patientWallet]);
      await this.provider.send('hardhat_setBalance', [
        patientWallet,
        '0x56BC75E2D63100000', // 100 ETH
      ]);
      const signer = await this.provider.getSigner(patientWallet);
      const medi = new Contract(this.addresses.MediChain!, this.abi, signer);
      const join = await medi.joinAsPatient();
      await join.wait();
      this.markPatientRegistered(patientWallet);
      this.logger.log(`Patient joined via impersonation · ${patientWallet}`);
    } catch (e) {
      throw new BadRequestException(
        `Impossible d’inscrire le patient on-chain (${patientWallet}): ${String(e)}`,
      );
    } finally {
      try {
        await this.provider.send('hardhat_stopImpersonatingAccount', [
          patientWallet,
        ]);
      } catch {
        /* ignore */
      }
    }
    return patientWallet;
  }

  /**
   * Inscrit la pharmacie on-chain (MediChainPharmacy + MCT) via clé Hardhat locale.
   * Par défaut : Hardhat #2 (seed Pharmacie Centrale).
   */
  async ensurePharmacyReady(preferredWallet?: string): Promise<string> {
    if (this.mode !== 'rpc' || !this.provider) {
      throw new BadRequestException('RPC mode required');
    }
    if (
      !this.addresses.MediChainPharmacy ||
      !this.pharmacyAbi.length
    ) {
      throw new BadRequestException('MediChainPharmacy manquant');
    }
    const defaultPharmacy = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
    const pharmacyWallet = (
      preferredWallet && LOCAL_KEYS[preferredWallet.toLowerCase()]
        ? preferredWallet
        : defaultPharmacy
    ).toLowerCase();
    if (!LOCAL_KEYS[pharmacyWallet]) {
      throw new BadRequestException(
        'Wallet pharmacie inconnu localement — la pharmacie doit rejoindre le registre (Compte 3 / Hardhat #2).',
      );
    }
    const pharmacy = new Contract(
      this.addresses.MediChainPharmacy,
      this.pharmacyAbi,
      this.signerFor(pharmacyWallet),
    );
    if (!(await pharmacy.isPharmacy(pharmacyWallet))) {
      const tx = await pharmacy.joinAsPharmacy();
      await tx.wait();
      this.logger.log(`Pharmacy joined · ${pharmacyWallet}`);
    }
    if (this.addresses.MediChainToken && this.tokenAbi.length) {
      // Nouveau signer → nonce frais (évite NONCE_EXPIRED après join)
      const token = new Contract(
        this.addresses.MediChainToken,
        this.tokenAbi,
        this.signerFor(pharmacyWallet),
      );
      if (!(await token.isPharmacy(pharmacyWallet))) {
        const tx = await token.joinAsPharmacy();
        await tx.wait();
        this.logger.log(`Pharmacy MCT registry · ${pharmacyWallet}`);
      }
    }
    return pharmacyWallet;
  }

  async isPharmacyOnChain(wallet?: string): Promise<boolean> {
    if (
      this.mode !== 'rpc' ||
      !this.provider ||
      !wallet ||
      !this.addresses.MediChainPharmacy ||
      !this.pharmacyAbi.length
    ) {
      return false;
    }
    try {
      const pharmacy = new Contract(
        this.addresses.MediChainPharmacy,
        this.pharmacyAbi,
        this.provider,
      );
      return Boolean(await pharmacy.isPharmacy(wallet.toLowerCase()));
    } catch {
      return false;
    }
  }

  /** Pharmacie commande au fournisseur — sans MetaMask (Hardhat impersonate) */
  async requestSupplyServer(input: {
    pharmacyWallet: string;
    supplierWallet: string;
    medicineId: string;
    medicineName: string;
    quantity: number;
    memo?: string;
  }): Promise<{ txHash: string; orderId: number }> {
    if (this.mode !== 'rpc' || !this.provider) {
      throw new BadRequestException('RPC mode required');
    }
    if (!input.pharmacyWallet || !input.supplierWallet) {
      throw new BadRequestException('Wallets requis');
    }
    if (!Number.isFinite(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('Quantité invalide');
    }
    const { address, abi } = this.supplyContract();
    const signer = await this.impersonate(input.pharmacyWallet);
    const supply = new Contract(address, abi, signer);
    const tx = await supply.requestSupply(
      input.supplierWallet,
      input.medicineId,
      input.medicineName,
      input.quantity,
      input.memo?.trim() || 'cmd pharmacie',
      { gasLimit: 500_000n },
    );
    const receipt = await tx.wait();
    const orderId = Number(await supply.nextOrderId()) - 1;
    return {
      txHash: String(receipt?.hash ?? tx.hash),
      orderId,
    };
  }

  /** Fournisseur livre — sans MetaMask (Hardhat impersonate) */
  async fulfillSupplyServer(input: {
    supplierWallet: string;
    orderId: number;
  }): Promise<{ txHash: string }> {
    if (this.mode !== 'rpc' || !this.provider) {
      throw new BadRequestException('RPC mode required');
    }
    if (!input.supplierWallet || !Number.isFinite(input.orderId)) {
      throw new BadRequestException('supplierWallet et orderId requis');
    }
    const { address, abi } = this.supplyContract();
    const signer = await this.impersonate(input.supplierWallet);
    const supply = new Contract(address, abi, signer);
    const tx = await supply.fulfillSupply(input.orderId, {
      gasLimit: 500_000n,
    });
    const receipt = await tx.wait();
    return { txHash: String(receipt?.hash ?? tx.hash) };
  }

  /** Hardhat local : envoie de l’ETH test au wallet MetaMask (0 solde → fonds insuffisants) */
  async faucet(toAddress: string): Promise<{ txHash: string; balanceWei: string }> {
    if (this.mode !== 'rpc' || !this.provider || !this.wallet) {
      throw new BadRequestException('Faucet requires RPC / Hardhat');
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const to = toAddress.toLowerCase();
    const bal = await this.provider.getBalance(to);
    const min = 1_000_000_000_000_000_000n; // 1 ETH
    if (bal >= min) {
      return { txHash: '', balanceWei: bal.toString() };
    }
    const amount = 100_000_000_000_000_000_000n; // 100 ETH
    const tx = await this.wallet.sendTransaction({
      to,
      value: amount,
    });
    await tx.wait();
    const after = await this.provider.getBalance(to);
    return { txHash: tx.hash, balanceWei: after.toString() };
  }

  markPatientRegistered(wallet: string): void {
    this.patients.add(wallet.toLowerCase());
  }

  rememberDocumentOpened(input: {
    grantId: number;
    doctor: string;
    patient: string;
    txHash: string;
    documentHash?: string;
  }) {
    return this.pushEvent({
      type: 'DocumentOpened',
      actor: input.doctor,
      doctor: input.doctor,
      patient: input.patient,
      grantId: input.grantId,
      documentHash: input.documentHash,
      txHash: input.txHash,
    });
  }

  rememberOnChainGrant(input: {
    grantId: number;
    patient: string;
    doctor: string;
    documentHash: string;
    expiresAt: number;
    txHash: string;
  }): void {
    if (this.grants.some((g) => g.grantId === input.grantId)) return;
    this.grants.push({
      grantId: input.grantId,
      patient: input.patient,
      doctor: input.doctor,
      documentHash: input.documentHash,
      expiresAt: input.expiresAt,
      status: 'Active',
      txHash: input.txHash,
    });
    if (this.events.some((e) => e.txHash === input.txHash && e.type === 'AccessGranted')) {
      return;
    }
    this.pushEvent({
      type: 'AccessGranted',
      actor: input.patient,
      patient: input.patient,
      doctor: input.doctor,
      grantId: input.grantId,
      documentHash: input.documentHash,
      txHash: input.txHash,
    });
  }

  async getStatus(): Promise<BlockchainStatus> {
    return this.buildStatus();
  }

  private async buildStatus(): Promise<BlockchainStatus> {
    const status: BlockchainStatus = {
      mode: this.mode,
      connected: this.mode === 'mock' ? true : !!this.provider,
      contract: this.addresses.MediChain,
      doctorContract: this.addresses.MediChainDoctor,
      nftContract: this.addresses.MedicalRecordNFT,
      payContract: this.addresses.MediChainPay,
      pharmacyContract: this.addresses.MediChainPharmacy,
      tokenContract: this.addresses.MediChainToken,
      grants: this.grants.filter((g) => g.status === 'Active').length,
      events: this.events.length,
      note:
        'Grants/events = mémoire API des txs MetaMask confirmées (hydratées au démarrage). Les events app (DocumentUploaded…) sont dans Historique → Application.',
    };
    if (this.provider) {
      try {
        status.chainId = Number((await this.provider.getNetwork()).chainId);
      } catch {
        status.connected = false;
      }
    }
    return status;
  }

  isPatientRegistered(wallet: string): boolean {
    return this.patients.has(wallet.toLowerCase());
  }

  async registerPatient(
    wallet: string,
    _displayName: string,
    _didSeed: string,
  ): Promise<{ didHash: string; txHash: string }> {
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      throw new BadRequestException('Invalid wallet');
    }
    const key = wallet.toLowerCase();
    if (this.patients.has(key)) {
      throw new BadRequestException('Already registered');
    }

    if (this.mode === 'rpc') {
      const c = this.contractFor(wallet);
      const already = await c.isPatient(wallet);
      if (already) {
        this.patients.add(key);
        return { didHash: 'on-chain', txHash: '0x' + '0'.repeat(64) };
      }
      const tx = await c.joinAsPatient();
      const receipt = await tx.wait();
      this.patients.add(key);
      const txHash = receipt?.hash ?? tx.hash;
      this.pushEvent({
        type: 'PatientJoined',
        actor: wallet,
        patient: wallet,
        txHash,
      });
      return { didHash: txHash, txHash };
    }

    this.patients.add(key);
    const ev = this.pushEvent({
      type: 'PatientJoined',
      actor: wallet,
      patient: wallet,
    });
    return { didHash: ev.txHash, txHash: ev.txHash };
  }

  async grantAccessOnChain(input: {
    patientWallet: string;
    doctorWallet: string;
    documentHash: string;
    startsAt: number;
    endsAt: number;
    purpose: string;
  }): Promise<{ grantId: number; txHash: string }> {
    void input.startsAt;
    void input.purpose;
    if (!this.isPatientRegistered(input.patientWallet)) {
      throw new BadRequestException('Patient not on chain');
    }

    if (this.mode === 'rpc') {
      const docHash = this.toBytes32(input.documentHash);
      const c = this.contractFor(input.patientWallet);
      const tx = await c.grantAccess(
        input.doctorWallet,
        docHash,
        BigInt(input.endsAt),
      );
      const receipt = await tx.wait();
      const txHash = receipt?.hash ?? tx.hash;
      let grantId = Number(await c.nextGrantId()) - 1;
      for (const log of receipt?.logs ?? []) {
        try {
          const parsed = c.interface.parseLog(log);
          if (parsed?.name === 'AccessGranted') {
            grantId = Number(parsed.args.grantId);
          }
        } catch {
          /* not our event */
        }
      }
      this.grants.push({
        grantId,
        patient: input.patientWallet,
        doctor: input.doctorWallet,
        documentHash: input.documentHash,
        expiresAt: input.endsAt,
        status: 'Active',
        txHash,
      });
      this.pushEvent({
        type: 'AccessGranted',
        actor: input.patientWallet,
        patient: input.patientWallet,
        doctor: input.doctorWallet,
        grantId,
        documentHash: input.documentHash,
        txHash,
      });
      return { grantId, txHash };
    }

    const grantId = this.nextGrantId++;
    const txHash = this.tx();
    this.grants.push({
      grantId,
      patient: input.patientWallet,
      doctor: input.doctorWallet,
      documentHash: input.documentHash,
      expiresAt: input.endsAt,
      status: 'Active',
      txHash,
    });
    this.pushEvent({
      type: 'AccessGranted',
      actor: input.patientWallet,
      patient: input.patientWallet,
      doctor: input.doctorWallet,
      grantId,
      documentHash: input.documentHash,
      txHash,
    });
    return { grantId, txHash };
  }

  async revokeAccessOnChain(
    chainGrantId: number,
    patientWallet: string,
  ): Promise<{ txHash: string }> {
    const grant = this.grants.find((g) => g.grantId === chainGrantId);
    if (!grant || grant.status !== 'Active') {
      throw new BadRequestException('Grant not active');
    }

    if (this.mode === 'rpc') {
      const c = this.contractFor(patientWallet);
      const tx = await c.revokeAccess(BigInt(chainGrantId));
      const receipt = await tx.wait();
      const txHash = receipt?.hash ?? tx.hash;
      grant.status = 'Revoked';
      this.pushEvent({
        type: 'AccessRevoked',
        actor: patientWallet,
        patient: patientWallet,
        doctor: grant.doctor,
        grantId: chainGrantId,
        documentHash: grant.documentHash,
        txHash,
      });
      return { txHash };
    }

    grant.status = 'Revoked';
    const txHash = this.tx();
    this.pushEvent({
      type: 'AccessRevoked',
      actor: patientWallet,
      patient: patientWallet,
      doctor: grant.doctor,
      grantId: chainGrantId,
      documentHash: grant.documentHash,
      txHash,
    });
    return { txHash };
  }

  private sync(g: ChainGrant): ChainGrant['status'] {
    if (g.status === 'Active' && Date.now() / 1000 > g.expiresAt) {
      g.status = 'Expired';
    }
    return g.status;
  }

  hasAccessOnChain(
    doctorWallet: string,
    patientWallet: string,
    documentHash: string,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    return this.grants.some((g) => {
      this.sync(g);
      return (
        g.doctor.toLowerCase() === doctorWallet.toLowerCase() &&
        g.patient.toLowerCase() === patientWallet.toLowerCase() &&
        g.documentHash.toLowerCase() === documentHash.toLowerCase() &&
        g.status === 'Active' &&
        now <= g.expiresAt
      );
    });
  }

  /** Compat audit : events = audit trail (comme on-chain) */
  async logAuditMock(input: {
    eventType: string;
    actor: string;
    patient: string;
    doctor: string;
    grantId: number;
    documentHash: string;
    metadata: string;
  }): Promise<ChainEvent> {
    void input.metadata;
    const map: Record<string, ChainEvent['type']> = {
      PatientRegistered: 'PatientJoined',
      GrantCreated: 'AccessGranted',
      GrantRevoked: 'AccessRevoked',
      DocumentAccessed: 'DocumentOpened',
      DocumentUploaded: 'DocumentOpened',
      AccessDenied: 'DocumentOpened',
    };
    return this.pushEvent({
      type: map[input.eventType] ?? 'DocumentOpened',
      actor: input.actor,
      patient: input.patient,
      doctor: input.doctor,
      grantId: input.grantId || undefined,
      documentHash: input.documentHash,
    });
  }

  getMockLedger() {
    return {
      patients: [...this.patients],
      grants: this.grants,
      audit: this.events,
      nextGrantId: this.nextGrantId,
      nextAuditId: this.nextEventId,
    };
  }

  getMockAuditChain(): ChainEvent[] {
    return [...this.events];
  }

  getMockAuditForWallet(wallet: string): ChainEvent[] {
    const w = wallet.toLowerCase();
    return this.events.filter(
      (e) =>
        e.actor?.toLowerCase() === w ||
        e.patient?.toLowerCase() === w ||
        e.doctor?.toLowerCase() === w,
    );
  }
}
