import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCopy,
  faFingerprint,
  faIdCard,
  faRightFromBracket,
  faStethoscope,
  faUserDoctor,
  faUserInjured,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { getContracts } from '../lib/chain'
import { DOCTOR_SPECIALTIES } from '../lib/specialties'
import { truncateAddress } from '../lib/utils'
import type { User } from '../types'

function roleLabel(role: string) {
  if (role === 'doctor') return 'Médecin'
  if (role === 'pharmacy') return 'Pharmacie'
  if (role === 'supplier') return 'Fournisseur'
  return 'Patient'
}

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth()
  const { address, connecting, connect, ensureReady, isHardhat, error } =
    useWallet()
  const navigate = useNavigate()
  const [copied, setCopied] = useState<string | null>(null)
  const [specialty, setSpecialty] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [license, setLicense] = useState<{
    tokenId: number
    specialty: string
    active: boolean
  } | null>(null)

  useEffect(() => {
    setSpecialty(user?.specialty ?? '')
  }, [user?.specialty])

  useEffect(() => {
    if (!address || user?.role !== 'doctor') {
      setLicense(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        await ensureReady()
        const ctx = await getContracts()
        if (cancelled || !ctx.license) return
        const [tokenId, specialty, active] = await ctx.license.getLicense(
          ctx.address,
        )
        if (!cancelled) {
          setLicense({
            tokenId: Number(tokenId),
            specialty: String(specialty),
            active: Boolean(active),
          })
        }
      } catch {
        if (!cancelled) setLicense(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [address, user?.role, ensureReady])

  if (!user) return null

  const isDoctor = user.role === 'doctor'
  const roleIcon = isDoctor ? faUserDoctor : faUserInjured
  const displayWallet = address ?? user.walletAddress
  const dirty = isDoctor && specialty !== (user.specialty ?? '')

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  async function saveSpecialty() {
    if (!isDoctor) return
    setSaving(true)
    setSaveMsg('')
    setSaveErr('')
    try {
      await api.patch<User>('/users/me', { specialty })
      await refreshUser()
      setSaveMsg('Spécialité enregistrée.')
    } catch (e) {
      setSaveErr(
        e instanceof Error
          ? e.message
          : 'Impossible d’enregistrer la spécialité.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mon profil"
        subtitle="Identité et portefeuille."
      />
      <SpotlightCard className="p-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-teal-brand/10 text-4xl text-teal-brand ring-4 ring-teal-brand/20">
            <FontAwesomeIcon icon={roleIcon} />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-display text-2xl font-semibold text-charcoal">
              {user.displayName}
            </h2>
            <p className="text-slate-600">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <p className="inline-flex rounded-full bg-cyan-brand/15 px-3 py-0.5 text-xs font-semibold capitalize text-teal-brand">
                {roleLabel(user.role)}
              </p>
              {isDoctor && user.specialty ? (
                <p className="inline-flex rounded-full bg-mint-soft px-3 py-0.5 text-xs font-semibold text-teal-900">
                  {user.specialty}
                </p>
              ) : null}
              {license?.active ? (
                <p className="inline-flex items-center gap-1 rounded-full bg-teal-brand/10 px-3 py-0.5 text-xs font-semibold text-teal-brand">
                  <FontAwesomeIcon icon={faIdCard} />
                  Licence #{license.tokenId}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {isDoctor && (
          <div className="mt-8 rounded-xl border border-teal-brand/20 bg-mint-soft/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
              <FontAwesomeIcon icon={faIdCard} className="text-teal-brand" />
              Licence médicale on-chain
            </div>
            {license?.active ? (
              <p className="mt-2 text-sm text-slate-700">
                Soulbound NFT #{license.tokenId}
                {license.specialty ? ` · ${license.specialty}` : ''} — requise
                pour émettre un document.
              </p>
            ) : (
              <p className="mt-2 text-sm text-amber-900">
                Pas de licence valide. Reconnecte le wallet médecin (mint auto),
                sinon{' '}
                <code className="text-xs">issueDocument</code> est bloqué.
              </p>
            )}
          </div>
        )}

        {isDoctor && (
          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
              <FontAwesomeIcon
                icon={faStethoscope}
                className="text-teal-brand"
              />
              Spécialité
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Visible par les patients lors du partage d’accès et des paiements.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="text-sm font-medium text-slate-700">
                  Choisir une spécialité
                </label>
                <select
                  value={specialty}
                  onChange={(e) => {
                    setSpecialty(e.target.value)
                    setSaveMsg('')
                    setSaveErr('')
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
                >
                  <option value="">— non renseignée —</option>
                  {DOCTOR_SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void saveSpecialty()}
                className="rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
            {saveMsg && (
              <p className="mt-2 text-xs text-teal-brand">{saveMsg}</p>
            )}
            {saveErr && <p className="mt-2 text-xs text-red-600">{saveErr}</p>}
          </div>
        )}

        <div className="mt-8 space-y-4">
          <div className="rounded-xl bg-mint-soft p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                <FontAwesomeIcon icon={faWallet} className="text-teal-brand" />
                Portefeuille
              </div>
              <button
                type="button"
                disabled={connecting}
                onClick={() => void connect()}
                className="rounded-full bg-teal-brand px-4 py-1.5 text-xs font-semibold text-white"
              >
                {connecting
                  ? 'Connexion…'
                  : address
                    ? 'Reconnecter'
                    : 'Connecter le wallet'}
              </button>
            </div>
            {displayWallet ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="break-all text-xs text-slate-700">
                  {displayWallet}
                </code>
                <button
                  type="button"
                  onClick={() => copy(displayWallet, 'w')}
                  className="rounded-lg bg-white px-2 py-1 text-xs text-teal-brand"
                >
                  <FontAwesomeIcon icon={faCopy} />{' '}
                  {copied === 'w' ? 'Copié' : truncateAddress(displayWallet)}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Connectez votre wallet.
              </p>
            )}
            {address && !isHardhat && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Mauvais réseau — basculez sur Hardhat Local (chainId 31337).
              </p>
            )}
            {error && (
              <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
            )}
          </div>
          {user.didHash && (
            <div className="rounded-xl bg-mint-soft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                <FontAwesomeIcon
                  icon={faFingerprint}
                  className="text-teal-brand"
                />
                DID hash
              </div>
              <code className="mt-2 block break-all text-xs text-slate-700">
                {user.didHash}
              </code>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <FontAwesomeIcon icon={faRightFromBracket} />
          Déconnexion
        </button>
      </SpotlightCard>
    </div>
  )
}
