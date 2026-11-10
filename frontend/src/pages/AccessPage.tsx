import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faBan,
  faCheck,
  faCloudArrowUp,
  faFileMedical,
  faFolderPlus,
  faKey,
  faPaperPlane,
  faTrash,
  faUserDoctor,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import {
  getContracts,
  NFT_MINT_GAS_LIMIT,
  nftMetadataUri,
} from '../lib/chain'
import { pushNotification } from '../lib/notifications'
import { formatTxError, okMessage, sendLocalTx } from '../lib/tx'
import { categoryLabel, inferCategory } from '../lib/recordsMeta'
import { formatDateFr, truncateAddress } from '../lib/utils'
import type { AccessGrant, MedicalRecord, User } from '../types'

type DurationMode = 'hours' | 'days' | 'date'
type Perm = 'read' | 'download' | 'annotate'

const PERM_OPTIONS: { id: Perm; label: string; hint: string }[] = [
  { id: 'read', label: 'Lire', hint: 'Consulter' },
  { id: 'download', label: 'Télécharger', hint: 'Copie locale' },
  { id: 'annotate', label: 'Annoter', hint: 'Notes' },
]

const PERM_FR: Record<Perm, string> = {
  read: 'Lire',
  download: 'Télécharger',
  annotate: 'Annoter',
}

function looksTechnicalId(value?: string | null) {
  if (!value?.trim()) return true
  const v = value.trim().replace(/\.[a-z0-9]+$/i, '')
  if (v.length > 48) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
    return true
  if (/^0x[a-f0-9]{10,}$/i.test(v)) return true
  return false
}

/** Titre lisible — jamais d’UUID brut dans l’UI */
function recordLabel(r: MedicalRecord) {
  const candidates = [r.title, r.originalName?.replace(/\.[^.]+$/, '')]
  const human = candidates.find((c) => c && !looksTechnicalId(c))
  if (human) {
    return r.tokenId != null ? `${human.trim()} · attesté #${r.tokenId}` : human.trim()
  }
  const cat = categoryLabel(
    r.category ?? inferCategory(r.title ?? '', r.kind),
  )
  const when = formatDateFr(r.uploadedAt)
  const base = `${cat} · ${when}`
  return r.tokenId != null ? `${base} · attesté #${r.tokenId}` : base
}

function permsLabel(list?: string[]) {
  if (!list?.length) return '—'
  return list
    .map((p) => PERM_FR[p as Perm] ?? p)
    .join(', ')
}

