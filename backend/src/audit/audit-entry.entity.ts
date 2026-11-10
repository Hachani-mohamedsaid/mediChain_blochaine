export interface AuditEntryEntity {
  id: string;
  eventType: string;
  actorId: string;
  patientId?: string;
  doctorId?: string;
  grantId?: string;
  chainGrantId?: number;
  documentHash?: string;
  metadata?: string;
  timestamp: number;
  txHash?: string;
}
