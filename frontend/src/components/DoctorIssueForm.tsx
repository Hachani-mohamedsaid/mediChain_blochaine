import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faCloudArrowUp,
  faFileMedical,
  faFolderPlus,
  faPaperPlane,
} from '@fortawesome/free-solid-svg-icons'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { PageHeader } from './layout/PageHeader'
import { useWallet } from '../context/WalletContext'
import {
  anchorRecordNft,
  formatIssueError,
  issueDocumentToPatient,
} from '../lib/issueDocument'
import { formatTxError } from '../lib/tx'
import { categoryLabel, inferCategory } from '../lib/recordsMeta'
import { formatDateFr, truncateAddress } from '../lib/utils'
import type { MedicalRecord, User } from '../types'

export type DoctorIssueMode = 'ajouter' | 'envoyer'

function displayTitle(rec: MedicalRecord) {
  const t = rec.title?.trim()
  const looksId =
    !t ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t) ||
    t.length > 56
  if (!looksId) return t
  return (
    rec.originalName?.replace(/\.[^.]+$/, '') ||
    'Document'
  )
}

const COPY: Record<
  DoctorIssueMode,
  {
    title: string
    subtitle: string
    formTitle: string
    patientLabel: string
    titleLabel: string
    titlePlaceholder: string
    fileLabel: string
    cta: string
    listTitle: string
    emptyTitle: string
    emptyHint: string
    success: (name: string) => string
    otherLink: { to: string; label: string }
  }
> = {
  ajouter: {
    title: 'Ajouter au dossier',
    subtitle:
      'Page dossier médecin — tu ajoutes une fiche au dossier médical du patient.',
    formTitle: 'Nouvelle fiche dans le dossier',
    patientLabel: 'Patient',
    titleLabel: 'Titre de la fiche',
    titlePlaceholder: 'Compte-rendu, analyse, note clinique…',
    fileLabel: 'Choisir le fichier',
    cta: 'Ajouter au dossier + NFT',
    listTitle: 'Fiches du dossier',
    emptyTitle: 'Aucune fiche pour ce patient',
    emptyHint: 'Ajoute une fiche clinique au dossier médical.',
    success: (name) => `Fiche ajoutée au dossier de ${name}`,
    otherLink: { to: '/envoyer', label: 'Envoyer au client' },
  },
  envoyer: {
    title: 'Envoyer au client',
    subtitle:
      'Page envoi client — tu envoies un dossier (ordo, certificat…) à ton patient.',
    formTitle: 'Dossier à envoyer au client',
    patientLabel: 'Client (patient)',
    titleLabel: 'Titre du dossier',
    titlePlaceholder: 'Ordonnance, certificat…',
    fileLabel: 'Joindre le fichier',
    cta: 'Envoyer au client + NFT',
    listTitle: 'Dossiers envoyés',
    emptyTitle: 'Rien d’envoyé à ce client',
    emptyHint: 'Envoie un dossier que le client verra chez lui.',
    success: (name) => `Dossier envoyé à ${name}`,
    otherLink: { to: '/ajouter', label: 'Ajouter au dossier' },
  },
}

