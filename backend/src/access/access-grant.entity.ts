export type GrantStatus = 'active' | 'revoked' | 'expired';

export type GrantPermission = 'read' | 'download' | 'annotate';

export interface AccessGrantEntity {
  id: string;
  chainGrantId: number;
  patientId: string;
  doctorId: string;
  recordId: string;
  documentHash: string;
  startsAt: number;
  endsAt: number;
  status: GrantStatus;
  purpose: string;
  grantTxHash?: string;
  revokeTxHash?: string;
  createdAt: string;
  /** Permissions granulaires (app) */
  permissions?: GrantPermission[];
  /** Accès d’urgence avec justification */
  emergency?: boolean;
  emergencyReason?: string;
  /** true seulement si grantTxHash présent (MetaMask confirmé) */
  onChainConfirmed?: boolean;
}
