/** Spécialités médicales proposées dans le profil médecin */
export const DOCTOR_SPECIALTIES = [
  'Médecine générale',
  'Cardiologie',
  'Dermatologie',
  'Endocrinologie',
  'Gastro-entérologie',
  'Gynécologie-obstétrique',
  'Neurologie',
  'Ophtalmologie',
  'ORL',
  'Pédiatrie',
  'Pneumologie',
  'Psychiatrie',
  'Radiologie',
  'Rhumatologie',
  'Urologie',
  'Chirurgie générale',
  'Médecine d’urgence',
  'Autre',
] as const

export type DoctorSpecialty = (typeof DOCTOR_SPECIALTIES)[number]