export function DoctorIssueForm({ mode }: { mode: DoctorIssueMode }) {
  const { connect } = useWallet()
  const copy = COPY[mode]
  const [patients, setPatients] = useState<User[]>([])
  const [issued, setIssued] = useState<MedicalRecord[]>([])
  const [patientId, setPatientId] = useState('')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [anchoringId, setAnchoringId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    const [pats, docs] = await Promise.all([
      api.get<User[]>('/users/patients'),
      api.get<MedicalRecord[]>('/records/issued'),
    ])
    setPatients(pats.data)
    setIssued(docs.data)
    if (!patientId && pats.data[0]) setPatientId(pats.data[0].id)
  }

  useEffect(() => {
    void load().catch(() => setError('Chargement impossible.'))
  }, [])

  const forPatient = useMemo(
    () =>
      (patientId
        ? issued.filter((r) => r.ownerId === patientId)
        : issued
      ).sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      ),
    [issued, patientId],
  )

  const selectedPatient = patients.find((p) => p.id === patientId)

  async function send() {
    if (!file || !patientId) {
      setError('Choisis un patient et un fichier.')
      return
    }
    setUploading(true)
    setError('')
    setMessage('')
    try {
      const result = await issueDocumentToPatient({
        file,
        patientId,
        title,
        connectWallet: connect,
      })
      setTitle('')
      setFile(null)
      setMessage(
        `${copy.success(selectedPatient?.displayName ?? 'patient')} · ${result.issueTxHash.slice(0, 10)}…${result.nftNote}`,
      )
      await load()
    } catch (err) {
      setError(formatIssueError(err))
    } finally {
      setUploading(false)
    }
  }

  async function retryNft(rec: MedicalRecord) {
    const patient = patients.find((p) => p.id === rec.ownerId)
    if (!patient?.walletAddress) {
      setError('Wallet patient manquant — reconnecte le compte patient.')
      return
    }
    setAnchoringId(rec.id)
    setError('')
    setMessage('')
    try {
      let patientWallet = patient.walletAddress
      try {
        const { data } = await api.post<{ walletAddress: string }>(
          '/blockchain/ensure-patient',
          { patientId: rec.ownerId },
        )
        if (data.walletAddress) patientWallet = data.walletAddress
      } catch {
        /* wallet déjà connu */
      }
      const { tokenId } = await anchorRecordNft({
        record: rec,
        patientWallet,
        connectWallet: connect,
      })
      setMessage(`NFT #${tokenId} ancré chez ${patient.displayName}.`)
      await load()
    } catch (err) {
      setError(formatTxError(err, 'Ancrage NFT impossible'))
    } finally {
      setAnchoringId(null)
    }
  }

  const modeCards = [
    {
      id: 'ajouter' as const,
      to: '/ajouter',
      title: 'Ajouter',
      hint: 'Remplir le dossier médical',
      icon: faFolderPlus,
    },
    {
      id: 'envoyer' as const,
      to: '/envoyer',
      title: 'Envoyer',
      hint: 'Transmettre un dossier au client',
      icon: faPaperPlane,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title={copy.title} />

      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {modeCards.map((item, i) => {
          const active = mode === item.id
          return (
            <div key={item.id} className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                to={item.to}
                className={`block w-full rounded-2xl border px-4 py-3 shadow-sm transition ${
                  active
                    ? 'border-teal-brand/40 bg-teal-brand/5 ring-1 ring-teal-brand/20'
                    : 'border-slate-200/80 bg-white hover:border-teal-brand/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      active
                        ? 'bg-teal-brand text-white'
                        : 'bg-teal-brand/10 text-teal-brand'
                    }`}
                  >
                    <FontAwesomeIcon icon={item.icon} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {active ? 'En cours' : 'Autre action'}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-charcoal">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
                  </div>
                </div>
              </Link>
              {i < modeCards.length - 1 ? (
                <FontAwesomeIcon
                  icon={faArrowRight}
                  className="hidden shrink-0 text-teal-brand/40 sm:block"
                  aria-hidden
                />
              ) : null}
            </div>
          )
        })}
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {message ? (
        <p className="mb-3 text-sm font-medium text-teal-brand">{message}</p>
      ) : null}

      <div
        className={
          mode === 'ajouter'
            ? 'mb-6 rounded-2xl border border-dashed border-teal-brand/30 bg-white px-4 py-5 sm:px-6'
            : 'mb-6 rounded-2xl border border-teal-brand/20 bg-white px-4 py-5 shadow-sm shadow-teal-brand/5 sm:px-6'
        }
      >
        <div className="mb-4 flex items-center gap-2">
          <FontAwesomeIcon
            icon={mode === 'ajouter' ? faFolderPlus : faPaperPlane}
            className="text-teal-brand"
          />
          <h2 className="font-display text-lg font-semibold text-charcoal">
            {copy.formTitle}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {copy.patientLabel}
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-charcoal"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {copy.titleLabel}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={copy.titlePlaceholder}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-teal-brand/40">
            <FontAwesomeIcon icon={faCloudArrowUp} className="text-teal-brand" />
            {file ? file.name.slice(0, 28) : copy.fileLabel}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.png,.jpeg,.txt"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
              disabled={uploading || !patientId}
            />
          </label>
          <button
            type="button"
            disabled={uploading || !patientId || !file}
            onClick={() => void send()}
            className="rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {uploading ? 'Signature MetaMask…' : copy.cta}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          MetaMask · 2 confirmations (émission + NFT).
          {selectedPatient?.walletAddress
            ? ` · ${truncateAddress(selectedPatient.walletAddress, 4)}`
            : ''}
        </p>
      </div>

      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-charcoal">
          {copy.listTitle}
          {forPatient.length > 0 ? (
            <span className="ml-2 font-sans text-sm font-normal text-slate-400">
              {forPatient.length}
            </span>
          ) : null}
        </h2>
        {selectedPatient ? (
          <p className="text-xs text-slate-400">{selectedPatient.displayName}</p>
        ) : null}
      </div>

      {forPatient.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center">
          <FontAwesomeIcon
            icon={faFileMedical}
            className="mb-3 text-2xl text-slate-300"
          />
          <p className="font-medium text-charcoal">{copy.emptyTitle}</p>
          <p className="mt-1.5 text-sm text-slate-500">{copy.emptyHint}</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
          {forPatient.map((r, i) => {
            const cat = r.category ?? inferCategory(r.title, r.kind)
            return (
              <li
                key={r.id}
                className={
                  i > 0
                    ? 'border-t border-slate-100 px-4 py-3.5 sm:px-5'
                    : 'px-4 py-3.5 sm:px-5'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <time className="font-mono text-xs text-slate-400">
                        {formatDateFr(r.uploadedAt)}
                      </time>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-brand">
                        {categoryLabel(cat)}
                      </span>
                      {r.tokenId != null ? (
                        <span className="rounded-full bg-teal-brand/10 px-2 py-0.5 text-[11px] font-semibold text-teal-brand">
                          NFT #{r.tokenId}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700">
                          NFT en attente
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-semibold text-charcoal">
                      {displayTitle(r)}
                    </p>
                    {r.issueTxHash ? (
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {truncateAddress(r.issueTxHash, 8)}
                      </p>
                    ) : null}
                  </div>
                  {r.tokenId == null ? (
                    <button
                      type="button"
                      disabled={anchoringId === r.id || uploading}
                      onClick={() => void retryNft(r)}
                      className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {anchoringId === r.id ? 'Ancrage…' : 'Ancrer NFT'}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
