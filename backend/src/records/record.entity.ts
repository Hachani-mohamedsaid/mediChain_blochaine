export interface MedicalRecordEntity {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  filePath: string;
  contentHash: string;
  sizeBytes: number;
  uploadedAt: string;
  /** patient_upload | doctor_issue | dossier (conteneur auto) */
  kind?: 'patient_upload' | 'doctor_issue' | 'dossier';
  issuedByDoctorId?: string;
  issueTxHash?: string;
  tokenId?: number;
  mintTxHash?: string;
  nftContract?: string;
  /** true = fichier chiffré AES-GCM at-rest */
  encrypted?: boolean;
  /** CID démo content-addressed (dérivé du hash, pas un pin IPFS réel) */
  contentCid?: string;
  /** Catégorie métier */
  category?:
    | 'analyse'
    | 'ordonnance'
    | 'imagerie'
    | 'certificat'
    | 'compte_rendu'
    | 'autre';
}
