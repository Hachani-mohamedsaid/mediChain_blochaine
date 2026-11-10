import axios from 'axios'
import { keccak256 } from 'ethers'
import { api } from '../api/client'
import type { MedicalRecord } from '../types'
import {
  CHAIN,
  getContracts,
  NFT_MINT_GAS_LIMIT,
  nftMetadataUri,
} from './chain'
import { formatTxError, okMessage, sendLocalTx } from './tx'

export type IssueResult = {
  record: MedicalRecord
  issueTxHash: string
  nftNote: string
}

const ZERO_TX = `0x${'0'.repeat(64)}`

function asTokenId(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Mint (si besoin) + enregistre tokenId en base pour une fiche médecin */
export async function anchorRecordNft(input: {
  record: MedicalRecord
  patientWallet: string
  connectWallet: () => Promise<string>
}): Promise<{ tokenId: number; mintTxHash: string }> {
  await input.connectWallet()
  try {
    await api.post('/blockchain/ensure-doctor')
  } catch {
    /* best-effort */
  }
  const ctx = await getContracts()

  if (!(await ctx.doctor.isDoctor(ctx.address))) {
    await sendLocalTx((gas) => ctx.doctor.joinAsDoctor(gas))
  }
  if (ctx.license && !(await ctx.license.hasValidLicense(ctx.address))) {
    throw new Error(
      'Licence médicale on-chain manquante. Reconnecte le wallet médecin.',
    )
  }
  if (!(await ctx.mediChain.isPatient(input.patientWallet))) {
    throw new Error(
      'Patient pas inscrit on-chain. Réessaie (ensure-patient) ou reconnecte le patient.',
    )
  }

  const hash = input.record.contentHash
  if (!hash || hash === ZERO_TX) {
    throw new Error('Hash document manquant')
  }

  let tokenId = asTokenId(await ctx.nft.tokenOfHash(hash))
  let mintTxHash = input.record.mintTxHash || ''

  if (!tokenId) {
    const uri = nftMetadataUri({
      title: input.record.title,
      contentHash: hash,
      recordId: input.record.id,
    })
    const minted = await sendLocalTx(
      (gas) =>
        ctx.nft.mintForPatient(input.patientWallet, hash, uri, gas),
      {
        gasLimit: NFT_MINT_GAS_LIMIT,
        verifyOk: async () => asTokenId(await ctx.nft.tokenOfHash(hash)) > 0,
      },
    )
    mintTxHash =
      minted.hash.startsWith('0x') && minted.hash.length === 66
        ? minted.hash
        : ZERO_TX
    tokenId = asTokenId(await ctx.nft.tokenOfHash(hash))
  }

  if (!tokenId) {
    throw new Error('Mint NFT échoué — aucun tokenId')
  }

  const txHash =
    mintTxHash && /^0x[a-fA-F0-9]{64}$/.test(mintTxHash)
      ? mintTxHash
      : ZERO_TX

  await api.patch(`/records/${input.record.id}/nft`, {
    tokenId,
    mintTxHash: txHash,
    nftContract: CHAIN.MedicalRecordNFT,
  })

  return { tokenId, mintTxHash: txHash }
}

/** Patient ancre sa fiche en NFT (mint) si pas encore fait — pour Partager. */
export async function ensurePatientRecordNft(input: {
  record: MedicalRecord
  connectWallet: () => Promise<string>
}): Promise<{ tokenId: number; minted: boolean }> {
  await input.connectWallet()
  const ctx = await getContracts()
  if (!(await ctx.mediChain.isPatient(ctx.address))) {
    await sendLocalTx((gas) => ctx.mediChain.joinAsPatient(gas))
  }

  const hash = input.record.contentHash
  if (!hash || hash === ZERO_TX) {
    throw new Error('Hash document manquant')
  }

  let tokenId = asTokenId(await ctx.nft.tokenOfHash(hash))
  let minted = false
  let mintTxHash = input.record.mintTxHash || ''

  if (!tokenId) {
    const uri = nftMetadataUri({
      title: input.record.title,
      contentHash: hash,
      recordId: input.record.id,
    })
    const mintedTx = await sendLocalTx(
      (gas) => ctx.nft.mint(hash, uri, gas),
      {
        gasLimit: NFT_MINT_GAS_LIMIT,
        verifyOk: async () => asTokenId(await ctx.nft.tokenOfHash(hash)) > 0,
      },
    )
    mintTxHash =
      mintedTx.hash.startsWith('0x') && mintedTx.hash.length === 66
        ? mintedTx.hash
        : ZERO_TX
    tokenId = asTokenId(await ctx.nft.tokenOfHash(hash))
    minted = true
  }

  if (!tokenId) {
    throw new Error('Mint NFT échoué — aucun tokenId')
  }

  const txHash =
    mintTxHash && /^0x[a-fA-F0-9]{64}$/.test(mintTxHash)
      ? mintTxHash
      : ZERO_TX

  if (minted || !input.record.tokenId) {
    await api.patch(`/records/${input.record.id}/nft`, {
      tokenId,
      mintTxHash: txHash,
      nftContract: CHAIN.MedicalRecordNFT,
    })
  }

  return { tokenId, minted }
}

/** Envoi médecin → patient : issueDocument on-chain + upload + mint NFT soulbound */
export async function issueDocumentToPatient(input: {
  file: File
  patientId: string
  title: string
  connectWallet: () => Promise<string>
}): Promise<IssueResult> {
  const wallet = await input.connectWallet()
  try {
    await api.post('/blockchain/faucet', { address: wallet })
  } catch {
    /* ignore */
  }
  try {
    await api.post('/blockchain/ensure-doctor')
  } catch {
    /* licence mintée à la connexion si admin RPC OK */
  }

  const { data: ready } = await api.post<{ walletAddress: string }>(
    '/blockchain/ensure-patient',
    { patientId: input.patientId },
  )
  const patientWallet = ready.walletAddress

  const ctx = await getContracts()
  if (!(await ctx.doctor.isDoctor(ctx.address))) {
    await sendLocalTx((gas) => ctx.doctor.joinAsDoctor(gas))
  }
  if (ctx.license && !(await ctx.license.hasValidLicense(ctx.address))) {
    try {
      await api.post('/blockchain/ensure-doctor')
    } catch {
      /* ignore */
    }
    if (!(await ctx.license.hasValidLicense(ctx.address))) {
      throw new Error(
        'Licence médicale on-chain manquante. Reconnecte le wallet médecin.',
      )
    }
  }

  const buf = new Uint8Array(await input.file.arrayBuffer())
  const docHash = keccak256(buf)
  const title =
    input.title.trim() ||
    input.file.name.replace(/\.[^.]+$/, '') ||
    'Ordonnance'
  const kind = title.toLowerCase().includes('certificat')
    ? 'certificat'
    : title.toLowerCase().includes('compte')
      ? 'compte_rendu'
      : 'ordonnance'

  const { hash: issueTxHash } = await sendLocalTx((gas) =>
    ctx.doctor.issueDocument(patientWallet, docHash, kind, gas),
  )

  const form = new FormData()
  form.append('file', input.file)
  form.append('patientId', input.patientId)
  form.append('title', title)
  form.append('issueTxHash', issueTxHash)
  const { data: created } = await api.post<MedicalRecord>(
    '/records/issue',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )

  // Aligne le hash NFT sur le hash issu du fichier (même keccak que l’issue)
  const recordForNft: MedicalRecord = {
    ...created,
    contentHash: created.contentHash || docHash,
  }

  let nftNote = ''
  try {
    const { tokenId } = await anchorRecordNft({
      record: recordForNft,
      patientWallet,
      connectWallet: async () => wallet,
    })
    nftNote = ` · NFT #${tokenId} ancré chez le patient — il confirme la modale / popup MetaMask`
    try {
      localStorage.setItem(
        'medichain:nft-minted',
        JSON.stringify({ tokenId, at: Date.now() }),
      )
      window.dispatchEvent(
        new CustomEvent('medichain:nft-minted', { detail: { tokenId } }),
      )
    } catch {
      /* ignore */
    }
  } catch (nftErr) {
    const detail = axios.isAxiosError(nftErr)
      ? String(
          (nftErr.response?.data as { message?: string })?.message ??
            `API ${nftErr.response?.status ?? ''}`,
        )
      : nftErr instanceof Error
        ? nftErr.message
        : 'erreur'
    nftNote = ` · NFT non ancré (${detail})`
  }

  return {
    record: created,
    issueTxHash,
    nftNote: okMessage(nftNote || 'Document envoyé'),
  }
}

export function formatIssueError(err: unknown): string {
  return formatTxError(err, 'Envoi impossible')
}
