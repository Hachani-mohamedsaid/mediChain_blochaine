export type SupplyStatus = 'sent' | 'received' | 'cancelled';

export interface SupplyEntity {
  id: string;
  supplierId: string;
  supplierName: string;
  pharmacyId: string;
  pharmacyName: string;
  medicineId: string;
  medicineName: string;
  quantity: number;
  location: string;
  status: SupplyStatus;
  createdAt: string;
  receivedAt?: string;
  txHash?: string;
}
