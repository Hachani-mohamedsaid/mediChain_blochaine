import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faChevronUp,
  faLink,
  faServer,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { formatDateFr, truncateAddress } from '../lib/utils'
import type { AuditEntry, ChainEventView } from '../types'

const APP_EVENT_FR: Record<string, string> = {
  DocumentUploaded: 'Document ajouté',
  DocumentAccessed: 'Document consulté',
  DocumentIssued: 'Document émis par le médecin',
  AccessGranted: 'Accès accordé',
  AccessRevoked: 'Accès révoqué',
  AccessDenied: 'Accès refusé',
  GrantCreated: 'Partage créé',
  GrantRevoked: 'Partage révoqué',
  PaymentLocked: 'Consultation payée',
  PaymentReleased: 'Paiement libéré',
  ConsultationPaid: 'Consultation payée',
  NftMinted: 'Attestation ancrée',
}

const CHAIN_EVENT_FR: Record<string, string> = {
  PatientJoined: 'Patient inscrit sur la chaîne',
  DoctorJoined: 'Médecin inscrit sur la chaîne',
  AccessGranted: 'Accès confirmé',
  AccessRevoked: 'Accès révoqué',
  DocumentOpened: 'Consultation confirmée',
  DocumentIssued: 'Émission confirmée',
  ConsultationPaid: 'Paiement reçu',
  PaymentReleased: 'Paiement libéré',
  DisputeRaised: 'Litige ouvert',
  DisputeResolved: 'Litige tranché',
  BiometricBound: 'Empreinte liée',
  LicenseMinted: 'Licence délivrée',
}

function labelApp(type: string) {
  return APP_EVENT_FR[type] ?? type.replace(/([A-Z])/g, ' $1').trim()
}

function labelChain(type: string) {
  return CHAIN_EVENT_FR[type] ?? type.replace(/([A-Z])/g, ' $1').trim()
}

function humanizeMetadata(raw?: string) {
  if (!raw?.trim()) return null
  let text = raw.trim()
  // IPFS / longs hashes → raccourcir
  text = text.replace(/ipfs:\/\/[a-z0-9]+/gi, (m) => `ipfs://${m.slice(7, 15)}…`)
  text = text.replace(/0x[a-f0-9]{20,}/gi, (m) => truncateAddress(m, 6))
  text = text.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (m) => `${m.slice(0, 8)}…`,
  )
  if (text.length > 120) text = `${text.slice(0, 117)}…`
  return text
}

