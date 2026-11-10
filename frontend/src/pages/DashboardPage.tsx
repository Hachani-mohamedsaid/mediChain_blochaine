import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faBell,
  faFileMedical,
  faKey,
  faPills,
  faShieldHalved,
  faStethoscope,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import {
  listNotifications,
  markNotificationsRead,
  type AppNotification,
} from '../lib/notifications'
import { formatDateFr } from '../lib/utils'
import type { AccessGrant, AuditEntry, MedicalRecord } from '../types'

const EVENT_FR: Record<string, string> = {
  DocumentUploaded: 'Document ajouté',
  DocumentAccessed: 'Document consulté',
  DocumentIssued: 'Document émis',
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

function eventLabel(type: string) {
  return EVENT_FR[type] ?? type.replace(/([A-Z])/g, ' $1').trim()
}

function greetingName(displayName?: string) {
  if (!displayName?.trim()) return ''
  const first = displayName.trim().split(/\s+/)[0] ?? ''
  if (/^(patient|médecin|medecin|docteur|dr|pharmacie|fournisseur)$/i.test(first)) {
    return ''
  }
  return first
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { address, isHardhat, connect } = useWallet()
  const isPatient = user?.role === 'patient'
  const isPharmacy = user?.role === 'pharmacy'
  const isSupplier = user?.role === 'supplier'
  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [issuedCount, setIssuedCount] = useState(0)
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [notifs, setNotifs] = useState<AppNotification[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!user) return
    setNotifs(listNotifications())
    void (async () => {
      try {
        if (isPatient) {
          const [r, g, a] = await Promise.all([
            api.get<MedicalRecord[]>('/records/mine'),
            api.get<AccessGrant[]>('/access/mine'),
            api.get<AuditEntry[]>('/audit/mine'),
          ])
          setRecords(r.data)
          setGrants(g.data)
          setAudit([...a.data].reverse().slice(0, 6))
          setIssuedCount(0)
        } else if (isPharmacy) {
          const [shared, g, a] = await Promise.all([
            api.get<MedicalRecord[]>('/records/shared-with-me'),
            api.get<AccessGrant[]>('/access/incoming'),
            api.get<AuditEntry[]>('/audit/mine'),
          ])
          setRecords(shared.data)
          setIssuedCount(0)
          setGrants(g.data)
          setAudit([...a.data].reverse().slice(0, 6))
        } else if (isSupplier) {
          setRecords([])
          setIssuedCount(0)
          setGrants([])
          setAudit([])
        } else {
          const [shared, issued, g, a] = await Promise.all([
            api.get<MedicalRecord[]>('/records/shared-with-me'),
            api.get<MedicalRecord[]>('/records/issued'),
            api.get<AccessGrant[]>('/access/incoming'),
            api.get<AuditEntry[]>('/audit/mine'),
          ])
          const map = new Map<string, MedicalRecord>()
          for (const r of shared.data) map.set(r.id, r)
          setRecords([...map.values()])
          setIssuedCount(issued.data.length)
          setGrants(g.data)
          setAudit([...a.data].reverse().slice(0, 6))
        }
      } catch {
        setError('Impossible de charger l’accueil.')
      }
    })()
  }, [user, isPatient, isPharmacy, isSupplier])

  const activeGrants = grants.filter((g) => g.status === 'active')
  const confirmedGrants = activeGrants.filter(
    (g) => g.onChainConfirmed || !!g.grantTxHash,
  )
  const attested = records.filter((r) => r.tokenId != null).length
  const name = greetingName(user?.displayName)
  const unread = notifs.filter((n) => !n.read).length
  const walletOk = Boolean(address && isHardhat)
  const profileLinked = Boolean(user?.walletAddress)
  const securityOk = walletOk && profileLinked

  const quickLinks = isPatient
    ? [
        {
          to: '/records',
          label: 'Mon dossier',
          text: 'Voir tes documents médicaux',
          icon: faFileMedical,
        },
        {
          to: '/payments',
          label: 'Réserver un médecin',
          text: 'Payer la consultation et gagner des MCT',
          icon: faStethoscope,
        },
        {
          to: '/pharmacy',
          label: 'Médicaments',
          text: 'Commander et payer à la pharmacie',
          icon: faPills,
        },
        {
          to: '/access',
          label: 'Partager mon dossier',
          text: 'Donner un accès temporaire au médecin',
          icon: faKey,
        },
      ]
    : isPharmacy
      ? [
          {
            to: '/pharmacy',
            label: 'Délivrance',
            text: 'Recevoir le paiement et délivrer l’ordonnance',
            icon: faPills,
          },
          {
            to: '/supplier',
            label: 'Mon stock',
            text: 'Commander au fournisseur et réceptionner',
            icon: faKey,
          },
        ]
      : isSupplier
        ? [
            {
              to: '/supplier',
              label: 'Livraisons',
              text: 'Livrer les commandes des pharmacies',
              icon: faStethoscope,
            },
          ]
        : [
            {
              to: '/records',
              label: 'Dossier patient',
              text: 'Consulter l’historique après partage',
              icon: faStethoscope,
            },
            {
              to: '/ajouter',
              label: 'Ajouter un document',
              text: 'Créer une note ou ordonnance (NFT)',
              icon: faFileMedical,
            },
            {
              to: '/payments',
              label: 'Mes tarifs',
              text: 'Publier le prix de consultation',
              icon: faWallet,
            },
            {
              to: '/access',
              label: 'Accès reçus',
              text: 'Voir les partages des patients',
              icon: faKey,
            },
          ]

  return (
    <div>
      <PageHeader
        title={name ? `Bonjour, ${name}` : 'Bonjour'}
        subtitle={
          isPatient
            ? 'Dossier · rendez-vous · médicaments · partage sécurisé.'
            : isPharmacy
              ? 'Ordonnances partagées · paiement MCT · délivrance.'
              : isSupplier
                ? 'Livre le stock médicaments vers les pharmacies.'
                : 'Dossiers partagés · documents · tarifs · accès.'
        }
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <SpotlightCard className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${
              securityOk
                ? 'bg-teal-brand/10 text-teal-brand'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            <FontAwesomeIcon icon={securityOk ? faShieldHalved : faWallet} />
          </div>
          <div>
            <p className="text-sm font-semibold text-charcoal">
              {securityOk
                ? 'Compte prêt'
                : walletOk
                  ? 'Portefeuille OK — lie-le au profil'
                  : 'Connecte ton portefeuille'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {securityOk
                ? 'Réseau local et adresse liés — tu peux partager et payer.'
                : walletOk
                  ? 'Va dans Profil pour enregistrer ton adresse.'
                  : 'Réseau Hardhat Local (31337) requis pour les signatures.'}
            </p>
          </div>
        </div>
        {!securityOk && (
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-xl bg-teal-brand px-4 py-2.5 text-sm font-semibold text-white"
          >
            {walletOk ? 'Reconnecter' : 'Connecter'}
          </button>
        )}
      </SpotlightCard>

      <motion.div
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05 } },
        }}
      >
        {(isPatient
          ? [
              {
                label: 'Documents',
                value: records.length,
                to: '/records',
                icon: faFileMedical,
              },
              {
                label: 'Partages actifs',
                value: confirmedGrants.length,
                to: '/access',
                icon: faKey,
              },
              {
                label: 'Certifiés',
                value: attested,
                to: '/records',
                icon: faShieldHalved,
              },
              {
                label: unread > 0 ? 'Non lues' : 'Notifications',
                value: unread,
                to: '/audit',
                icon: faBell,
              },
            ]
          : isPharmacy
            ? [
                {
                  label: 'Ordonnances',
                  value: records.length,
                  to: '/records',
                  icon: faFileMedical,
                },
                {
                  label: 'Accès reçus',
                  value: activeGrants.length,
                  to: '/pharmacy',
                  icon: faKey,
                },
                {
                  label: 'Délivrance',
                  value: '→',
                  to: '/pharmacy',
                  icon: faPills,
                },
                {
                  label: unread > 0 ? 'Non lues' : 'Notifications',
                  value: unread,
                  to: '/audit',
                  icon: faBell,
                },
              ]
            : isSupplier
              ? [
                  {
                    label: 'Livraisons',
                    value: '→',
                    to: '/supplier',
                    icon: faStethoscope,
                  },
                  {
                    label: 'État',
                    value: walletOk ? 'OK' : '—',
                    to: '/blockchain',
                    icon: faShieldHalved,
                  },
                  {
                    label: unread > 0 ? 'Non lues' : 'Notifications',
                    value: unread,
                    to: '/audit',
                    icon: faBell,
                  },
                ]
              : [
                  {
                    label: 'Partagés avec moi',
                    value: records.length,
                    to: '/records',
                    icon: faStethoscope,
                  },
                  {
                    label: 'Docs émis',
                    value: issuedCount,
                    to: '/envoyer',
                    icon: faFileMedical,
                  },
                  {
                    label: 'Accès reçus',
                    value: activeGrants.length,
                    to: '/access',
                    icon: faKey,
                  },
                  {
                    label: unread > 0 ? 'Non lues' : 'Notifications',
                    value: unread,
                    to: '/audit',
                    icon: faBell,
                  },
                ]
        ).map((stat) => (
          <motion.div
            key={stat.label}
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0 },
            }}
          >
            <Link to={stat.to}>
              <SpotlightCard className="p-5 transition hover:border-teal-brand/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                    <p className="mt-1 font-display text-3xl font-semibold text-charcoal">
                      {stat.value}
                    </p>
                  </div>
                  <FontAwesomeIcon
                    icon={stat.icon}
                    className="text-teal-brand"
                  />
                </div>
              </SpotlightCard>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
        Que faire ?
      </h2>
      <div
        className={`mb-8 grid gap-3 ${
          quickLinks.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'
        }`}
      >
        {quickLinks.map((q) => (
          <Link key={q.to} to={q.to}>
            <SpotlightCard className="h-full p-5 transition hover:border-teal-brand/40">
              <FontAwesomeIcon icon={q.icon} className="text-teal-brand" />
              <p className="mt-2 font-semibold text-charcoal">{q.label}</p>
              <p className="mt-1 text-sm text-slate-600">{q.text}</p>
            </SpotlightCard>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SpotlightCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-charcoal">Activité récente</p>
            <Link
              to="/audit"
              className="text-xs font-semibold text-teal-brand"
            >
              Tout voir <FontAwesomeIcon icon={faArrowRight} />
            </Link>
          </div>
          {audit.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune activité pour l’instant.</p>
          ) : (
            <ul className="space-y-2">
              {audit.map((ev) => (
                <li key={ev.id}>
                  <Link
                    to="/audit"
                    className="block rounded-xl border border-slate-100 px-3 py-2.5 text-sm hover:border-teal-brand/30"
                  >
                    <span className="font-medium text-charcoal">
                      {eventLabel(ev.eventType)}
                    </span>
                    <span
                      className={`ml-2 text-[11px] font-semibold ${
                        ev.txHash ? 'text-teal-brand' : 'text-amber-700'
                      }`}
                    >
                      {ev.txHash ? 'Confirmé' : 'En attente'}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {formatDateFr(
                        new Date(ev.timestamp * 1000).toISOString(),
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SpotlightCard>

        <SpotlightCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-charcoal">
              <FontAwesomeIcon icon={faBell} className="mr-2 text-teal-brand" />
              Notifications
              {unread > 0 && (
                <span className="ml-2 rounded-md bg-teal-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-teal-brand">
                  {unread}
                </span>
              )}
            </p>
            {notifs.length > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-slate-500 underline"
                onClick={() => {
                  markNotificationsRead()
                  setNotifs(listNotifications())
                }}
              >
                Tout marquer lu
              </button>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="text-sm text-slate-500">
              Les partages, paiements et livraisons apparaîtront ici.
            </p>
          ) : (
            <ul className="space-y-2">
              {notifs.slice(0, 6).map((n) => (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      to={n.href}
                      className={`block rounded-xl px-3 py-2.5 text-sm ${
                        n.read ? 'bg-slate-50' : 'bg-teal-brand/5'
                      }`}
                    >
                      <span className="font-medium text-charcoal">{n.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {n.body}
                      </span>
                    </Link>
                  ) : (
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                      <span className="font-medium text-charcoal">{n.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {n.body}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SpotlightCard>
      </div>
    </div>
  )
}
