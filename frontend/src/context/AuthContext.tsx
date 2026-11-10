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
import axios from 'axios'
import { BrowserProvider } from 'ethers'
import { api, setAuthToken, getAuthToken } from '../api/client'
import {
  ensureHardhatNetwork,
  getEthereum,
  HARDHAT_CHAIN_ID_HEX,
} from '../lib/chain'
import type { User, UserRole } from '../types'
import { resolveRoleForWallet } from '../lib/walletRoles'

export type SignupRole = 'patient' | 'doctor' | 'pharmacy' | 'supplier'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithWallet: (
    preferredAddress?: string,
    role?: SignupRole,
    displayName?: string,
  ) => Promise<User>
  register: (
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
  ) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate()
  })
}

function mapError(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as {
      message?: string | string[]
      code?: string
    }
    const msg = data?.message ?? err.message
    const errObj = new Error(
      Array.isArray(msg) ? msg.join(', ') : String(msg),
    ) as Error & { code?: string }
    if (data?.code) errObj.code = data.code
    // Nest sometimes nests code in message object
    if (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message?: { code?: string } }).message === 'object'
    ) {
      const nested = (data as { message: { code?: string; message?: string } })
        .message
      if (nested?.code) errObj.code = nested.code
      if (nested?.message) errObj.message = nested.message
    }
    return errObj
  }
  if (err instanceof Error) return err
  return new Error(fallback)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef<User | null>(null)
  userRef.current = user
  /** Évite plusieurs popups MetaMask « MediChain login » en parallèle */
  const loginInFlightRef = useRef<Promise<User> | null>(null)
  const loginInFlightKeyRef = useRef<string | null>(null)

  const refreshUser = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      setUser(null)
      return
    }
    const { data } = await api.get<User>('/auth/me')
    setUser(data)
  }, [])

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setLoading(false)
      return
    }
    void refreshUser()
      .catch(() => {
        setAuthToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await api.post<{ access_token: string; user: User }>(
        '/auth/login',
        { email, password },
      )
      setAuthToken(data.access_token)
      setUser(data.user)
    } catch (err) {
      throw mapError(err, 'Connexion impossible')
    }
  }, [])

  const loginWithWallet = useCallback(
    async (
      preferredAddress?: string,
      role?: SignupRole,
      displayName?: string,
    ) => {
      const preferred = preferredAddress?.toLowerCase()
      const flightKey = `${preferred ?? 'any'}|${role ?? ''}|${displayName ?? ''}`

      // Une seule demande de signature à la fois (même compte)
      if (loginInFlightRef.current) {
        if (loginInFlightKeyRef.current === flightKey || !preferred) {
          return loginInFlightRef.current
        }
      }

      const run = async (): Promise<User> => {
        try {
          // Session déjà OK pour ce wallet → aucune popup MetaMask
          const existingEarly = userRef.current
          const earlyWallet = existingEarly?.walletAddress?.toLowerCase()
          if (
            preferred &&
            existingEarly &&
            earlyWallet === preferred &&
            getAuthToken()
          ) {
            return existingEarly
          }

          const eth = getEthereum()
          if (!eth) throw new Error('Installez MetaMask pour continuer')
          await ensureHardhatNetwork(eth)

          let accounts = (await eth.request({
            method: 'eth_accounts',
          })) as string[]
          let connected = new Set(accounts.map((a) => a.toLowerCase()))

          // Compte 3 souvent pas encore autorisé → popup permissions MetaMask
          const needPermission =
            !accounts.length || (preferred != null && !connected.has(preferred))
          if (needPermission) {
            try {
              await eth.request({
                method: 'wallet_requestPermissions',
                params: [{ eth_accounts: {} }],
              })
            } catch {
              /* continue with eth_requestAccounts */
            }
          }

          // Relire après un changement de compte : la liste précédente
          // peut encore être l’ancien compte autorisé.
          accounts = (await eth.request({
            method: 'eth_requestAccounts',
          })) as string[]
          connected = new Set(accounts.map((a) => a.toLowerCase()))

          let address = (accounts[0] ?? preferred)?.toLowerCase()
          if (!address) throw new Error('Aucun compte wallet')

          if (preferred && !connected.has(preferred)) {
            throw new Error(
              'Ce compte MetaMask n’est pas autorisé pour le site. Clique Wallet et coche-le.',
            )
          }
          if (preferred && connected.has(preferred)) {
            address = preferred
          }

          // Session déjà valide pour ce wallet → pas de nouvelle signature
          const existing = userRef.current
          const existingWallet = existing?.walletAddress?.toLowerCase()
          if (existing && existingWallet === address && getAuthToken()) {
            return existing
          }

          // Compte MetaMask 1/2/3 → patient / médecin / pharmacie
          const resolvedRole = role ?? resolveRoleForWallet(address)

          const { data: nonceData } = await api.get<{
            nonce: string
            message: string
          }>('/auth/nonce', { params: { address } })

          const provider = new BrowserProvider(eth)
          const signer = await provider.getSigner(address)
          const signature = await signer.signMessage(nonceData.message)

          const { data } = await api.post<{ access_token: string; user: User }>(
            '/auth/wallet',
            {
              address,
              signature,
              role: resolvedRole,
              ...(displayName ? { displayName } : {}),
            },
          )
          setAuthToken(data.access_token)
          setUser(data.user)

          const cid = (await eth.request({ method: 'eth_chainId' })) as string
          if (cid === HARDHAT_CHAIN_ID_HEX) {
            try {
              await api.post('/blockchain/faucet', { address })
            } catch {
              /* optional */
            }
          }
          return data.user
        } catch (err) {
          throw mapError(err, 'Connexion wallet impossible')
        }
      }

      const promise = run().finally(() => {
        if (loginInFlightRef.current === promise) {
          loginInFlightRef.current = null
          loginInFlightKeyRef.current = null
        }
      })
      loginInFlightRef.current = promise
      loginInFlightKeyRef.current = flightKey
      return promise
    },
    [],
  )

  const register = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      role: UserRole,
    ) => {
      try {
        const { data } = await api.post<{ access_token: string; user: User }>(
          '/auth/register',
          { email, password, displayName, role },
        )
        setAuthToken(data.access_token)
        setUser(data.user)
      } catch (err) {
        throw mapError(err, 'Inscription impossible')
      }
    },
    [],
  )

  const logout = useCallback(() => {
    setAuthToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      loginWithWallet,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, loginWithWallet, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
