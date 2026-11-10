export type DocCategory =
  | 'analyse'
  | 'ordonnance'
  | 'imagerie'
  | 'certificat'
  | 'compte_rendu'
  | 'autre'

export const DOC_CATEGORIES: { id: DocCategory; label: string }[] = [
  { id: 'analyse', label: 'Analyses' },
  { id: 'ordonnance', label: 'Ordonnances' },
  { id: 'imagerie', label: 'Imagerie' },
  { id: 'certificat', label: 'Certificats' },
  { id: 'compte_rendu', label: 'Comptes-rendus' },
  { id: 'autre', label: 'Autre' },
]

export function inferCategory(title: string, kind?: string): DocCategory {
  const t = `${title} ${kind ?? ''}`.toLowerCase()
  if (/ordo|prescription/.test(t)) return 'ordonnance'
  if (/certificat|arrêt|arret/.test(t)) return 'certificat'
  if (/radio|irm|scanner|imagerie|echo|échographie/.test(t)) return 'imagerie'
  if (/analyse|sang|labo|biologie/.test(t)) return 'analyse'
  if (/compte.?rendu|cr\b/.test(t)) return 'compte_rendu'
  if (kind === 'doctor_issue') return 'ordonnance'
  return 'autre'
}

export function categoryLabel(c: DocCategory): string {
  return DOC_CATEGORIES.find((x) => x.id === c)?.label ?? c
}
