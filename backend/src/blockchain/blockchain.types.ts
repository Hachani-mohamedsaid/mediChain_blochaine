export interface ContractAddresses {
  MediChain?: string;
  MediChainDoctor?: string;
  MedicalRecordNFT?: string;
  MediChainPay?: string;
  MediChainIdentity?: string;
  DoctorLicenseNFT?: string;
  MediChainPharmacy?: string;
  MediChainToken?: string;
  MediChainSupply?: string;
  network?: string;
  chainId?: string;
  deployer?: string;
  deployedAt?: string;
  note?: string;
}

export type GrantStatus = 'Active' | 'Revoked' | 'Expired';

export interface ChainGrant {
  grantId: number;
  patient: string;
  doctor: string;
  documentHash: string;
  expiresAt: number;
  status: GrantStatus;
  txHash: string;
}

export interface ChainEvent {
  id: number;
  type: 'PatientJoined' | 'AccessGranted' | 'AccessRevoked' | 'DocumentOpened';
  actor: string;
  patient?: string;
  doctor?: string;
  grantId?: number;
  documentHash?: string;
  timestamp: number;
  txHash: string;
}

export interface BlockchainStatus {
  mode: 'mock' | 'rpc';
  connected: boolean;
  contract?: string;
  doctorContract?: string;
  nftContract?: string;
  payContract?: string;
  pharmacyContract?: string;
  tokenContract?: string;
  chainId?: number;
  grants: number;
  events: number;
  /** Explication UI */
  note?: string;
}