export default function AuditPage() {
  const { user } = useAuth()
  const [events, setEvents] = useState<AuditEntry[]>([])
  const [chain, setChain] = useState<ChainEventView[]>([])
  const [error, setError] = useState('')
  const [openTech, setOpenTech] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'local' | 'chain'>('all')

  useEffect(() => {
    if (!user) return
    void Promise.all([
      api.get<AuditEntry[]>('/audit/mine'),
      api.get<{ app: AuditEntry[]; chain: ChainEventView[] }>('/audit/chain'),
    ])
      .then(([mine, ch]) => {
        setEvents([...mine.data].reverse())
        setChain([...(ch.data.chain ?? [])].reverse())
      })
      .catch(() => setError('Impossible de charger l’historique.'))
  }, [user])

  const localOnly = events.filter((e) => !e.txHash).length
  const withTx = events.filter((e) => !!e.txHash).length

  const visibleApp = events.filter((e) => {
    if (filter === 'local') return !e.txHash
    if (filter === 'chain') return !!e.txHash
    return true
  })

  return (
    <div>
      <PageHeader
        title={
          user?.role === 'patient' ? 'Mon historique' : 'Traces de consultation'
        }
        subtitle="Retrouve ici tout ce qui s’est passé sur ton compte."
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SpotlightCard className="p-4">
          <p className="text-xs font-medium text-slate-500">En attente</p>
          <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
            {localOnly}
          </p>
        </SpotlightCard>
        <SpotlightCard className="p-4">
          <p className="text-xs font-medium text-slate-500">Confirmées</p>
          <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
            {withTx}
          </p>
        </SpotlightCard>
        <SpotlightCard className="p-4">
          <p className="text-xs font-medium text-slate-500">Validées portefeuille</p>
          <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
            {chain.length}
          </p>
        </SpotlightCard>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ['all', 'Tout'],
            ['local', 'En attente'],
            ['chain', 'Confirmé'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-xl border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
              filter === id
                ? 'border-teal-brand bg-teal-brand/10 text-teal-900'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-charcoal">
        <FontAwesomeIcon icon={faServer} className="text-teal-brand" />
        Activité
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Les actions de ton dossier et de tes partages apparaissent ici.
        « Confirmé » signifie que c’est aussi validé avec ton portefeuille.
      </p>

      {visibleApp.length === 0 ? (
        <SpotlightCard className="mb-10 p-10 text-center text-slate-600">
          Aucune activité pour ce filtre.
        </SpotlightCard>
      ) : (
        <ul className="mb-12 space-y-3">
          {visibleApp.map((ev, i) => {
            const techId = `app-${ev.id}`
            const open = openTech === techId
            const meta = humanizeMetadata(ev.metadata)
            return (
              <motion.li
                key={ev.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <SpotlightCard className="p-5">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-brand/10 text-teal-brand">
                      <FontAwesomeIcon icon={faShieldHalved} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-charcoal">
                          {labelApp(ev.eventType)}
                        </p>
                        {ev.txHash ? (
                          <span className="rounded-full bg-teal-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-brand">
                            Confirmé
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                            En attente
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDateFr(
                          new Date(ev.timestamp * 1000).toISOString(),
                        )}
                      </p>
                      {meta && (
                        <p className="mt-2 text-sm text-slate-700">{meta}</p>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTech((id) => (id === techId ? null : techId))
                        }
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-teal-brand"
                      >
                        Détails techniques
                        <FontAwesomeIcon
                          icon={open ? faChevronUp : faChevronDown}
                          className="text-[10px]"
                        />
                      </button>
                      {open && (
                        <div className="mt-2 space-y-1 rounded-xl bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-500">
                          <p>Type · {ev.eventType}</p>
                          <p>Id · {truncateAddress(ev.id, 8)}</p>
                          {ev.txHash ? (
                            <p>Tx · {truncateAddress(ev.txHash, 10)}</p>
                          ) : (
                            <p className="font-sans text-amber-800">
                              Pas de transaction chaîne
                            </p>
                          )}
                          {ev.documentHash && (
                            <p>
                              Doc · {truncateAddress(ev.documentHash, 8)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </SpotlightCard>
              </motion.li>
            )
          })}
        </ul>
      )}

      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-charcoal">
        <FontAwesomeIcon icon={faLink} className="text-teal-brand" />
        Validations portefeuille
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Partages, ouvertures et autres actions signées avec MetaMask.
      </p>

      {chain.length === 0 ? (
        <SpotlightCard className="p-10 text-center text-slate-600">
          Aucune validation pour l’instant. Partage un accès ou consulte un
          dossier pour en générer.
        </SpotlightCard>
      ) : (
        <ul className="space-y-3">
          {chain.map((ev, i) => {
            const techId = `chain-${ev.txHash ?? ev.id ?? i}`
            const open = openTech === techId
            return (
              <li key={techId}>
                <SpotlightCard className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-charcoal">
                        {labelChain(ev.type)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-teal-brand/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-brand">
                          Confirmé
                        </span>
                        {ev.grantId != null && (
                          <span className="text-xs text-slate-500">
                            Accès #{ev.grantId}
                          </span>
                        )}
                        {ev.timestamp != null && (
                          <span className="text-xs text-slate-500">
                            {formatDateFr(
                              new Date(ev.timestamp * 1000).toISOString(),
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    {ev.txHash && (
                      <button
                        type="button"
                        onClick={() =>
                          setOpenTech((id) => (id === techId ? null : techId))
                        }
                        className="text-xs font-medium text-slate-500 hover:text-teal-brand"
                      >
                        {open ? 'Masquer' : 'Voir la tx'}
                      </button>
                    )}
                  </div>
                  {open && ev.txHash && (
                    <p className="mt-3 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-500">
                      {ev.txHash}
                    </p>
                  )}
                </SpotlightCard>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