export default function AccessPage() {
  const { user } = useAuth()
  const { address, connect } = useWallet()
  const isPatient = user?.role === 'patient'
  const [grants, setGrants] = useState<AccessGrant[]>([])
  const [doctors, setDoctors] = useState<User[]>([])
  const [patients, setPatients] = useState<User[]>([])
  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [recordId, setRecordId] = useState('')
  const [durationMode, setDurationMode] = useState<DurationMode>('days')
  const [durationValue, setDurationValue] = useState(7)
  const [expireDate, setExpireDate] = useState('')
  const [purpose, setPurpose] = useState('Consultation')
  const [perms, setPerms] = useState<Perm[]>(['read', 'download'])
  const [emergency, setEmergency] = useState(false)
  const [emergencyReason, setEmergencyReason] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)

  function nameOf(id: string, list: User[]) {
    return list.find((u) => u.id === id)?.displayName ?? id.slice(0, 8)
  }

  function titleOfRecord(recordIdValue: string) {
    const r = records.find((x) => x.id === recordIdValue)
    return r ? recordLabel(r) : 'Document'
  }

  const selectedDoctor = doctors.find((d) => d.id === doctorId)
  const selectedRecord = records.find((r) => r.id === recordId)
  const doctorVerified = Boolean(selectedDoctor?.walletAddress)

  const durationSeconds = useMemo(() => {
    if (durationMode === 'hours') return durationValue * 3600
    if (durationMode === 'days') return durationValue * 24 * 3600
    if (expireDate) {
      const end = Math.floor(new Date(expireDate).getTime() / 1000)
      return Math.max(60, end - Math.floor(Date.now() / 1000))
    }
    return 7 * 24 * 3600
  }, [durationMode, durationValue, expireDate])

  const expiryLabel = useMemo(() => {
    if (durationMode === 'hours') return `${durationValue} h`
    if (durationMode === 'days') return `${durationValue} j`
    if (expireDate) return formatDateFr(new Date(expireDate).toISOString())
    return '7 j'
  }, [durationMode, durationValue, expireDate])

  async function load() {
    if (isPatient) {
      const [g, d, ph, r] = await Promise.all([
        api.get<AccessGrant[]>('/access/mine'),
        api.get<User[]>('/users/doctors'),
        api.get<User[]>('/users/pharmacies'),
        api.get<MedicalRecord[]>('/records/mine'),
      ])
      setGrants(g.data)
      const grantees = [...d.data, ...ph.data]
      setDoctors(grantees)
      // Docs médecin + imports patient (pas le conteneur dossier vide)
      const shareable = r.data.filter(
        (rec) =>
          rec.kind === 'doctor_issue' ||
          rec.kind === 'patient_upload' ||
          Boolean(rec.issuedByDoctorId),
      )
      setRecords(shareable)
      if (!doctorId && grantees[0]) setDoctorId(grantees[0].id)
      if (!recordId && shareable[0]) setRecordId(shareable[0].id)
      else if (recordId && !shareable.some((x) => x.id === recordId)) {
        setRecordId(shareable[0]?.id ?? '')
      }
    } else {
      const [g, p] = await Promise.all([
        api.get<AccessGrant[]>('/access/incoming'),
        api.get<User[]>('/users/patients'),
      ])
      setGrants(g.data)
      setPatients(p.data)
    }
  }

  useEffect(() => {
    if (!user) return
    void load().catch(() => setError('Impossible de charger les accès.'))
  }, [user, isPatient])

  function togglePerm(p: Perm) {
    setPerms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  async function importShareFile(file: File | null) {
    if (!file || !isPatient) return
    setImporting(true)
    setError('')
    setMessage('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append(
        'title',
        file.name.replace(/\.[^.]+$/, '') || 'Fiche importée',
      )
      form.append('description', 'Import patient · partage accès')
      const { data } = await api.post<MedicalRecord>('/records', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await load()
      setRecordId(data.id)
      setMessage(`Fiche importée · ${data.title}`)
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const msg = (e.response?.data as { message?: string | string[] })
          ?.message
        setError(
          Array.isArray(msg) ? msg.join(', ') : String(msg ?? 'Import impossible'),
        )
      } else {
        setError(e instanceof Error ? e.message : 'Import impossible')
      }
    } finally {
      setImporting(false)
    }
  }

  async function deleteImportedShare() {
    if (!selectedRecord || selectedRecord.kind !== 'patient_upload') return
    setImporting(true)
    setError('')
    setMessage('')
    try {
      await api.delete(`/records/${selectedRecord.id}`)
      setRecordId('')
      await load()
      setMessage('Fiche importée supprimée.')
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const msg = (e.response?.data as { message?: string | string[] })
          ?.message
        setError(
          Array.isArray(msg)
            ? msg.join(', ')
            : String(msg ?? 'Suppression impossible'),
        )
      } else {
        setError(e instanceof Error ? e.message : 'Suppression impossible')
      }
    } finally {
      setImporting(false)
    }
  }

  async function grantAccess() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const doctor = doctors.find((d) => d.id === doctorId)
      const record = records.find((r) => r.id === recordId)
      if (!doctor?.walletAddress) {
        throw new Error('Médecin non vérifié : wallet manquant')
      }
      if (!record) throw new Error('Dossier introuvable')
      if (perms.length === 0) throw new Error('Choisis au moins une permission')
      if (emergency && emergencyReason.trim().length < 5) {
        throw new Error('Justification d’urgence requise (≥ 5 caractères)')
      }

      if (!address) await connect()

      if (doctor.role === 'pharmacy') {
        await api.post('/access/grant', {
          doctorId,
          recordId,
          purpose: purpose || 'Pharmacie / médicament',
          durationSeconds,
          permissions: perms,
          emergency,
          emergencyReason: emergency ? emergencyReason : undefined,
        })
        pushNotification({
          title: 'Accès pharmacie',
          body: `${doctor.displayName} · ${recordLabel(record)}`,
          href: '/pharmacy',
        })
        setMessage(
          'Accès fichier accordé à la pharmacie. Pour commander un médicament, utilise Médicaments.',
        )
      } else {
        const ctx = await getContracts()
        if (!(await ctx.mediChain.isPatient(ctx.address))) {
          await sendLocalTx((gas) => ctx.mediChain.joinAsPatient(gas))
        }

        const expiresAt = Math.floor(Date.now() / 1000) + durationSeconds
        const beforeGrant = Number(await ctx.mediChain.nextGrantId())
        const { hash: grantTxHash } = await sendLocalTx(
          (gas) =>
            ctx.mediChain.grantAccess(
              doctor.walletAddress,
              record.contentHash,
              BigInt(expiresAt),
              gas,
            ),
          {
            verifyOk: async () =>
              Number(await ctx.mediChain.nextGrantId()) > beforeGrant,
          },
        )
        const chainGrantId = Number(await ctx.mediChain.nextGrantId()) - 1

        // NFT d’accès → chez le MÉDECIN (pas le patient)
        let accessTokenId = 0
        if (!ctx.accessNft) {
          throw new Error(
            'AccessGrantNFT non déployé — relance deploy:local',
          )
        }
        const uri = nftMetadataUri({
          title: `Accès · ${record.title || 'Document'}`,
          contentHash: record.contentHash,
          recordId: record.id,
        })
        await sendLocalTx(
          (gas) =>
            ctx.accessNft!.mintToDoctor(
              doctor.walletAddress,
              record.contentHash,
              BigInt(chainGrantId),
              BigInt(expiresAt),
              uri,
              gas,
            ),
          {
            gasLimit: NFT_MINT_GAS_LIMIT,
            verifyOk: async () =>
              Number(await ctx.accessNft!.tokenOfGrant(chainGrantId)) > 0,
          },
        )
        accessTokenId = Number(await ctx.accessNft.tokenOfGrant(chainGrantId))

        try {
          localStorage.setItem(
            'medichain:access-nft-minted',
            JSON.stringify({
              tokenId: accessTokenId,
              doctorWallet: doctor.walletAddress,
              at: Date.now(),
            }),
          )
          window.dispatchEvent(
            new CustomEvent('medichain:access-nft-minted', {
              detail: {
                tokenId: accessTokenId,
                doctorWallet: doctor.walletAddress,
              },
            }),
          )
        } catch {
          /* ignore */
        }

        await api.post('/access/grant', {
          doctorId,
          recordId,
          purpose,
          durationSeconds,
          chainGrantId,
          grantTxHash,
          permissions: perms,
          emergency,
          emergencyReason: emergency ? emergencyReason : undefined,
        })
        pushNotification({
          title: emergency ? 'Accès urgence accordé' : 'Accès accordé',
          body: `${doctor.displayName} · NFT accès #${accessTokenId} · grant #${chainGrantId}`,
          href: '/access',
        })
        setMessage(
          okMessage(
            `Accès on-chain · NFT médecin #${accessTokenId} · grant #${chainGrantId}`,
          ),
        )
      }
      await load()
    } catch (e) {
      setError(formatTxError(e, 'Échec de l’autorisation'))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setError('')
    setBusy(true)
    try {
      const grant = grants.find((g) => g.id === id)
      if (!grant) throw new Error('Grant introuvable')
      if (!address) await connect()
      const ctx = await getContracts()
      const { hash: revokeTxHash } = await sendLocalTx((gas) =>
        ctx.mediChain.revokeAccess(BigInt(grant.chainGrantId), gas),
      )
      await api.post(`/access/${id}/revoke`, { revokeTxHash })
      pushNotification({
        title: 'Accès révoqué',
        body: 'Blocage des accès futurs (copies déjà téléchargées non effacées).',
        href: '/access',
      })
      setMessage(okMessage('Révocation confirmée on-chain.'))
      await load()
    } catch (e) {
      setError(formatTxError(e, 'Révocation impossible.'))
    } finally {
      setBusy(false)
    }
  }

  if (!isPatient) {
    const doctorActions = [
      {
        to: '/ajouter',
        title: 'Ajouter',
        hint: 'Remplir le dossier médical',
        icon: faFolderPlus,
      },
      {
        to: '/envoyer',
        title: 'Envoyer',
        hint: 'Transmettre un dossier au client',
        icon: faPaperPlane,
      },
    ]

    return (
      <div>
        <PageHeader
          title="Accès reçus"
          subtitle="Partages reçus des patients."
        />

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {doctorActions.map((item, i) => (
            <div key={item.to} className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                to={item.to}
                className="block w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm transition hover:border-teal-brand/30"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-brand/10 text-teal-brand">
                    <FontAwesomeIcon icon={item.icon} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Action
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-charcoal">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
                  </div>
                </div>
              </Link>
              {i < doctorActions.length - 1 ? (
                <FontAwesomeIcon
                  icon={faArrowRight}
                  className="hidden shrink-0 text-teal-brand/40 sm:block"
                  aria-hidden
                />
              ) : null}
            </div>
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {grants.length === 0 ? (
          <SpotlightCard className="p-10 text-center text-slate-600">
            Aucune autorisation pour l’instant.
          </SpotlightCard>
        ) : (
          <ul className="space-y-3">
            {grants.map((g) => (
              <SpotlightCard
                key={g.id}
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-brand/10 text-teal-brand">
                    <FontAwesomeIcon icon={faFileMedical} />
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal">
                      {nameOf(g.patientId, patients)}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {g.purpose} · expire{' '}
                      {formatDateFr(new Date(g.endsAt * 1000).toISOString())}
                    </p>
                    {g.grantTxHash ? (
                      <p className="mt-1 text-[11px] font-medium text-teal-brand">
                        Confirmé on-chain · {truncateAddress(g.grantTxHash, 8)}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        Non confirmé on-chain
                      </p>
                    )}
                  </div>
                </div>
                <StatusBadge status={g.status} />
              </SpotlightCard>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Partager un accès"
        subtitle="Confirme avec MetaMask : un NFT d’accès est créé chez le médecin."
      />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-teal-brand">{message}</p>}

      <SpotlightCard className="mb-8 space-y-6 p-6">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faKey} className="text-teal-brand" />
          <h2 className="font-display text-lg font-semibold text-charcoal">
            Nouveau consentement
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Médecin ou pharmacie
            </label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-teal-brand"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.role === 'pharmacy' ? 'Pharmacie · ' : ''}
                  {d.displayName} — {d.specialty || 'Médecine générale'}
                  {d.walletAddress ? '' : ' · non vérifié'}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {doctorVerified && selectedDoctor?.walletAddress
                ? `Portefeuille lié · ${truncateAddress(selectedDoctor.walletAddress, 6)}`
                : 'Ce médecin doit lier son portefeuille (Profil) avant le partage.'}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Document
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <select
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                className="w-full flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-teal-brand"
              >
                {records.length === 0 ? (
                  <option value="">
                    Aucun — importe une fiche ou attends le médecin
                  </option>
                ) : (
                  records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.kind === 'patient_upload' ? 'Import · ' : 'Médecin · '}
                      {recordLabel(r)}
                    </option>
                  ))
                )}
              </select>
              <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal-brand/40 bg-teal-brand/5 px-4 py-2.5 text-sm font-semibold text-teal-brand hover:bg-teal-brand/10">
                <FontAwesomeIcon icon={faCloudArrowUp} />
                {importing ? '…' : 'Importer fiche'}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.png,.jpeg,.txt"
                  disabled={importing || busy}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0] ?? null
                    ev.target.value = ''
                    void importShareFile(f)
                  }}
                />
              </label>
              {selectedRecord?.kind === 'patient_upload' ? (
                <button
                  type="button"
                  disabled={importing || busy}
                  onClick={() => void deleteImportedShare()}
                  title="Supprimer la fiche importée"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faTrash} />
                  Supprimer
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Importe une fiche ou choisis un doc médecin · un à la fois. (Dossier
              reste lecture seule.)
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">Permissions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERM_OPTIONS.map(({ id, label, hint }) => {
              const on = perms.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePerm(id)}
                  aria-pressed={on}
                  className={`rounded-xl border-2 px-3.5 py-2 text-left text-sm transition ${
                    on
                      ? 'border-teal-brand bg-teal-brand/10 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="font-semibold">
                    {on ? '✓ ' : ''}
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[11px] opacity-70">
                    {hint}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Durée
            </label>
            <select
              value={durationMode}
              onChange={(e) =>
                setDurationMode(e.target.value as DurationMode)
              }
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="hours">Heures</option>
              <option value="days">Jours</option>
              <option value="date">Date précise</option>
            </select>
          </div>
          {durationMode !== 'date' ? (
            <div>
              <label className="text-sm font-medium text-slate-700">
                Valeur
              </label>
              <input
                type="number"
                min={1}
                value={durationValue}
                onChange={(e) => setDurationValue(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
              />
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-slate-700">
                Date de fin
              </label>
              <input
                type="datetime-local"
                value={expireDate}
                onChange={(e) => setExpireDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700">Motif</label>
            <input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
            />
          </div>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 ${
            emergency
              ? 'border-amber-300 bg-amber-50/80'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => setEmergency(e.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="font-semibold text-charcoal">
                Accès d’urgence
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Audit renforcé — justification obligatoire.
              </span>
            </span>
          </label>
          {emergency && (
            <input
              value={emergencyReason}
              onChange={(e) => setEmergencyReason(e.target.value)}
              placeholder="Pourquoi cet accès urgent ?"
              className="mt-3 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm"
            />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          <p className="font-medium text-charcoal">Récapitulatif</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <span className="text-slate-500">Médecin · </span>
              {selectedDoctor?.displayName ?? '—'}
            </li>
            <li>
              <span className="text-slate-500">Document · </span>
              {selectedRecord ? recordLabel(selectedRecord) : '—'}
            </li>
            <li>
              <span className="text-slate-500">Durée · </span>
              {expiryLabel}
            </li>
            <li>
              <span className="text-slate-500">Droits · </span>
              {perms.length ? permsLabel(perms) : 'aucune permission'}
              {emergency ? ' · urgence' : ''}
            </li>
            <li>
              <span className="text-slate-500">NFT · </span>
              {selectedDoctor?.role === 'pharmacy'
                ? 'non (pharmacie = fichier API)'
                : 'minté chez le médecin à la confirmation'}
            </li>
          </ul>
        </div>

        <button
          type="button"
          disabled={!doctorId || !recordId || busy || !doctorVerified}
          onClick={() => void grantAccess()}
          className="w-full rounded-xl bg-teal-brand px-6 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-50 sm:w-auto"
        >
          {busy ? 'Accès + NFT médecin…' : 'Accorder l’accès (NFT médecin)'}
        </button>
      </SpotlightCard>

      <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
        Historique
      </h2>
      {grants.length === 0 ? (
        <SpotlightCard className="p-10 text-center text-slate-600">
          Aucun partage pour l’instant.
        </SpotlightCard>
      ) : (
        <motion.ul
          className="space-y-3"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {grants.map((g) => (
            <motion.li
              key={g.id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
            >
              <SpotlightCard className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-brand/10 text-teal-brand">
                    <FontAwesomeIcon icon={faUserDoctor} />
                  </div>
                  <div>
                    <p className="font-semibold text-charcoal">
                      {nameOf(g.doctorId, doctors)}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {titleOfRecord(g.recordId)} · {g.purpose}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Jusqu’au{' '}
                      {formatDateFr(new Date(g.endsAt * 1000).toISOString())}
                      {g.permissions?.length
                        ? ` · ${permsLabel(g.permissions)}`
                        : ''}
                      {g.emergency ? ' · urgence' : ''}
                    </p>
                    {g.grantTxHash ? (
                      <p className="mt-1 text-[11px] font-medium text-teal-brand">
                        Confirmé · {truncateAddress(g.grantTxHash, 8)}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        Non confirmé
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <StatusBadge status={g.status} />
                  {g.status === 'active' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revoke(g.id)}
                      className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Révoquer
                    </button>
                  )}
                </div>
              </SpotlightCard>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active'
  return (
    <span
      className={
        active
          ? 'inline-flex items-center gap-1.5 rounded-full bg-teal-brand/10 px-3 py-1 text-xs font-semibold text-teal-brand'
          : 'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500'
      }
    >
      <FontAwesomeIcon icon={active ? faCheck : faBan} className="text-[10px]" />
      {active ? 'Actif' : status === 'revoked' ? 'Révoqué' : status}
    </span>
  )
}
