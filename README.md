# MediChain

Dossiers médicaux sous contrôle patient. Smart contracts + MetaMask (Hardhat local) + fichiers chiffrés hors chaîne.

## Architecture

| Couche | Rôle |
|--------|------|
| React | UI patient / médecin / admin |
| NestJS | Auth JWT, dossiers chiffrés, grants, faucet, audit |
| `MediChain.sol` | join / grant / revoke / open |
| `MediChainDoctor.sol` | issueDocument (ordo / certificat) |
| `MedicalRecordNFT.sol` | NFT soulbound (hash) |

## Démarrage rapide

Voir le scénario pas-à-pas : **[DEMO.md](./DEMO.md)**

```bash
cd contracts && npm run node          # T1
cd contracts && npm run deploy:local  # T2
cd backend && cp .env.example .env && npm i --legacy-peer-deps && npm run start:dev
cd frontend && npm i && npm run dev   # optionnel: VITE_API_URL=http://localhost:3001
```

- UI : http://localhost:5173  
- API : http://localhost:3001  

Inscription via l’UI (patient / médecin). Pas de comptes démo exposés.

## Fonctionnalités clés

- **MetaMask obligatoire** pour grant / issue / mint NFT / openDocument  
- **Faucet** ETH test à la connexion Hardhat  
- **Chiffrement** AES-256-GCM at-rest (`FILE_ENCRYPTION_KEY`)  
- **CID démo** content-addressed dérivé du hash (pas un pin IPFS réel)  
- **Audit** : journal app + events chaîne (`/audit/chain`)  
- **Admin** : `/admin` statut contrats + listes users  

## Tests

```bash
cd backend && npm test -- file-crypto
cd contracts && npx hardhat test
```
