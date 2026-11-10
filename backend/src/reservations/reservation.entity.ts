export type ReservationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid'
  | 'cancelled';

export interface ReservationEntity {
  id: string;
  patientId: string;
  doctorId: string;
  patientName: string;
  doctorName: string;
  memo: string;
  /** Tarif affiché au moment de la demande (ETH) — paiement après acceptation */
  feeEth: string;
  status: ReservationStatus;
  createdAt: string;
  acceptedAt?: string;
  rejectedAt?: string;
  paidAt?: string;
  paymentId?: number;
  txHash?: string;
}
