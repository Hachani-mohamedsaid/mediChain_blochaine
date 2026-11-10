import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { CHAIN, getContracts } from '../lib/chain'
import {
  clearNftWatchSeen,
  isNftWatchSeen,
  watchNftInMetaMask,
} from '../lib/watchNft'

const PROMPTED_KEY = 'medichain:mm-access-nft-prompted'

function promptedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(PROMPTED_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function markPrompted(tokenId: number) {
  const s = promptedSet()
  s.add(String(tokenId))
  localStorage.setItem(PROMPTED_KEY, JSON.stringify([...s]))
}

function clearPrompted(tokenId: number) {
  const s = promptedSet()
  s.delete(String(tokenId))
  localStorage.setItem(PROMPTED_KEY, JSON.stringify([...s]))
}

function wasPrompted(tokenId: number) {
  return promptedSet().has(String(tokenId))
}

async function listOwnedAccessNftIds(owner: string): Promise<number[]> {
  if (!CHAIN.AccessGrantNFT || !owner) return []
  const ctx = await getContracts()
  if (!ctx.accessNft) return []
  const me = owner.toLowerCase()
  const next = Number(await ctx.accessNft.nextTokenId())
  const ids: number[] = []
  for (let id = 1; id < next; id++) {
    try {
      const o = String(await ctx.accessNft.ownerOf(id)).toLowerCase()
      if (o === me) ids.push(id)
    } catch {
      /* skip */
    }
  }
  return ids
}

/**
 * Médecin : à l’entrée → 1 popup MetaMask pour le dernier NFT d’accès reçu.
 */
export function DoctorAccessNftBanner() {
  const { user } = useAuth()
  const { address, isHardhat, connect } = useWallet()
  const busy = useRef(false)
  const ready = useRef(false)
  const maxSeen = useRef(0)
  const doctorWallet = (
    user?.walletAddress ||
    address ||
    ''
  ).toLowerCase()

  const offerOnce = useCallback(
    async (tokenId: number, opts?: { retry?: boolean }) => {
      if (!tokenId || !CHAIN.AccessGrantNFT) return
      if (busy.current) return
      if (!opts?.retry) {
        if (isNftWatchSeen(tokenId, CHAIN.AccessGrantNFT)) return
        if (wasPrompted(tokenId)) return
      }

      busy.current = true
      if (opts?.retry) {
        clearPrompted(tokenId)
        clearNftWatchSeen(tokenId, CHAIN.AccessGrantNFT)
      }
      try {
        // MetaMask doit être sur le compte médecin (celui qui possède le NFT)
        if (!address || address.toLowerCase() !== doctorWallet) {
          await connect()
        }
        const r = await watchNftInMetaMask({
          tokenId,
          contract: CHAIN.AccessGrantNFT,
          force: true,
        })
        if (r.ok) markPrompted(tokenId)
      } catch {
        /* ignore */
      } finally {
        busy.current = false
      }
    },
    [address, doctorWallet, connect],
  )

  useEffect(() => {
    if (user?.role !== 'doctor' || !doctorWallet || !isHardhat) return
    ready.current = false
    maxSeen.current = 0

    void (async () => {
      // Laisse MetaMask / WalletContext se synchroniser
      await new Promise((r) => setTimeout(r, 600))
      try {
        if (!address) await connect()
        const owned = await listOwnedAccessNftIds(doctorWallet)
        if (owned.length) {
          const latest = Math.max(...owned)
          maxSeen.current = latest
          // Entrée médecin : forcer 1 popup pour le dernier NFT (même si un essai a échoué)
          await offerOnce(latest, { retry: true })
        }
      } catch {
        /* ignore */
      }
      ready.current = true
    })()

    const poll = window.setInterval(() => {
      if (!ready.current || busy.current) return
      void (async () => {
        try {
          const owned = await listOwnedAccessNftIds(doctorWallet)
          const newer = owned.filter((id) => id > maxSeen.current)
          if (!newer.length) return
          const latest = Math.max(...newer)
          maxSeen.current = Math.max(maxSeen.current, latest)
          await offerOnce(latest, { retry: true })
        } catch {
          /* ignore */
        }
      })()
    }, 4000)

    const onMinted = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{ tokenId?: number; doctorWallet?: string }>
      ).detail
      const tokenId = Number(detail?.tokenId)
      const doc = detail?.doctorWallet?.toLowerCase()
      if (!Number.isFinite(tokenId) || tokenId <= 0) return
      if (doc && doc !== doctorWallet) return
      maxSeen.current = Math.max(maxSeen.current, tokenId)
      void offerOnce(tokenId, { retry: true })
    }

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== 'medichain:access-nft-minted' || !ev.newValue) return
      try {
        const parsed = JSON.parse(ev.newValue) as {
          tokenId?: number
          doctorWallet?: string
        }
        const tokenId = Number(parsed.tokenId)
        const doc = parsed.doctorWallet?.toLowerCase()
        if (!Number.isFinite(tokenId) || tokenId <= 0) return
        if (doc && doc !== doctorWallet) return
        maxSeen.current = Math.max(maxSeen.current, tokenId)
        void offerOnce(tokenId, { retry: true })
      } catch {
        /* ignore */
      }
    }

    window.addEventListener(
      'medichain:access-nft-minted',
      onMinted as EventListener,
    )
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener(
        'medichain:access-nft-minted',
        onMinted as EventListener,
      )
      window.removeEventListener('storage', onStorage)
    }
  }, [user?.role, doctorWallet, address, isHardhat, connect, offerOnce])

  return null
}
