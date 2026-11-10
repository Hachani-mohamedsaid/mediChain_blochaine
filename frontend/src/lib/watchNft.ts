import { CHAIN, getContracts, getEthereum } from './chain'

const SEEN_KEY = 'medichain:mm-nft-watched'
const LAST_MAX_KEY = 'medichain:mm-nft-last-max'
let queue: Promise<unknown> = Promise.resolve()
const inFlight = new Map<string, Promise<WatchNftResult>>()

function seenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function markSeen(key: string) {
  const s = seenSet()
  s.add(key)
  localStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
}

function watchKey(contract: string, tokenId: number | string) {
  return `${contract.toLowerCase()}:${String(tokenId)}`
}

export function isNftWatchSeen(
  tokenId: number | string,
  contract?: string,
): boolean {
  const address = (contract || CHAIN.MedicalRecordNFT || '').toLowerCase()
  return seenSet().has(watchKey(address, tokenId))
}

export function clearNftWatchSeen(tokenId?: number | string, contract?: string) {
  if (tokenId == null) {
    localStorage.removeItem(SEEN_KEY)
    return
  }
  const address = (contract || CHAIN.MedicalRecordNFT || '').toLowerCase()
  const s = seenSet()
  s.delete(watchKey(address, tokenId))
  localStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
}

export function getLastKnownMaxNft(): number {
  try {
    return Number(localStorage.getItem(LAST_MAX_KEY) || '0') || 0
  } catch {
    return 0
  }
}

export function setLastKnownMaxNft(maxId: number) {
  localStorage.setItem(LAST_MAX_KEY, String(Math.max(0, maxId)))
}

export type WatchNftResult = {
  ok: boolean
  error?: string
}

/** Liste des tokenId ERC-721 possédés par le compte MetaMask actif */
export async function listOwnedNftIds(): Promise<number[]> {
  const ctx = await getContracts()
  const me = ctx.address.toLowerCase()
  const next = Number(await ctx.nft.nextTokenId())
  const ids: number[] = []
  for (let id = 1; id < next; id++) {
    try {
      const owner = String(await ctx.nft.ownerOf(id)).toLowerCase()
      if (owner === me) ids.push(id)
    } catch {
      /* skip */
    }
  }
  return ids
}

/**
 * Propose un NFT à MetaMask (compte actif = propriétaire).
 */
export async function watchNftInMetaMask(input: {
  tokenId: number | string
  contract?: string
  force?: boolean
}): Promise<WatchNftResult> {
  const address = (input.contract || CHAIN.MedicalRecordNFT || '').toLowerCase()
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { ok: false, error: 'Adresse contrat NFT invalide' }
  }

  const tokenId = String(input.tokenId)
  if (!tokenId || tokenId === '0') {
    return { ok: false, error: 'tokenId manquant' }
  }

  const key = watchKey(address, tokenId)
  if (!input.force && seenSet().has(key)) {
    return { ok: true }
  }

  const existing = inFlight.get(key)
  if (existing && !input.force) return existing

  const run = (async (): Promise<WatchNftResult> => {
    const eth = getEthereum() as
      | {
          request: (args: {
            method: string
            params?: unknown
          }) => Promise<unknown>
        }
      | undefined
    if (!eth?.request) {
      return { ok: false, error: 'MetaMask introuvable' }
    }

    try {
      const ctx = await getContracts()
      const isAccess =
        CHAIN.AccessGrantNFT &&
        address === CHAIN.AccessGrantNFT.toLowerCase()
      const nftContract = isAccess ? ctx.accessNft : ctx.nft
      if (!nftContract) {
        return { ok: false, error: 'Contrat NFT introuvable' }
      }
      const owner = String(await nftContract.ownerOf(tokenId)).toLowerCase()
      if (owner !== ctx.address.toLowerCase()) {
        return {
          ok: false,
          error: `NFT #${tokenId} n’est pas sur ce compte MetaMask.`,
        }
      }
    } catch {
      return { ok: false, error: `NFT #${tokenId} introuvable on-chain` }
    }

    const options = {
      address,
      tokenId,
      // Aide MetaMask à afficher quelque chose dans la popup
      symbol: 'MEDI',
      decimals: 0,
      image: '',
    }

    const request = async () => {
      try {
        return await eth.request({
          method: 'wallet_watchAsset',
          params: { type: 'ERC721', options },
        })
      } catch {
        return await eth.request({
          method: 'wallet_watchAsset',
          params: ['ERC721', options],
        })
      }
    }

    const result = await (queue = queue.then(async () => {
      try {
        if (!input.force && seenSet().has(key)) return { ok: true as const }
        const ok = await request()
        if (ok) markSeen(key)
        return { ok: Boolean(ok) }
      } catch (e) {
        const msg = String((e as { message?: string })?.message || e)
        if (/not owned|ownership|selected account/i.test(msg)) {
          return {
            ok: false,
            error: 'Ce NFT n’appartient pas au compte MetaMask actuel.',
          }
        }
        return { ok: false, error: msg.slice(0, 180) }
      }
    }))

    return result
  })()

  inFlight.set(key, run)
  try {
    return await run
  } finally {
    inFlight.delete(key)
  }
}

export async function watchNftsInMetaMask(
  tokenIds: Array<number | string>,
  contract?: string,
  force = false,
): Promise<number> {
  const unique = [...new Set(tokenIds.map((id) => String(id)))].filter(
    (id) => id && id !== '0',
  )
  let added = 0
  for (const id of unique) {
    const r = await watchNftInMetaMask({ tokenId: id, contract, force })
    if (r.ok) added += 1
  }
  return added
}

/**
 * Patient : lit les NFT qu’il possède on-chain et propose à MetaMask
 * uniquement ceux pas encore ajoutés (sauf force).
 */
export async function syncPatientNftsToMetaMask(opts?: {
  force?: boolean
}): Promise<{ owned: number[]; added: number; pending: number[] }> {
  const owned = await listOwnedNftIds()
  const contract = CHAIN.MedicalRecordNFT
  const pending = opts?.force
    ? owned
    : owned.filter((id) => !isNftWatchSeen(id, contract))
  const added = await watchNftsInMetaMask(pending, contract, Boolean(opts?.force))
  return { owned, added, pending }
}

/** Ids nouvellement détectés depuis la dernière visite (pour forcer la popup). */
export function detectNewOwnedIds(owned: number[]): number[] {
  if (!owned.length) return []
  const maxOwned = Math.max(...owned)
  const last = getLastKnownMaxNft()
  if (last <= 0) {
    // Première détection : pas de spam popup pour tout l’historique
    setLastKnownMaxNft(maxOwned)
    return owned.filter((id) => !isNftWatchSeen(id, CHAIN.MedicalRecordNFT))
  }
  const fresh = owned.filter((id) => id > last)
  if (maxOwned > last) setLastKnownMaxNft(maxOwned)
  return fresh
}
