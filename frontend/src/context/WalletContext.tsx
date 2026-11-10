import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  ensureHardhatNetwork,
  getEthereum,
  HARDHAT_CHAIN_ID_HEX,
} from '../lib/chain'
import { resolveRoleForWallet } from '../lib/walletRoles'

interface WalletContextValue {
  address: string | null
  chainId: string | null
  connecting: boolean
  error: string | null
  isHardhat: boolean
  /** Prêt pour lire/écrire on-chain — sans popup permissions si déjà lié */
  ensureReady: () => Promise<string>
  /** Connexion explicite (bouton) — re-auth si besoin */
  connect: () => Promise<string>
  connectPharmacy: () => Promise<void>
  disconnect: () => void
  clearError: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate()
  })
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, loginWithWallet, logout } = useAuth()
  const navigate = useNavigate()
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const switchingRef = useRef(false)
  const userRef = useRef(user)
  userRef.current = user
  const authLoadingRef = useRef(authLoading)
  authLoadingRef.current = authLoading
  /** Dernier compte vu — ignore les accountsChanged redondants */
  const lastAccountRef = useRef<string | null>(null)

  const refreshChain = useCallback(async () => {
    const eth = getEthereum()
    if (!eth) {
      setAddress(null)
      setChainId(null)
      return
    }
    try {
      const accounts = (await eth.request({
        method: 'eth_accounts',
      })) as string[]
      const cid = (await eth.request({ method: 'eth_chainId' })) as string
      setChainId(cid)
      const next = accounts[0]?.toLowerCase() ?? null
      setAddress(next)
      if (next) lastAccountRef.current = next
    } catch {
      /* MetaMask busy */
    }
  }, [])

  useEffect(() => {
    void refreshChain()
  }, [refreshChain, user])

  /**
   * Active le réseau Hardhat + comptes déjà autorisés.
   * N’ouvre PAS wallet_requestPermissions (évite la boucle MetaMask).
   */
  const ensureReady = useCallback(async () => {
    const eth = getEthereum()
    if (!eth) throw new Error('Installez MetaMask')
    await ensureHardhatNetwork(eth)
    let accounts = (await eth.request({
      method: 'eth_accounts',
    })) as string[]
    if (!accounts.length) {
      accounts = (await eth.request({
        method: 'eth_requestAccounts',
      })) as string[]
    }
    const addr = accounts[0]?.toLowerCase()
    if (!addr) throw new Error('Aucun compte MetaMask')
    setAddress(addr)
    lastAccountRef.current = addr
    const cid = (await eth.request({ method: 'eth_chainId' })) as string
    setChainId(cid)
    return addr
  }, [])

  /** Changement de compte MetaMask → re-login rôle (une seule fois) */
  const switchToAccount = useCallback(
    async (next: string) => {
      // Attendre que /auth/me ait fini — sinon on demande une signature
      // alors que la session JWT est déjà valide et l’UI s’ouvre.
      if (authLoadingRef.current) return

      const current = userRef.current?.walletAddress?.toLowerCase()
      if (current && current === next) {
        lastAccountRef.current = next
        return
      }

      // Pas de session : ne pas auto-signer. L’utilisateur clique « Connecter ».
      if (!userRef.current) {
        lastAccountRef.current = next
        return
      }

      if (switchingRef.current) return
      switchingRef.current = true
      setError(null)
      setConnecting(true)
      try {
        const u = await loginWithWallet(next)
        const linked = u.walletAddress?.toLowerCase() ?? next
        setAddress(linked)
        lastAccountRef.current = linked
        navigate('/dashboard', { replace: true })
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Changement de compte échoué — réessaie.',
        )
      } finally {
        switchingRef.current = false
        setConnecting(false)
        void refreshChain()
      }
    },
    [loginWithWallet, navigate, refreshChain],
  )

  // Après chargement JWT : aligner le compte sans redemander une signature
  // si c’est déjà le bon wallet.
  useEffect(() => {
    if (authLoading) return
    const session = user?.walletAddress?.toLowerCase()
    if (!session) return
    void (async () => {
      try {
        const eth = getEthereum()
        if (!eth) return
        const accounts = (await eth.request({
          method: 'eth_accounts',
        })) as string[]
        const next = accounts[0]?.toLowerCase() ?? null
        if (!next) return
        setAddress(next)
        if (next === session) {
          lastAccountRef.current = next
          return
        }
        // Vrai changement de compte après refresh → une seule re-auth
        void switchToAccount(next)
      } catch {
        /* ignore */
      }
    })()
  }, [authLoading, user?.walletAddress, switchToAccount])

  useEffect(() => {
    const eth = getEthereum()
    if (!eth || !('on' in eth)) return

    const onAccounts = (accounts: string[]) => {
      const next = accounts[0]?.toLowerCase() ?? null
      setAddress(next)
      if (!next) {
        lastAccountRef.current = null
        setError('Compte MetaMask déconnecté du site.')
        return
      }
      // Même compte déjà aligné avec la session → ignore
      const session = userRef.current?.walletAddress?.toLowerCase()
      if (lastAccountRef.current === next && (!session || session === next)) {
        return
      }
      void switchToAccount(next)
    }

    const onChain = (cid: string) => setChainId(cid)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = eth as any
    e.on?.('accountsChanged', onAccounts)
    e.on?.('chainChanged', onChain)
    return () => {
      e.removeListener?.('accountsChanged', onAccounts)
      e.removeListener?.('chainChanged', onChain)
    }
  }, [switchToAccount])

  // Sync douce : détecte un vrai changement de compte sans spammer MetaMask
  useEffect(() => {
    const eth = getEthereum()
    if (!eth) return
    const id = window.setInterval(() => {
      void (async () => {
        try {
          if (authLoadingRef.current || switchingRef.current) return
          const accounts = (await eth.request({
            method: 'eth_accounts',
          })) as string[]
          const next = accounts[0]?.toLowerCase() ?? null
          if (!next) return
          setAddress((prev) => (prev === next ? prev : next))
          const session = userRef.current?.walletAddress?.toLowerCase()
          if (!session || next === session) {
            lastAccountRef.current = next
            return
          }
          if (lastAccountRef.current === next) return
          void switchToAccount(next)
        } catch {
          /* ignore */
        }
      })()
    }, 4000)
    return () => window.clearInterval(id)
  }, [switchToAccount])

  /** Bouton portefeuille : si déjà lié au même compte, juste ensureReady */
  const connect = useCallback(async () => {
    if (switchingRef.current) {
      const eth = getEthereum()
      const accounts = eth
        ? ((await eth.request({ method: 'eth_accounts' })) as string[])
        : []
      const addr = accounts[0]?.toLowerCase()
      if (addr) return addr
      throw new Error('Connexion MetaMask en cours…')
    }
    setConnecting(true)
    setError(null)
    try {
      const addr = await ensureReady()
      const session = userRef.current?.walletAddress?.toLowerCase()
      if (session && session === addr) {
        lastAccountRef.current = addr
        return addr
      }
      // Nouveau compte ou pas encore lié → SIWE
      switchingRef.current = true
      const u = await loginWithWallet(addr)
      const linked = u.walletAddress?.toLowerCase() ?? addr
      setAddress(linked)
      lastAccountRef.current = linked
      return linked
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Connexion MetaMask impossible'
      setError(msg)
      throw e
    } finally {
      switchingRef.current = false
      setConnecting(false)
      void refreshChain()
    }
  }, [ensureReady, loginWithWallet, refreshChain])

  const connectPharmacy = useCallback(async () => {
    setError(null)
    setConnecting(true)
    switchingRef.current = true
    try {
      const eth = getEthereum()
      if (!eth) throw new Error('Installez MetaMask')
      await ensureHardhatNetwork(eth)
      await eth.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      })
      const accounts = (await eth.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const addr = accounts[0]?.toLowerCase()
      if (!addr) throw new Error('Aucun compte')
      if (resolveRoleForWallet(addr) !== 'pharmacy') {
        throw new Error(
          'Mauvais compte : choisis Account 3 (pharmacie) dans MetaMask.',
        )
      }
      const u = await loginWithWallet(addr, 'pharmacy')
      const linked = u.walletAddress?.toLowerCase() ?? addr
      setAddress(linked)
      lastAccountRef.current = linked
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Connexion pharmacie impossible',
      )
      throw e
    } finally {
      switchingRef.current = false
      setConnecting(false)
      void refreshChain()
    }
  }, [loginWithWallet, navigate, refreshChain])

  const disconnect = useCallback(() => {
    setAddress(null)
    lastAccountRef.current = null
    setError(null)
    logout()
  }, [logout])

  const clearError = useCallback(() => setError(null), [])

  const value = useMemo(
    () => ({
      address,
      chainId,
      connecting,
      error,
      isHardhat: chainId === HARDHAT_CHAIN_ID_HEX,
      ensureReady,
      connect,
      connectPharmacy,
      disconnect,
      clearError,
    }),
    [
      address,
      chainId,
      connecting,
      error,
      ensureReady,
      connect,
      connectPharmacy,
      disconnect,
      clearError,
    ],
  )

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) {
    return {
      address: null,
      chainId: null,
      connecting: false,
      error: null,
      isHardhat: false,
      ensureReady: async () => {
        throw new Error('Recharge la page (WalletProvider)')
      },
      connect: async () => {
        throw new Error('Recharge la page (WalletProvider)')
      },
      connectPharmacy: async () => undefined,
      disconnect: () => undefined,
      clearError: () => undefined,
    } satisfies WalletContextValue
  }
  return ctx
}
