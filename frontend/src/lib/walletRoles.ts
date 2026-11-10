import type { SignupRole } from '../context/AuthContext'

/** Hardhat #0 #1 #2 */
const HARDHAT: Record<string, SignupRole> = {
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': 'patient',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': 'doctor',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': 'pharmacy',
}

/** MetaMask Compte 1 patient · Compte 2 médecin */
const METAMASK: Record<string, SignupRole> = {
  '0xbb59629aed354f36ab985542d3539642b86ac078': 'patient',
  '0xb22ef2f11d966c4416e1a0578e57de2a2d3ec4f7': 'doctor',
}

const SLOTS_KEY = 'medichain_mm_role_slots'

function loadSlots(): Record<string, SignupRole> {
  try {
    return JSON.parse(localStorage.getItem(SLOTS_KEY) || '{}') as Record<
      string,
      SignupRole
    >
  } catch {
    return {}
  }
}

function saveSlots(slots: Record<string, SignupRole>) {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots))
}

/** Compte 3 → pharmacie (0x764C6…31669) */
export function isPharmacyAccount3(address: string): boolean {
  const a = address.toLowerCase()
  return a.startsWith('0x764c6') && a.endsWith('31669')
}

/** Compte 4 → fournisseur (0xc8CF6…D1Ac3) */
export function isSupplierAccount4(address: string): boolean {
  const a = address.toLowerCase()
  return a.startsWith('0xc8cf6') && a.endsWith('d1ac3')
}

/**
 * Compte 1 → patient · 2 → médecin · 3 → pharmacie · 4 → fournisseur
 */
export function resolveRoleForWallet(address: string): SignupRole {
  const a = address.toLowerCase()
  if (HARDHAT[a]) return HARDHAT[a]
  if (METAMASK[a]) return METAMASK[a]
  if (isPharmacyAccount3(a)) {
    const slots = loadSlots()
    slots[a] = 'pharmacy'
    saveSlots(slots)
    return 'pharmacy'
  }
  if (isSupplierAccount4(a)) {
    const slots = loadSlots()
    slots[a] = 'supplier'
    saveSlots(slots)
    return 'supplier'
  }

  const slots = loadSlots()
  if (slots[a]) return slots[a]
  // Inconnu : ne pas forcer pharmacie
  slots[a] = 'patient'
  saveSlots(slots)
  return 'patient'
}

export function roleHomePath(_role: SignupRole): string {
  return '/dashboard'
}
