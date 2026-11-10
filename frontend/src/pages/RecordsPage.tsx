import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faChevronUp,
  faCloudArrowUp,
  faEye,
  faFileMedical,
  faLock,
  faPills,
  faShieldHalved,
  faUserInjured,
} from '@fortawesome/free-solid-svg-icons'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getAuthToken, API_BASE_URL } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { getContracts } from '../lib/chain'
import {
  formatIssueError,
  issueDocumentToPatient,
} from '../lib/issueDocument'
import { okMessage, sendLocalTx } from '../lib/tx'
import {
  DOC_CATEGORIES,
  categoryLabel,
  inferCategory,
  type DocCategory,
} from '../lib/recordsMeta'
import { formatDateFr, truncateAddress } from '../lib/utils'
import type { AccessGrant, AuditEntry, MedicalRecord, User } from '../types'

const PAGE_SIZE = 6

function displayTitle(rec: MedicalRecord) {
  const t = rec.title?.trim()
  const looksId =
    !t ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t) ||
    t.length > 56
  if (!looksId) return t
  return (
    rec.originalName?.replace(/\.[^.]+$/, '') ||
    (rec.kind === 'doctor_issue' ? 'Document médecin' : 'Document médical')
  )
}

export default function RecordsPage() {
  const { user } = useAuth()
  const { connect } = useWallet()
  const isPatient = user?.role === 'patient'
  const isDoctor = user?.role === 'doctor'
  const isPharmacy = user?.role === 'pharmacy'
  const [records, setRecords] = useState<MedicalRecord[]>([])
  const [patients, setPatients] = useState<User[]>([])
  const [doctors, setDoctors] = useState<User[]>([])
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [patientId, setPatientId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [issueFile, setIssueFile] = useState<File | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const [detail, setDetail] = useState<MedicalRecord | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<DocCategory | 'all'>('all')
  const [sort, setSort] = useState<'date_desc' | 'date_asc' | 'title'>('date_desc')
  const [page, setPage] = useState(1)
  const [techOpen, setTechOpen] = useState<string | null>(null)
  const [patientHistory, setPatientHistory] = useState<AuditEntry[]>([])
  const [dossierHint, setDossierHint] = useState('')

  async function load() {
    if (isPatient) {
      const [recs, docs] = await Promise.all([
        api.get<MedicalRecord[]>('/records/mine'),
        api.get<User[]>('/users/doctors'),
      ])
      setRecords(recs.data)
      setDoctors(docs.data)
      setPatientHistory([])
      setDossierHint('')
    } else if (isPharmacy) {
      const shared = await api.get<MedicalRecord[]>('/records/shared-with-me')
      setRecords(shared.data)
      setPatients([])
      setPatientHistory([])
      setDossierHint('')
    } else {
      const [shared, issued, pats, allDocs] = await Promise.all([
        api.get<MedicalRecord[]>('/records/shared-with-me'),
        api.get<MedicalRecord[]>('/records/issued'),
        api.get<User[]>('/users/patients'),
        api.get<User[]>('/users/doctors').catch(() => ({ data: [] as User[] })),
      ])
      setDoctors(allDocs.data)
      setPatients(pats.data)
      const selected = patientId || pats.data[0]?.id || ''
      if (!patientId && pats.data[0]) setPatientId(pats.data[0].id)

      if (selected) {
        try {
          const [dossier, hist] = await Promise.all([
            api.get<MedicalRecord[]>(`/records/patient/${selected}`),
            api.get<AuditEntry[]>(`/audit/patient/${selected}`),
          ])
          setRecords(dossier.data)
          setPatientHistory(hist.data.slice(0, 40))
          setDossierHint('Dossier complet')
          return
        } catch {
          setDossierHint('Consultation requise')
        }
      }

      const map = new Map<string, MedicalRecord>()
      for (const r of [...shared.data, ...issued.data]) {
        if (!selected || r.ownerId === selected) map.set(r.id, r)
      }
      setRecords([...map.values()])
      setPatientHistory([])
    }
  }

  const dossierShell = useMemo(
    () => records.find((r) => r.kind === 'dossier'),
    [records],
  )

  const filtered = useMemo(() => {
    // Patient : uniquement ce que le médecin a ajouté (pas d’import client)
    let list = isPatient
      ? records.filter(
          (r) => r.kind === 'doctor_issue' || Boolean(r.issuedByDoctorId),
        )
      : records.filter((r) => r.kind !== 'dossier')
    if (category !== 'all') {
      list = list.filter(
        (r) => (r.category ?? inferCategory(r.title, r.kind)) === category,
      )
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.originalName ?? '').toLowerCase().includes(q) ||
          r.contentHash.toLowerCase().includes(q),
      )
    }
    list.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      const da = new Date(a.uploadedAt).getTime()
      const db = new Date(b.uploadedAt).getTime()
      return sort === 'date_asc' ? da - db : db - da
    })
    return list
  }, [records, category, search, sort, isPatient])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [search, category, sort])

  function issuerName(rec: MedicalRecord) {
    if (!rec.issuedByDoctorId) return null
    return (
      doctors.find((d) => d.id === rec.issuedByDoctorId)?.displayName ??
      'Médecin'
    )
  }

  useEffect(() => {
    if (!user) return
    void load().catch(() => setError('Chargement des dossiers impossible.'))
  }, [user, isPatient, isPharmacy, patientId])

  async function sendIssue() {
    const file = issueFile
    if (!file || !isDoctor || !patientId) {
      setError('Choisis un patient et un fichier d’abord.')
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
      setIssueFile(null)
      setMessage(
        `Ajouté au dossier · issue ${result.issueTxHash.slice(0, 12)}…${result.nftNote}`,
      )
      await load()
    } catch (err) {
      setError(formatIssueError(err))
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function openRecord(id: string) {
    try {
      setError('')
      // Médecin : preuve on-chain DocumentOpened via le wallet
      if (isDoctor) {
        try {
          await connect()
          const { data: incoming } = await api.get<AccessGrant[]>(
            '/access/incoming',
          )
          const grant = incoming.find(
            (g) => g.recordId === id && g.status === 'active',
          )
          if (grant?.chainGrantId) {
            const ctx = await getContracts()
            const { hash: txHash } = await sendLocalTx((gas) =>
              ctx.mediChain.openDocument(BigInt(grant.chainGrantId), gas),
            )
            try {
              await api.post('/blockchain/log-open', {
                grantId: grant.chainGrantId,
                doctor: ctx.address,
                patient: patients.find((p) => p.id === grant.patientId)
                  ?.walletAddress,
                documentHash: grant.documentHash,
                txHash,
              })
            } catch {
              /* audit best-effort */
            }
            let releaseNote = ''
            if (ctx.pay && grant.documentHash) {
              try {
                await sendLocalTx((gas) =>
                  ctx.pay!.releaseByDocHash(grant.documentHash, gas),
                )
                releaseNote = ' · paiement escrow libéré'
              } catch {
                /* pas de paiement Locked pour ce hash */
              }
            }
            setMessage(
              okMessage(
                `Ouverture on-chain · grant #${grant.chainGrantId} · tx ${String(txHash).slice(0, 14)}…${releaseNote}`,
              ),
            )
          }
        } catch (e) {
          // Docs émis par le médecin (sans grant) : pas d’openDocument
          if (e instanceof Error && !/denied|user rejected|4001/i.test(e.message)) {
            /* continue lecture API */
          }
        }
      }

      const { data } = await api.get<MedicalRecord>(`/records/${id}`)
      setOpened(id)
      setDetail(data)

      const token = getAuthToken()
      const res = await fetch(`${API_BASE_URL}/records/${id}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('file')
      const blob = await res.blob()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      // Patient : aperçu inline · médecin/pharmacie : nouvel onglet aussi
      if (!isPatient) {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      setError('Accès refusé ou dossier introuvable.')
    }
  }

  if (isPharmacy) {
    const attested = filtered.filter((r) => r.tokenId != null).length
    return (
      <div className="space-y-8">
        <PageHeader
          title="Ordonnances"
          subtitle="Espace pharmacie · documents partagés par les patients"
        />

        <section className="overflow-hidden rounded-3xl border border-teal-brand/10 bg-gradient-to-br from-white via-[#F7FFFC] to-teal-brand/5 shadow-sm">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-brand text-xl text-white shadow-lg shadow-teal-brand/25">
                <FontAwesomeIcon icon={faPills} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-brand">
                  Profil pharmacie
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-charcoal">
                  {user?.displayName ?? 'Pharmacie MediChain'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ordonnances et certificats reçus pour délivrance
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-[220px]">
              <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-center shadow-sm">
                <p className="font-display text-xl font-semibold text-charcoal">
                  {filtered.length}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Documents
                </p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-center shadow-sm">
                <p className="font-display text-xl font-semibold text-charcoal">
                  {attested}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  Certifiés NFT
                </p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-charcoal">
              Documents reçus
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Chaque partage patient est présenté comme une fiche dossier.
            </p>
          </div>
          {filtered.length > 0 || search || category !== 'all' ? (
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer…"
                className="w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-44"
              />
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as DocCategory | 'all')
                }
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm"
              >
                <option value="all">Catégories</option>
                {DOC_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) =>
                  setSort(e.target.value as 'date_desc' | 'date_asc' | 'title')
                }
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm"
              >
                <option value="date_desc">Récents</option>
                <option value="date_asc">Anciens</option>
                <option value="title">A→Z</option>
              </select>
            </div>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center">
            <FontAwesomeIcon
              icon={faFileMedical}
              className="mb-3 text-2xl text-slate-300"
            />
            <p className="font-medium text-charcoal">
              {search || category !== 'all'
                ? 'Aucun résultat'
                : 'Aucune ordonnance partagée'}
            </p>
            <p className="mt-1.5 text-sm text-slate-500">
              {search || category !== 'all'
                ? 'Modifie les filtres.'
                : 'Les patients partageront leurs ordonnances ici.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {pageItems.map((rec) => {
              const cat = rec.category ?? inferCategory(rec.title, rec.kind)
              const issuer = issuerName(rec)
              const showTech = techOpen === rec.id
              return (
                <li key={rec.id}>
                  <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)]">
                    <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-stretch sm:p-6">
                      <div className="flex shrink-0 flex-col items-center gap-3 sm:w-36 sm:border-r sm:border-slate-100 sm:pr-6">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-brand to-teal-800 text-2xl text-white shadow-md shadow-teal-brand/20">
                          <FontAwesomeIcon icon={faUserInjured} />
                        </div>
                        <span className="inline-flex rounded-full bg-teal-brand/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-brand">
                          {categoryLabel(cat)}
                        </span>
                        {rec.tokenId != null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2.5 py-1 text-[11px] font-semibold text-teal-900">
                            <FontAwesomeIcon icon={faShieldHalved} />
                            NFT #{rec.tokenId}
                          </span>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              {formatDateFr(rec.uploadedAt)}
                            </p>
                            <h3 className="mt-1 font-display text-xl font-semibold text-charcoal">
                              {displayTitle(rec)}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {issuer
                                ? `Partagé · ${issuer}`
                                : rec.kind === 'doctor_issue'
                                  ? 'Ordonnance médecin'
                                  : 'Document patient'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void openRecord(rec.id)}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-brand/20 hover:bg-teal-700"
                          >
                            <FontAwesomeIcon icon={faEye} />
                            Ouvrir
                          </button>
                        </div>

                        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Fichier
                            </dt>
                            <dd
                              className="mt-1 truncate text-sm font-medium text-charcoal"
                              title={rec.originalName}
                            >
                              {rec.originalName || '—'}
                            </dd>
                          </div>
                          <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Type
                            </dt>
                            <dd className="mt-1 text-sm font-medium text-charcoal">
                              {rec.mimeType || 'Document'}
                            </dd>
                          </div>
                        </dl>

                        <button
                          type="button"
                          onClick={() =>
                            setTechOpen((id) => (id === rec.id ? null : rec.id))
                          }
                          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-teal-brand"
                        >
                          Détails techniques
                          <FontAwesomeIcon
                            icon={showTech ? faChevronUp : faChevronDown}
                            className="text-[9px]"
                          />
                        </button>
                        {showTech ? (
                          <div className="mt-2 space-y-0.5 font-mono text-[10px] text-slate-400">
                            <p>Hash · {truncateAddress(rec.contentHash, 10)}</p>
                            {rec.issueTxHash ? (
                              <p>
                                Issue · {truncateAddress(rec.issueTxHash, 8)}
                              </p>
                            ) : null}
                            {rec.mintTxHash ? (
                              <p>
                                Mint · {truncateAddress(rec.mintTxHash, 8)}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Précédent
            </button>
            <span className="text-sm text-slate-500">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  if (isPatient) {
    return (
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-brand">
            MediChain
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
            Mon dossier médical
          </h1>
          <p className="mt-2 text-slate-600">
            Lecture seule — seuls les documents ajoutés par ton médecin
            apparaissent ici.
          </p>
        </header>

        <section className="mb-8 overflow-hidden rounded-2xl border border-teal-brand/15 bg-gradient-to-br from-white via-mint-soft/40 to-white">
          <div className="border-b border-teal-brand/10 px-6 py-5 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Titulaire
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
                  {user?.displayName ?? 'Patient'}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-brand text-white">
                <FontAwesomeIcon icon={faFileMedical} className="text-lg" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-teal-brand/10 sm:grid-cols-3">
            <div className="bg-white/80 px-6 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Documents
              </p>
              <p className="mt-1 text-xl font-semibold text-charcoal">
                {filtered.length}
              </p>
            </div>
            <div className="bg-white/80 px-6 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Ouvert le
              </p>
              <p className="mt-1 text-sm font-semibold text-charcoal">
                {dossierShell
                  ? formatDateFr(dossierShell.uploadedAt)
                  : '—'}
              </p>
            </div>
            <div className="col-span-2 bg-white/80 px-6 py-4 sm:col-span-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Statut
              </p>
              <p className="mt-1 text-sm font-semibold text-teal-brand">
                Lecture seule
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        ) : null}

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="font-display text-xl font-semibold text-charcoal">
              Documents cliniques
            </h2>
            {filtered.length > 3 ? (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer…"
                className="w-40 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
              />
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
              <FontAwesomeIcon
                icon={faFileMedical}
                className="mb-3 text-3xl text-slate-300"
              />
              <p className="font-medium text-charcoal">
                Aucun document pour l’instant
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Après consultation, ton médecin ajoutera ordonnances, analyses
                et comptes-rendus ici.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
              {filtered.map((rec, i) => {
                const cat = rec.category ?? inferCategory(rec.title, rec.kind)
                const issuer = issuerName(rec)
                const isOpen = opened === rec.id
                return (
                  <li
                    key={rec.id}
                    className={
                      i > 0 ? 'border-t border-slate-100' : undefined
                    }
                  >
                    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <time className="shrink-0 font-mono text-xs text-slate-400">
                            {formatDateFr(rec.uploadedAt)}
                          </time>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-brand">
                            {categoryLabel(cat)}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-semibold text-charcoal">
                          {displayTitle(rec)}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {issuer
                            ? `Ajouté par ${issuer}`
                            : rec.kind === 'doctor_issue'
                              ? 'Ajouté par le médecin'
                              : 'Document médical'}
                          {rec.tokenId != null
                            ? ` · attesté #${rec.tokenId}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void openRecord(rec.id)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
                      >
                        <FontAwesomeIcon icon={faEye} />
                        Ouvrir
                      </button>
                    </div>
                    {isOpen && detail && previewUrl ? (
                      <div className="border-t border-slate-100 bg-mint-soft/40 px-5 py-4 sm:px-6">
                        {detail.mimeType?.startsWith('image/') ? (
                          <img
                            src={previewUrl}
                            alt={displayTitle(detail)}
                            className="max-h-80 w-full rounded-lg object-contain"
                          />
                        ) : detail.mimeType === 'application/pdf' ? (
                          <iframe
                            title={displayTitle(detail)}
                            src={previewUrl}
                            className="h-80 w-full rounded-lg border border-slate-200 bg-white"
                          />
                        ) : (
                          <a
                            href={previewUrl}
                            download={detail.originalName}
                            className="text-sm font-semibold text-teal-brand underline"
                          >
                            Télécharger le fichier
                          </a>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    )
  }

  const dossierOpen = dossierHint.includes('Dossier complet')
  const selectedPatient = patients.find((p) => p.id === patientId)

  return (
    <div className="space-y-4">
      <PageHeader
        title={isPharmacy ? 'Ordonnances partagées' : 'Dossiers'}
        subtitle={
          isPharmacy
            ? 'Documents partagés par les patients.'
            : 'Consulte le dossier après consultation.'
        }
        action={
          isDoctor ? (
            <Link
              to="/ajouter"
              className="inline-flex items-center gap-2 rounded-xl border border-teal-brand/25 bg-teal-brand/5 px-4 py-2.5 text-sm font-semibold text-teal-brand transition hover:bg-teal-brand/10"
            >
              Ajouter une fiche
            </Link>
          ) : undefined
        }
      />
      {isDoctor ? (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Patient
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-charcoal sm:max-w-xs"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
            {selectedPatient ? (
              <span
                className={
                  dossierOpen
                    ? 'inline-flex w-fit items-center rounded-full bg-teal-brand/10 px-2.5 py-1 text-[11px] font-semibold text-teal-brand'
                    : 'inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800'
                }
              >
                {dossierOpen ? 'Consultation ouverte' : 'Consultation requise'}
              </span>
            ) : null}
          </div>
          {!dossierOpen && patientId ? (
            <p className="text-xs text-slate-500 sm:max-w-xs sm:text-right">
              Réserve + paiement d’abord — ou{' '}
              <Link to="/ajouter" className="font-semibold text-teal-brand">
                Ajouter
              </Link>
              {' · '}
              <Link to="/envoyer" className="font-semibold text-teal-brand">
                Envoyer
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {isDoctor && dossierOpen ? (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-dashed border-teal-brand/30 bg-mint-soft/40 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-end sm:px-5">
          <div className="min-w-[12rem] flex-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ajouter au dossier
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Compte-rendu, analyse…"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-teal-brand/40">
            <FontAwesomeIcon icon={faCloudArrowUp} className="text-teal-brand" />
            {issueFile ? issueFile.name.slice(0, 22) : 'Fichier'}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.png,.jpeg,.txt"
              onChange={(ev) => setIssueFile(ev.target.files?.[0] ?? null)}
              disabled={uploading || !patientId}
            />
          </label>
          <button
            type="button"
            disabled={uploading || !patientId || !issueFile}
            onClick={() => void sendIssue()}
            className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {uploading ? 'Signature…' : 'Ajouter + NFT'}
          </button>
        </div>
      ) : null}

      {isDoctor && patientHistory.length > 0 ? (
        <details className="mb-6 rounded-2xl border border-slate-200/80 bg-white">
          <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-charcoal [&::-webkit-details-marker]:hidden">
            Historique · {patientHistory.length} événements
          </summary>
          <ul className="max-h-44 space-y-0 overflow-y-auto border-t border-slate-100 px-5 py-2 text-sm">
            {patientHistory.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-50 py-2 last:border-0"
              >
                <span className="text-charcoal">
                  {h.eventType}
                  {h.metadata ? (
                    <span className="text-slate-500">
                      {' '}
                      · {h.metadata.slice(0, 48)}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {formatDateFr(new Date(h.timestamp * 1000).toISOString())}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {message ? (
        <p className="mb-3 text-sm font-medium text-teal-brand">{message}</p>
      ) : null}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-charcoal">
          Documents
          {filtered.length > 0 ? (
            <span className="ml-2 font-sans text-sm font-normal text-slate-400">
              {filtered.length}
            </span>
          ) : null}
        </h2>
        {filtered.length > 0 || search || category !== 'all' ? (
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer…"
              className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm sm:w-44"
            />
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as DocCategory | 'all')
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="all">Catégories</option>
              {DOC_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as 'date_desc' | 'date_asc' | 'title')
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="date_desc">Récents</option>
              <option value="date_asc">Anciens</option>
              <option value="title">A→Z</option>
            </select>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center">
          <FontAwesomeIcon
            icon={isDoctor && !dossierOpen ? faLock : faFileMedical}
            className="mb-3 text-2xl text-slate-300"
          />
          <p className="font-medium text-charcoal">
            {search || category !== 'all'
              ? 'Aucun résultat'
              : isPharmacy
                ? 'Aucune ordonnance partagée'
                : dossierOpen
                  ? 'Dossier vide'
                  : 'Dossier verrouillé'}
          </p>
          <p className="mt-1.5 text-sm text-slate-500">
            {search || category !== 'all'
              ? 'Modifie les filtres.'
              : isDoctor && !dossierOpen
                ? 'Ouvre une consultation, ou utilise Ajouter / Envoyer.'
                : 'Les documents apparaîtront ici.'}
          </p>
        </div>
      ) : (
        <>
          <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            {pageItems.map((rec, i) => {
              const cat = rec.category ?? inferCategory(rec.title, rec.kind)
              const issuer = issuerName(rec)
              const showTech = techOpen === rec.id
              const isOpen = opened === rec.id
              return (
                <li
                  key={rec.id}
                  className={i > 0 ? 'border-t border-slate-100' : undefined}
                >
                  <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <time className="shrink-0 font-mono text-xs text-slate-400">
                          {formatDateFr(rec.uploadedAt)}
                        </time>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-teal-brand">
                          {categoryLabel(cat)}
                        </span>
                        {rec.tokenId != null ? (
                          <span className="text-[11px] font-medium text-slate-400">
                            NFT #{rec.tokenId}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate font-semibold text-charcoal">
                        {displayTitle(rec)}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {issuer
                          ? `Par ${issuer}`
                          : rec.kind === 'doctor_issue'
                            ? 'Ajouté par le médecin'
                            : 'Document médical'}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setTechOpen((id) => (id === rec.id ? null : rec.id))
                        }
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-teal-brand"
                      >
                        Technique
                        <FontAwesomeIcon
                          icon={showTech ? faChevronUp : faChevronDown}
                          className="text-[9px]"
                        />
                      </button>
                      {showTech ? (
                        <div className="mt-1.5 space-y-0.5 font-mono text-[10px] text-slate-400">
                          <p>Hash · {truncateAddress(rec.contentHash, 10)}</p>
                          {rec.issueTxHash ? (
                            <p>
                              Issue · {truncateAddress(rec.issueTxHash, 8)}
                            </p>
                          ) : null}
                          {rec.mintTxHash ? (
                            <p>
                              Mint · {truncateAddress(rec.mintTxHash, 8)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => void openRecord(rec.id)}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
                      >
                        <FontAwesomeIcon icon={faEye} />
                        Ouvrir
                      </button>
                    </div>
                  </div>
                  {isOpen && detail ? (
                    <div className="border-t border-slate-100 bg-mint-soft/40 px-4 py-4 sm:px-5">
                      {previewUrl && detail.mimeType?.startsWith('image/') ? (
                        <img
                          src={previewUrl}
                          alt={displayTitle(detail)}
                          className="max-h-72 w-full rounded-lg object-contain"
                        />
                      ) : previewUrl &&
                        detail.mimeType === 'application/pdf' ? (
                        <iframe
                          title={displayTitle(detail)}
                          src={previewUrl}
                          className="h-72 w-full rounded-lg border border-slate-200 bg-white"
                        />
                      ) : previewUrl ? (
                        <a
                          href={previewUrl}
                          download={detail.originalName}
                          className="text-sm font-semibold text-teal-brand underline"
                        >
                          Télécharger
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Précédent
              </button>
              <span className="text-sm text-slate-500">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
