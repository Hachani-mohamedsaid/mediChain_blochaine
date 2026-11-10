import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faClipboardList,
  faCoins,
  faCube,
  faFileMedical,
  faHouse,
  faKey,
  faFolderPlus,
  faPaperPlane,
  faPills,
  faRightFromBracket,
  faTruck,
  faUserDoctor,
  faUserInjured,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../BrandLogo'
import { useAuth } from '../../context/AuthContext'
import { useWallet } from '../../context/WalletContext'
import { getContracts } from '../../lib/chain'
import { cn, truncateAddress } from '../../lib/utils'

type NavItem = { to: string; label: string; icon: typeof faHouse }

const patientLinks: NavItem[] = [
  { to: '/dashboard', label: 'Accueil', icon: faHouse },
  { to: '/records', label: 'Dossier', icon: faFileMedical },
  { to: '/payments', label: 'Réserver', icon: faCoins },
  { to: '/pharmacy', label: 'Médicaments', icon: faPills },
  { to: '/tokens', label: 'Tokens', icon: faCoins },
  { to: '/access', label: 'Partager', icon: faKey },
  { to: '/audit', label: 'Historique', icon: faClipboardList },
  { to: '/blockchain', label: 'État', icon: faCube },
]

const doctorLinks: NavItem[] = [
  { to: '/dashboard', label: 'Accueil', icon: faHouse },
  { to: '/records', label: 'Dossiers', icon: faFileMedical },
  { to: '/ajouter', label: 'Ajouter', icon: faFolderPlus },
  { to: '/envoyer', label: 'Envoyer', icon: faPaperPlane },
  { to: '/payments', label: 'Tarifs', icon: faCoins },
  { to: '/access', label: 'Accès', icon: faKey },
  { to: '/audit', label: 'Traces', icon: faClipboardList },
  { to: '/blockchain', label: 'État', icon: faCube },
]

const pharmacyLinks: NavItem[] = [
  { to: '/dashboard', label: 'Accueil', icon: faHouse },
  { to: '/pharmacy', label: 'Délivrance', icon: faPills },
  { to: '/supplier', label: 'Mon stock', icon: faTruck },
  { to: '/records', label: 'Ordonnances', icon: faFileMedical },
  { to: '/audit', label: 'Historique', icon: faClipboardList },
  { to: '/blockchain', label: 'État', icon: faCube },
]

const supplierLinks: NavItem[] = [
  { to: '/dashboard', label: 'Accueil', icon: faHouse },
  { to: '/supplier', label: 'Livraisons', icon: faTruck },
  { to: '/blockchain', label: 'État', icon: faCube },
]

function roleLabel(role: string) {
  if (role === 'doctor') return 'Médecin'
  if (role === 'pharmacy') return 'Pharmacie'
  if (role === 'supplier') return 'Fournisseur'
  return 'Patient'
}

export function AppNavbar() {
  const { user, logout } = useAuth()
  const { address, connecting, connect, isHardhat } = useWallet()
  const navigate = useNavigate()
  const location = useLocation()
  const [supplyAlert, setSupplyAlert] = useState(false)

  useEffect(() => {
    if (!user || (user.role !== 'supplier' && user.role !== 'pharmacy')) {
      setSupplyAlert(false)
      return
    }
    let cancelled = false

    async function poll() {
      try {
        const ctx = await getContracts()
        if (!ctx.supply || cancelled) return
        const mine = (await ctx.signer.getAddress()).toLowerCase()
        const next = Number(await ctx.supply.nextOrderId())
        let hit = false
        for (let id = 1; id < next; id++) {
          const o = await ctx.supply.orders(id)
          const status = Number(o.status ?? o[7])
          if (status !== 1) continue
          const pharmacy = String(o.pharmacy ?? o[0]).toLowerCase()
          const supplier = String(o.supplier ?? o[1]).toLowerCase()
          if (user.role === 'supplier' && supplier === mine) {
            hit = true
            break
          }
          if (user.role === 'pharmacy' && pharmacy === mine) {
            hit = true
            break
          }
        }
        if (!cancelled) setSupplyAlert(hit)
      } catch {
        if (!cancelled) setSupplyAlert(false)
      }
    }

    void poll()
    const t = window.setInterval(() => void poll(), 6000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [user, address, location.pathname])

  if (!user) return null

  const links =
    user.role === 'doctor'
      ? doctorLinks
      : user.role === 'pharmacy'
        ? pharmacyLinks
        : user.role === 'supplier'
          ? supplierLinks
          : patientLinks

  const roleIcon =
    user.role === 'doctor'
      ? faUserDoctor
      : user.role === 'pharmacy'
        ? faPills
        : user.role === 'supplier'
          ? faTruck
          : faUserInjured

  function handleLogout() {
    logout()
    navigate('/')
  }

  async function handleConnect() {
    try {
      await connect()
    } catch {
      /* ignore */
    }
  }

  const walletLabel = connecting
    ? address
      ? truncateAddress(address, 3)
      : '…'
    : address
      ? isHardhat
        ? truncateAddress(address, 4)
        : `${truncateAddress(address, 3)} · réseau`
      : 'Wallet'

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="sticky top-0 z-50 border-b border-teal-brand/10 bg-white/95 backdrop-blur-xl"
    >
      {/* Ligne 1 : marque + compte */}
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <BrandLogo size="md" to="/dashboard" className="!text-2xl" />

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={connecting && !address}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
              address
                ? isHardhat
                  ? 'border-teal-brand/30 bg-teal-brand/5 text-teal-brand'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-slate-200 text-slate-600 hover:border-teal-brand/40',
            )}
            title={
              address
                ? isHardhat
                  ? address
                  : 'Mauvais réseau — Hardhat Local (31337)'
                : 'Connecter MetaMask'
            }
          >
            <FontAwesomeIcon icon={faWallet} className="h-3 w-3 shrink-0" />
            <span className="hidden font-mono sm:inline">{walletLabel}</span>
          </button>

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-2 rounded-full border px-2 py-1 transition sm:px-3 sm:py-1.5',
                isActive
                  ? 'border-teal-brand bg-teal-brand/10 text-teal-brand'
                  : 'border-slate-200 bg-white text-charcoal hover:border-teal-brand/30',
              )
            }
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-brand text-sm text-white">
              <FontAwesomeIcon icon={roleIcon} />
            </span>
            <span className="hidden min-w-0 flex-col leading-tight sm:flex">
              <span className="max-w-[9rem] truncate text-sm font-semibold">
                {user.displayName}
              </span>
              <span className="text-[10px] font-medium text-slate-500">
                {roleLabel(user.role)}
              </span>
            </span>
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            title="Déconnexion"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <FontAwesomeIcon
              icon={faRightFromBracket}
              className="h-3.5 w-3.5"
            />
          </button>
        </div>
      </div>

      {/* Ligne 2 : navigation claire, espacée */}
      <nav className="border-t border-slate-100/80 bg-mint-soft/30">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-2 sm:justify-center sm:gap-1.5 sm:px-6">
          {links.map(({ to, label, icon }) => {
            const showDot = supplyAlert && to === '/supplier'
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'bg-teal-brand text-white shadow-sm shadow-teal-brand/25'
                      : 'text-slate-600 hover:bg-white hover:text-charcoal',
                  )
                }
              >
                <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
                {label}
                {showDot ? (
                  <span
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"
                    aria-label="Nouvelle commande"
                  />
                ) : null}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </motion.header>
  )
}
