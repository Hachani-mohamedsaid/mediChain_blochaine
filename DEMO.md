# Scénario démo MediChain (wallet + smart contracts)

## Prérequis

```bash
cd contracts && npm run node          # T1
cd contracts && npm run deploy:local  # T2
cd backend && npm run start:dev       # T3
cd frontend && npm run dev            # T4
```

- UI : http://localhost:5173  
- API : http://localhost:3001  

## MetaMask (Hardhat)

| Compte | Rôle | Clé privée (dev) |
|--------|------|------------------|
| #0 | Patient | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| #1 | Médecin | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| #2 | Pharmacie | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

Réseau : Hardhat Local · RPC `http://127.0.0.1:8545` · chainId `31337`  
Connexion = **choisir le rôle** (patient / médecin / pharmacie) + compte MetaMask.  
1ʳᵉ fois : le rôle est enregistré pour ce wallet. Pas d’admin dans l’UI.

## Parcours produit

| # | Qui | Action | Smart contract |
|---|-----|--------|----------------|
| 1 | Patient #0 | Login wallet → **dossier médical auto** | — |
| 2 | Patient | **Réserver** un médecin (ETH escrow) | `MediChainPay.payConsultation` |
| 3 | Patient | Reçoit **bonus MCT** (ou claim sur Tokens) | `MediChainToken.claimReservationBonus` |
| 4 | Patient | Ou **acheter** MCT avec ETH | `MediChainToken.buyWithEth` |
| 5 | Médecin #1 | Fixe tarif · après réservation ouvre **dossier complet** + historique | Pay + API |
| 6 | Médecin | **Ajoute** au dossier (+ NFT soulbound patient) | `MediChainDoctor.issueDocument` + `MedicalRecordNFT.mintForPatient` |
| 7 | Patient | Partage ordo → pharmacie | `MediChainPharmacy.sharePrescription` |
| 8 | Patient | **Paie le dwee en MCT** | `MediChainToken.payForMedicine` |
| 9 | Pharmacie #2 | Rejoindre registres · **Délivrer** | `MediChainPharmacy.dispense` |
| 10 | Médecin #1 (ou autre après sa propre réservation) | Revoit le **dossier permanent** (ajouts précédents inclus) | consultation requise |

## Contrats clés

- `MediChain` / `MediChainDoctor` — registres patient / médecin  
- `MediChainPay` — réservation / escrow consultation  
- `MedicalRecordNFT` — attestation soulbound du dossier  
- `MediChainPharmacy` — partage & délivrance médicament  
- `MediChainToken` (MCT) — flous↔token, bonus réservation, payer dwee  

## Notes

- Dossier patient = permanent ; un médecin suivant le voit **après sa propre consultation**.  
- Fichiers chiffrés AES-GCM at-rest ; CID démo (pas un pin IPFS réel).  
- Admin seed : `admin@medichain.app` / `Admin123!` (si `SEED_DEMO=true`).
