import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheck,
  faChevronDown,
  faChevronUp,
  faCircleCheck,
  faIdCard,
  faScaleBalanced,
  faTriangleExclamation,
  faUserInjured,
} from '@fortawesome/free-solid-svg-icons'
import { Contract } from 'ethers'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { CHAIN, getBrowserProvider } from '../lib/chain'
import licenseAbi from '../abi/DoctorLicenseNFT.abi.json'
import { truncateAddress } from '../lib/utils'
import type { BlockchainStatus, User } from '../types'

type LicenseInfo = { tokenId: number; specialty: string; active: boolean }

const SHARE_PRESETS = [
  { label: '100 % patient', pct: 0 },
  { label: '30 % médecin', pct: 30 },
  { label: '50 / 50', pct: 50 },
  { label: '70 % médecin', pct: 70 },
  { label: '100 % médecin', pct: 100 },
]

export default function AdminPage() {
  const { user } = useAuth()
  const { connect, address } = useWallet()
  const [status, setStatus] = useState<BlockchainStatus | null>(null)
  const [patients, setPatients] = useState<User[]>([])
  const [doctors, setDoctors] = useState<User[]>([])
  const [licenses, setLicenses] = useState<Record<string, LicenseInfo>>({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState('1')
  const [doctorPct, setDoctorPct] = useState(70)
  const [resolving, setResolving] = useState(false)
  const [showTech, setShowTech] = useState(false)

  const licensedCount = useMemo(
    () => Object.values(licenses).filter((l) => l.active).length,
    [licenses],
  )

  async function loadLicenses(docs: User[]) {
    if (!CHAIN.DoctorLicenseNFT) return
    try {
      if (!address) await connect()
      const provider = await getBrowserProvider()
      const license = new Contract(
        CHAIN.DoctorLicenseNFT,
        licenseAbi,
        provider,
      )
      const map: Record<string, LicenseInfo> = {}
      for (const d of docs) {
        if (!d.walletAddress) continue
        try {
          const [tokenId, specialty, active] = await license.getLicense(
            d.walletAddress,
          )
          const id = Number(tokenId)
          if (id > 0) {
            map[d.id] = {
              tokenId: id,
              specialty: String(specialty),
              active: Boolean(active),
            }
          }
        } catch {
          /* ignore one doctor */
        }
      }
      setLicenses(map)
    } catch {
      /* wallet absent — keep empty */
    }
  }

  async function load() {
    const [s, p, d] = await Promise.all([
      api.get<BlockchainStatus>('/blockchain/status'),
      api.get<User[]>('/users/patients'),
      api.get<User[]>('/users/doctors'),
    ])
    setStatus(s.data)
    setPatients(p.data)
    setDoctors(d.data)
    await loadLicenses(d.data)
  }

  useEffect(() => {
    if (user?.role !== 'admin') return
    void load().catch(() => setError('Chargement admin impossible.'))
  }, [user])

  async function mintLicense(doctor: User) {
    setBusyId(doctor.id)
    setError('')
    setMessage('')
    try {
      const { data } = await api.post<{
        tokenId: number
        txHash: string
        specialty: string
      }>('/blockchain/mint-doctor-license', {
        doctorId: doctor.id,
        specialty: doctor.specialty || 'Médecine générale',
      })
      setLicenses((prev) => ({
        ...prev,
        [doctor.id]: {
          tokenId: data.tokenId,
          specialty: data.specialty,
          active: true,
        },
      }))
      setMessage(
        data.txHash === 'already-licensed'
          ? `${doctor.displayName} a déjà la licence #${data.tokenId}.`
          : `Licence #${data.tokenId} délivrée à ${doctor.displayName}.`,
      )
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Impossible de délivrer la licence',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function resolveDispute() {
    setResolving(true)
    setError('')
    setMessage('')
    try {
      const doctorBps = doctorPct * 100
      const { data } = await api.post<{ txHash: string }>(
        '/blockchain/resolve-dispute',
        {
          paymentId: Number(paymentId),
          doctorBps,
        },
      )
      setMessage(
        `Litige #${paymentId} tranché : ${doctorPct} % médecin / ${100 - doctorPct} % patient.`,
      )
      void data
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Impossible de résoudre — le paiement doit être en litige.',
      )
    } finally {
      setResolving(false)
    }
  }

  if (user?.role !== 'admin') {
    return (
      <p className="text-sm text-red-600">Réservé au rôle admin.</p>
    )
  }

  const rpcOk = Boolean(status?.connected)

  return (
    <div>
      <PageHeader
        title="Administration"
        subtitle="Délivre les licences médecins et tranche les litiges de paiement."
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-teal-brand">{message}</p>}

      <SpotlightCard className="mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon
            icon={rpcOk ? faCircleCheck : faTriangleExclamation}
            className={rpcOk ? 'text-teal-brand' : 'text-amber-600'}
          />
          <div>
            <p className="text-sm font-semibold text-charcoal">
              {rpcOk ? 'Réseau local OK' : 'Réseau hors ligne'}
            </p>
            <p className="text-xs text-slate-500">
              {licensedCount}/{doctors.length} médecins licenciés ·{' '}
              {patients.length} patients
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"
        >
          Détails techniques
          <FontAwesomeIcon icon={showTech ? faChevronUp : faChevronDown} />
        </button>
        {showTech && (
          <div className="w-full space-y-1 border-t border-slate-100 pt-3 font-mono text-[11px] text-slate-500">
            <p>Mode {status?.mode ?? '—'} · chain {status?.chainId ?? 31337}</p>
            <p>Accès : {status?.contract ?? '—'}</p>
            <p>Médecin : {status?.doctorContract ?? '—'}</p>
            <p>NFT : {status?.nftContract ?? '—'}</p>
          </div>
        )}
      </SpotlightCard>

      {/* Priorité UX : licences */}
      <SpotlightCard className="mb-6 p-6">
        <div className="mb-1 flex items-center gap-2">
          <FontAwesomeIcon icon={faIdCard} className="text-teal-brand" />
          <h2 className="font-display text-lg font-semibold text-charcoal">
            Licences médecins
          </h2>
        </div>
        <p className="mb-5 text-sm text-slate-600">
          Sans licence, un médecin ne peut pas émettre d’ordonnance on-chain.
          Clique « Délivrer » une seule fois par médecin.
        </p>
        <ul className="space-y-3">
          {doctors.map((d) => {
            const lic = licenses[d.id]
            const ok = Boolean(lic?.active)
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-charcoal">
                      {d.displayName}
                    </p>
                    {ok ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-brand">
                        <FontAwesomeIcon icon={faCheck} />
                        Licence #{lic!.tokenId}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        Pas de licence
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{d.email}</p>
                  {(d.specialty || lic?.specialty) && (
                    <p className="text-xs text-teal-800">
                      {d.specialty || lic?.specialty}
                    </p>
                  )}
                  {d.walletAddress ? (
                    <p className="mt-1 font-mono text-[10px] text-slate-400">
                      {truncateAddress(d.walletAddress, 6)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-700">
                      Wallet manquant — le médecin doit le lier dans Profil.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!d.walletAddress || busyId === d.id || ok}
                  onClick={() => void mintLicense(d)}
                  className="rounded-xl bg-teal-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-45"
                >
                  {busyId === d.id
                    ? 'Délivrance…'
                    : ok
                      ? 'Déjà licencié'
                      : 'Délivrer la licence'}
                </button>
              </li>
            )
          })}
        </ul>
      </SpotlightCard>

      {/* Arbitrage simplifié */}
      <SpotlightCard className="mb-6 space-y-4 p-6">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faScaleBalanced} className="text-teal-brand" />
          <h2 className="font-display text-lg font-semibold text-charcoal">
            Trancher un litige de paiement
          </h2>
        </div>
        <p className="text-sm text-slate-600">
          Uniquement si patient ou médecin a ouvert un litige. Tu choisis
          comment partager l’argent bloqué.
        </p>

        <div>
          <label className="text-sm font-medium text-slate-700">
            N° du paiement
          </label>
          <input
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            inputMode="numeric"
            className="mt-1.5 w-32 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Visible dans Paiements → Escrow on-chain (ex. #1).
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">
            Part pour le médecin
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SHARE_PRESETS.map((p) => (
              <button
                key={p.pct}
                type="button"
                onClick={() => setDoctorPct(p.pct)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  doctorPct === p.pct
                    ? 'border-teal-brand/40 bg-teal-brand/10 text-teal-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Décision :{' '}
            <strong className="text-charcoal">{doctorPct} %</strong> médecin ·{' '}
            <strong className="text-charcoal">{100 - doctorPct} %</strong>{' '}
            patient
          </p>
        </div>

        <button
          type="button"
          disabled={resolving || !paymentId}
          onClick={() => void resolveDispute()}
          className="rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {resolving ? 'En cours…' : 'Confirmer le partage'}
        </button>
      </SpotlightCard>

      <SpotlightCard className="p-6">
        <div className="mb-3 flex items-center gap-2">
          <FontAwesomeIcon icon={faUserInjured} className="text-teal-brand" />
          <h2 className="font-display text-lg font-semibold text-charcoal">
            Patients ({patients.length})
          </h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {patients.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-medium text-charcoal">{p.displayName}</p>
                <p className="text-slate-500">{p.email}</p>
              </div>
              {p.walletAddress && (
                <span className="font-mono text-[10px] text-slate-400">
                  {truncateAddress(p.walletAddress, 5)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </SpotlightCard>
    </div>
  )
}
