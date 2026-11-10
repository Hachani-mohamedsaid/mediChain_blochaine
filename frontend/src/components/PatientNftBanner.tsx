import { useCallback, useEffect, useRef } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import {
  isNftWatchSeen,
  listOwnedNftIds,
  setLastKnownMaxNft,
  watchNftInMetaMask,
} from '../lib/watchNft'
import { CHAIN } from '../lib/chain'
import type { MedicalRecord } from '../types'

const PROMPTED_KEY = 'medichain:mm-nft-prompted'

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

function wasPrompted(tokenId: number) {
  return promptedSet().has(String(tokenId))
}

/**
 * Invisible.
 * - Entrée patient → 1 seule popup MetaMask pour le DERNIER NFT du médecin.
 * - Nouvel envoi → 1 popup pour ce NFT.
 * - Jamais une file de popups pour tout l’historique.
 */
export function PatientNftBanner() {
  const { user } = useAuth()
  const { address, isHardhat } = useWallet()
  const busy = useRef(false)
  const ready = useRef(false)
  const knownApi = useRef<Set<number>>(new Set())
  const maxSeen = useRef(0)

  const offerOnce = useCallback(async (tokenId: number) => {
    if (!tokenId || tokenId <= 0) return
    if (busy.current) return
    if (isNftWatchSeen(tokenId, CHAIN.MedicalRecordNFT)) return
    if (wasPrompted(tokenId)) return

    busy.current = true
    markPrompted(tokenId)
    try {
      await watchNftInMetaMask({
        tokenId,
        contract: CHAIN.MedicalRecordNFT,
        force: true,
      })
    } catch {
      /* ignore */
    } finally {
      busy.current = false
    }
  }, [])

  async function latestTokenId(): Promise<number> {
    let max = 0
    try {
      const owned = await listOwnedNftIds()
      if (owned.length) max = Math.max(max, ...owned)
    } catch {
      /* ignore */
    }
    try {
      const { data } = await api.get<MedicalRecord[]>('/records/mine')
      for (const r of data) {
        const id = Number(r.tokenId)
        if (Number.isFinite(id) && id > max) max = id
      }
    } catch {
      /* ignore */
    }
    return max
  }

  useEffect(() => {
    if (user?.role !== 'patient' || !address || !isHardhat) return
    ready.current = false
    knownApi.current = new Set()
    maxSeen.current = 0

    void (async () => {
      try {
        const { data } = await api.get<MedicalRecord[]>('/records/mine')
        const ids = data
          .map((r) => Number(r.tokenId))
          .filter((id) => Number.isFinite(id) && id > 0)
        knownApi.current = new Set(ids)
      } catch {
        /* ignore */
      }

      const latest = await latestTokenId()
      if (latest > 0) {
        maxSeen.current = latest
        setLastKnownMaxNft(latest)
        // Entrée : uniquement le dernier NFT, une fois
        await offerOnce(latest)
      }
      ready.current = true
    })()

    const poll = window.setInterval(() => {
      if (!ready.current || busy.current) return
      void (async () => {
        try {
          const owned = await listOwnedNftIds()
          const newer = owned.filter((id) => id > maxSeen.current)
          if (newer.length) {
            const latest = Math.max(...newer)
            maxSeen.current = Math.max(maxSeen.current, latest)
            setLastKnownMaxNft(maxSeen.current)
            await offerOnce(latest)
            return
          }
        } catch {
          /* ignore */
        }
        try {
          const { data } = await api.get<MedicalRecord[]>('/records/mine')
          const ids = data
            .map((r) => Number(r.tokenId))
            .filter((id) => Number.isFinite(id) && id > 0)
          const fresh = ids.filter((id) => !knownApi.current.has(id))
          if (!fresh.length) return
          for (const id of fresh) knownApi.current.add(id)
          const latest = Math.max(...fresh)
          maxSeen.current = Math.max(maxSeen.current, latest)
          setLastKnownMaxNft(maxSeen.current)
          await offerOnce(latest)
        } catch {
          /* ignore */
        }
      })()
    }, 5000)

    const onMinted = (ev: Event) => {
      if (!ready.current) return
      const tokenId = Number(
        (ev as CustomEvent<{ tokenId?: number }>).detail?.tokenId,
      )
      if (!Number.isFinite(tokenId) || tokenId <= 0) return
      knownApi.current.add(tokenId)
      maxSeen.current = Math.max(maxSeen.current, tokenId)
      setLastKnownMaxNft(maxSeen.current)
      void offerOnce(tokenId)
    }

    const onStorage = (ev: StorageEvent) => {
      if (!ready.current) return
      if (ev.key !== 'medichain:nft-minted' || !ev.newValue) return
      try {
        const parsed = JSON.parse(ev.newValue) as { tokenId?: number }
        const tokenId = Number(parsed.tokenId)
        if (!Number.isFinite(tokenId) || tokenId <= 0) return
        knownApi.current.add(tokenId)
        maxSeen.current = Math.max(maxSeen.current, tokenId)
        setLastKnownMaxNft(maxSeen.current)
        void offerOnce(tokenId)
      } catch {
        /* ignore */
      }
    }

    window.addEventListener('medichain:nft-minted', onMinted as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener(
        'medichain:nft-minted',
        onMinted as EventListener,
      )
      window.removeEventListener('storage', onStorage)
    }
  }, [user?.role, address, isHardhat, offerOnce])

  return null
}
