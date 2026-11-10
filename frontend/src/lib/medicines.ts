/** Catalogue démo — prix en MCT (1 ETH ≈ 1000 MCT on-chain) */
export type Medicine = {
  id: string
  name: string
  form: string
  /** Prix MCT (unités entières affichées) */
  priceMct: number
  category: string
}

export const MEDICINES: Medicine[] = [
  {
    id: 'paracetamol-500',
    name: 'Paracétamol 500 mg',
    form: 'Boîte 16 comprimés',
    priceMct: 8,
    category: 'Antalgique',
  },
  {
    id: 'amoxicilline-1g',
    name: 'Amoxicilline 1 g',
    form: 'Boîte 14 sachets',
    priceMct: 22,
    category: 'Antibiotique',
  },
  {
    id: 'ibuprofene-400',
    name: 'Ibuprofène 400 mg',
    form: 'Boîte 20 comprimés',
    priceMct: 12,
    category: 'Anti-inflammatoire',
  },
  {
    id: 'ventoline',
    name: 'Salbutamol (Ventoline)',
    form: 'Aérosol 200 doses',
    priceMct: 35,
    category: 'Respiratoire',
  },
  {
    id: 'omeprazole-20',
    name: 'Oméprazole 20 mg',
    form: 'Boîte 14 gélules',
    priceMct: 18,
    category: 'Digestif',
  },
  {
    id: 'vitamine-d',
    name: 'Vitamine D3 100 000 UI',
    form: 'Ampoule buvable',
    priceMct: 15,
    category: 'Vitamines',
  },
  {
    id: 'insuline',
    name: 'Insuline rapide',
    form: 'Stylo 3 ml',
    priceMct: 45,
    category: 'Diabète',
  },
  {
    id: 'aspirine-100',
    name: 'Aspirine Protect 100 mg',
    form: 'Boîte 30 comprimés',
    priceMct: 10,
    category: 'Cardio',
  },
]

/** Localisations pharmacie / patient (démo Tunisie) */
export const LOCATIONS = [
  'Tunis — Centre ville',
  'Tunis — Lac 1',
  'Ariana',
  'La Marsa',
  'Sfax — Médina',
  'Sousse — Port',
  'Nabeul',
  'Bizerte',
] as const

export type PayMethod = 'mct' | 'cash'

/** Conversion MCT → ETH (tokensPerEth = 1000 on-chain) */
export function mctToEth(priceMct: number): string {
  return (priceMct / 1000).toFixed(6)
}

export function medicineById(id: string): Medicine | undefined {
  return MEDICINES.find((m) => m.id === id)
}
