import { Role } from '../common/enums/role.enum.js';

/** Compte MetaMask 1/2 + Hardhat #0/#1/#2 */
export const WALLET_ROLE_MAP: Record<string, Role> = {
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': Role.Patient,
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': Role.Doctor,
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': Role.Pharmacy,
  '0xbb59629aed354f36ab985542d3539642b86ac078': Role.Patient,
  '0xb22ef2f11d966c4416e1a0578e57de2a2d3ec4f7': Role.Doctor,
};

/** Compte 3 MetaMask (0x764C6…31669) → pharmacie */
function isPharmacyAccount3(address: string): boolean {
  const a = address.toLowerCase();
  return a.startsWith('0x764c6') && a.endsWith('31669');
}

/** Compte 4 MetaMask (0xc8CF6…D1Ac3) → fournisseur */
function isSupplierAccount4(address: string): boolean {
  const a = address.toLowerCase();
  return a.startsWith('0xc8cf6') && a.endsWith('d1ac3');
}

export function roleForWallet(address: string): Role | undefined {
  const a = address.toLowerCase();
  if (WALLET_ROLE_MAP[a]) return WALLET_ROLE_MAP[a];
  if (isPharmacyAccount3(a)) return Role.Pharmacy;
  if (isSupplierAccount4(a)) return Role.Supplier;
  return undefined;
}
