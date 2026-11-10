export type UserRole =
  | 'patient'
  | 'doctor'
  | 'pharmacy'
  | 'supplier'
  | 'admin'

export interface User {
  id: string
  email: string
  role: UserRole
  displayName: string
  specialty?: string
  walletAddress?: string
  didHash?: string
  registeredOnChain?: boolean
  createdAt?: string
}

export interface MedicalRecord {
  id: string
  ownerId: string
  title: string
  description?: string
  originalName?: string
  mimeType?: string
  contentHash: string
  sizeBytes?: number
  uploadedAt: string
  kind?: 'patient_upload' | 'doctor_issue' | 'dossier'
  issuedByDoctorId?: string
  issueTxHash?: string
  tokenId?: number
  mintTxHash?: string
  nftContract?: string
  encrypted?: boolean
  contentCid?: string
  category?:
    | 'analyse'
    | 'ordonnance'
    | 'imagerie'
    | 'certificat'
    | 'compte_rendu'
    | 'autre'
}

export interface ChainEventView {
  id?: number | string
  type: string
  actor?: string
  patient?: string
  doctor?: string
  grantId?: number
  documentHash?: string
  txHash?: string
  timestamp?: number
}

export interface AccessGrant {
  id: string
  chainGrantId: number
  patientId: string
  doctorId: string
  recordId: string
  documentHash: string
  startsAt: number
  endsAt: number
  status: 'active' | 'revoked' | 'expired'
  purpose: string
  grantTxHash?: string
  revokeTxHash?: string
  createdAt: string
  permissions?: Array<'read' | 'download' | 'annotate'>
  emergency?: boolean
  emergencyReason?: string
  onChainConfirmed?: boolean
}

export interface AuditEntry {
  id: string
  eventType: string
  actorId: string
  patientId?: string
  doctorId?: string
  grantId?: string
  documentHash?: string
  metadata?: string
  timestamp: number
  txHash?: string
}

export interface BlockchainStatus {
  mode: string
  connected: boolean
  contract?: string
  doctorContract?: string
  nftContract?: string
  payContract?: string
  pharmacyContract?: string
  chainId?: number
  grants: number
  events: number
  note?: string
}
