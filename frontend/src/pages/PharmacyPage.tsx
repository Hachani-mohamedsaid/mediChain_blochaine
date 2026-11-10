import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPills,
  faCheck,
  faCloudArrowUp,
  faCoins,
  faFileMedical,
  faLocationDot,
  faTrash,
  faWallet,
  faMoneyBill,
  faUserInjured,
  faClock,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons'
import axios from 'axios'
import { formatEther, id as ethId, parseEther } from 'ethers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { getContracts } from '../lib/chain'
import { formatTxError, okMessage, sendLocalTx } from '../lib/tx'
import {
  LOCATIONS,
  MEDICINES,
  mctToEth,
  medicineById,
  type PayMethod,
} from '../lib/medicines'
import { formatDateFr, truncateAddress } from '../lib/utils'
import type { MedicalRecord, User } from '../types'

type ShareRow = {
  id: number
  patient: string
  pharmacy: string
  docHash: string
  memo: string
  status: number
}

const STATUS = ['None', 'Shared', 'Dispensed'] as const

function parseMemo(memo: string) {
  const parts = memo.split(' · ').map((p) => p.trim())
  const medicine = parts[0] && !parts[0].includes(':') ? parts[0] : 'Médicament'
  const find = (prefix: string) => {
    const hit = parts.find((p) => p.toLowerCase().startsWith(prefix))
    return hit ? hit.slice(prefix.length).trim() : ''
  }
  const cert = find('cert:')
  const loc = find('loc:')
  const payRaw = find('pay:')
  const price =
    parts.find((p) => /mct$/i.test(p) && !p.includes(':')) ||
    parts.find((p) => /\d+\s*mct/i.test(p)) ||
    ''
  return {
    medicine,
    cert: cert || '—',
    location: loc || '—',
    pay:
      payRaw.toUpperCase() === 'MCT'
        ? 'Tokens MCT'
        : payRaw.toUpperCase() === 'CASH'
          ? 'Cash (ETH)'
          : payRaw || '—',
    price: price || '—',
  }
}

function statusMeta(status: number) {
  if (status === 2) {
    return {
      label: 'Délivré',
      className: 'bg-teal-brand/10 text-teal-800 ring-teal-brand/20',
      icon: faCircleCheck,
    }
  }
  if (status === 1) {
    return {
      label: 'À délivrer',
      className: 'bg-amber-50 text-amber-900 ring-amber-200',
      icon: faClock,
    }
  }
  return {
    label: STATUS[status] ?? '—',
    className: 'bg-slate-100 text-slate-600 ring-slate-200',
    icon: faClock,
  }
}

export default function PharmacyPage() {
  const { user } = useAuth()
  const { connect, isHardhat } = useWallet()
  const isPatient = user?.role === 'patient'
  const isPharmacy = user?.role === 'pharmacy'

  const [shares, setShares] = useState<ShareRow[]>([])
  const [pharmacies, setPharmacies] = useState<User[]>([])
  const [pharmacyId, setPharmacyId] = useState('')
  const [medicineId, setMedicineId] = useState(MEDICINES[0]?.id ?? '')
  const [location, setLocation] = useState<string>(LOCATIONS[0])
  const [payMethod, setPayMethod] = useState<PayMethod>('mct')
  const [certId, setCertId] = useState('')
  const [certs, setCerts] = useState<MedicalRecord[]>([])
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mctBalance, setMctBalance] = useState('0')

  const selectedMed = useMemo(
    () => medicineById(medicineId) ?? MEDICINES[0],
    [medicineId],
  )
  const selectedCert = useMemo(
    () => certs.find((c) => c.id === certId),
    [certs, certId],
  )
  const ethPrice = selectedMed ? mctToEth(selectedMed.priceMct) : '0'

  const loadShares = useCallback(async () => {
    try {
      const ctx = await getContracts()
      if (!ctx.pharmacy) {
        setShares([])
        return
      }
      const next = Number(await ctx.pharmacy.nextShareId())
      const mine = (await ctx.signer.getAddress()).toLowerCase()
      const rows: ShareRow[] = []
      for (let id = 1; id < next; id++) {
        const s = await ctx.pharmacy.shares(id)
        const patient = String(s.patient ?? s[0]).toLowerCase()
        const pharmacy = String(s.pharmacy ?? s[1]).toLowerCase()
        const status = Number(s.status ?? s[5])
        if (status === 0) continue
        if (isPharmacy && pharmacy !== mine) continue
        if (isPatient && patient !== mine) continue
        rows.push({
          id,
          patient,
          pharmacy,
          docHash: String(s.docHash ?? s[2]),
          memo: String(s.memo ?? s[3] ?? ''),
          status,
        })
      }
      setShares(rows.reverse())
    } catch {
      setShares([])
    }
  }, [isPatient, isPharmacy])

  useEffect(() => {
    void loadShares()
  }, [loadShares])

  function pickCerts(recs: MedicalRecord[]) {
    return recs.filter(
      (r) =>
        r.kind === 'doctor_issue' ||
        r.kind === 'patient_upload' ||
        Boolean(r.issuedByDoctorId) ||
        /ordo|certificat|prescription/i.test(r.title ?? ''),
    )
  }

  async function reloadCerts(selectId?: string | null) {
    const recs = await api.get<MedicalRecord[]>('/records/mine')
    const list = pickCerts(recs.data)
    setCerts(list)
    if (selectId === null) {
      setCertId(list[0]?.id ?? '')
      return
    }
    if (selectId) setCertId(selectId)
    else if (list[0] && !certId) setCertId(list[0].id)
    else if (certId && !list.some((c) => c.id === certId)) {
      setCertId(list[0]?.id ?? '')
    }
  }

  useEffect(() => {
    if (!isPatient) return
    void (async () => {
      const ph = await api.get<User[]>('/users/pharmacies')
      // Toutes les pharmacies avec wallet sont déjà au registre (on-chain auto)
      const list = ph.data.filter((p) => p.walletAddress)
      setPharmacies(list)
      if (list[0]) setPharmacyId(list[0].id)
      await reloadCerts()
    })().catch(() => setError('Chargement pharmacies / certificats impossible'))
  }, [isPatient])

  async function importCertFile(file: File | null) {
    if (!file || !isPatient) return
    setImporting(true)
    setError('')
    setMessage('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append(
        'title',
        file.name.replace(/\.[^.]+$/, '') || 'Ordonnance importée',
      )
      form.append('description', 'Import patient · commande pharmacie')
      const { data } = await api.post<MedicalRecord>('/records', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await reloadCerts(data.id)
      setMessage(`Fiche importée · ${data.title}`)
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const raw = (e.response?.data as { message?: string | string[] })
          ?.message
        setError(
          Array.isArray(raw) ? raw.join(', ') : String(raw ?? 'Import impossible'),
        )
      } else {
        setError(e instanceof Error ? e.message : 'Import impossible')
      }
    } finally {
      setImporting(false)
    }
  }

  async function deleteImportedCert() {
    if (!selectedCert || selectedCert.kind !== 'patient_upload') return
    setImporting(true)
    setError('')
    setMessage('')
    try {
      await api.delete(`/records/${selectedCert.id}`)
      await reloadCerts(null)
      setMessage('Fiche importée supprimée.')
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const raw = (e.response?.data as { message?: string | string[] })
          ?.message
        setError(
          Array.isArray(raw)
            ? raw.join(', ')
            : String(raw ?? 'Suppression impossible'),
        )
      } else {
        setError(e instanceof Error ? e.message : 'Suppression impossible')
      }
    } finally {
      setImporting(false)
    }
  }

  async function ensureJoined() {
    const ctx = await getContracts()
    if (!ctx.pharmacy) throw new Error('Contrat MediChainPharmacy manquant')
    // Pharmacies déjà au registre par défaut — pas de joinAsPharmacy
    if (isPatient) {
      if (!(await ctx.mediChain.isPatient(ctx.address))) {
        await sendLocalTx((gas) => ctx.mediChain.joinAsPatient(gas))
      }
    }
    if (ctx.token) {
      const bal = await ctx.token.balanceOf(ctx.address)
      setMctBalance(formatEther(bal))
    }
    return ctx
  }

  useEffect(() => {
    if (!user || !isHardhat) return
    void (async () => {
      try {
        const ctx = await getContracts()
        if (ctx.token) {
          const bal = await ctx.token.balanceOf(ctx.address)
          setMctBalance(formatEther(bal))
        }
      } catch {
        /* ignorer jusqu’à une action utilisateur */
      }
    })()
  }, [user, isHardhat])

  /** Commander dwee : share SC + payer MCT ou ETH (cash on-chain) */
  async function orderMedicine() {
    if (!isPatient || !selectedMed || !pharmacyId) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (!isHardhat) await connect()
      const pharmacyUser = pharmacies.find((p) => p.id === pharmacyId)
      if (!pharmacyUser?.walletAddress) {
        throw new Error('Pharmacie sans wallet')
      }
      const ctx = await ensureJoined()
      const pharmacyAddr = pharmacyUser.walletAddress

      if (!selectedCert) {
        throw new Error(
          'Choisis un certificat / ordonnance du médecin (ou attends qu’il t’en envoie).',
        )
      }

      const memo = [
        selectedMed.name,
        `cert:${selectedCert.title}`,
        `loc:${location}`,
        payMethod === 'mct' ? 'pay:MCT' : 'pay:CASH',
        `${selectedMed.priceMct}MCT`,
      ].join(' · ')

      // Hash du certificat médecin (sinon hash démo médicament)
      const docHash =
        selectedCert.contentHash ||
        ethId(
          `medichain:med:${selectedMed.id}:${location}:${ctx.address}`,
        )

      // Accès API fichier pour la pharmacie
      try {
        await api.post('/access/grant', {
          doctorId: pharmacyId,
          recordId: selectedCert.id,
          purpose: `Médicament · ${selectedMed.name}`,
          durationSeconds: 7 * 24 * 3600,
          permissions: ['read', 'download'],
        })
      } catch {
        /* best-effort — commande SC continue */
      }

      const beforeShare = Number(await ctx.pharmacy!.nextShareId())
      await sendLocalTx(
        (gas) =>
          ctx.pharmacy!.sharePrescription(pharmacyAddr, docHash, memo, gas),
        {
          verifyOk: async () =>
            Number(await ctx.pharmacy!.nextShareId()) > beforeShare,
        },
      )
      const shareId = Number(await ctx.pharmacy!.nextShareId()) - 1

      if (payMethod === 'mct') {
        if (!ctx.token) throw new Error('MediChainToken manquant')
        const priceWei = parseEther(String(selectedMed.priceMct))
        const bal = await ctx.token.balanceOf(ctx.address)
        if (bal < priceWei) {
          throw new Error(
            `Solde MCT insuffisant (${formatEther(bal)}). Achète des tokens d’abord.`,
          )
        }
        const beforeBal = await ctx.token.balanceOf(ctx.address)
        await sendLocalTx(
          (gas) =>
            ctx.token!.payForMedicine(pharmacyAddr, priceWei, shareId, gas),
          {
            verifyOk: async () => {
              const after = await ctx.token!.balanceOf(ctx.address)
              return after < beforeBal
            },
          },
        )
        setMessage(
          okMessage(
            `Commande #${shareId} · ${selectedMed.name} · certif « ${selectedCert.title} » · payé ${selectedMed.priceMct} MCT`,
          ),
        )
      } else {
        const value = parseEther(ethPrice)
        await sendLocalTx(
          (gas) =>
            ctx.signer.sendTransaction({
              to: pharmacyAddr,
              value,
              ...gas,
              gasLimit: 100_000n,
            }),
          {
            verifyOk: async () =>
              Number(await ctx.pharmacy!.nextShareId()) > beforeShare,
          },
        )
        setMessage(
          okMessage(
            `Commande #${shareId} · ${selectedMed.name} · certif « ${selectedCert.title} » · payé ${ethPrice} ETH`,
          ),
        )
      }

      await loadShares()
    } catch (e) {
      setError(formatTxError(e, 'Commande impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function dispense(shareId: number) {
    if (!isPharmacy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (!isHardhat) await connect()
      const ctx = await ensureJoined()
      const { hash } = await sendLocalTx((gas) =>
        ctx.pharmacy!.dispense(shareId, gas),
      )
      setMessage(okMessage(`Délivré · tx ${hash.slice(0, 14)}…`))
      await loadShares()
    } catch (e) {
      setError(formatTxError(e, 'Échec délivrance'))
    } finally {
      setBusy(false)
    }
  }

  const pendingCount = shares.filter((s) => s.status === 1).length
  const doneCount = shares.filter((s) => s.status === 2).length

  return (
    <div className="space-y-8">
      <PageHeader
        title={isPharmacy ? 'Délivrance' : 'Pharmacie — médicaments'}
        subtitle={
          isPharmacy
            ? 'File d’attente patients · paiement on-chain · délivrance'
            : 'Choisis un médicament et ta localisation · paie en MCT ou en ETH'
        }
        action={
          isPharmacy ? (
            <Link
              to="/supplier"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-teal-brand/30 hover:text-teal-brand"
            >
              Voir mon stock
            </Link>
          ) : undefined
        }
      />

      {isPharmacy ? (
        <section className="overflow-hidden rounded-3xl border border-teal-brand/10 bg-gradient-to-br from-white via-[#F7FFFC] to-teal-brand/5 shadow-sm">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-brand text-xl text-white shadow-lg shadow-teal-brand/25">
                <FontAwesomeIcon icon={faPills} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-brand">
                  Espace pharmacie
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-charcoal">
                  {user?.displayName ?? 'Pharmacie MediChain'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Profil professionnel · commandes on-chain Hardhat
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:min-w-[280px]">
              {[
                { label: 'Total', value: shares.length },
                { label: 'À délivrer', value: pendingCount },
                { label: 'Délivrés', value: doneCount },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-center shadow-sm"
                >
                  <p className="font-display text-xl font-semibold text-charcoal">
                    {stat.value}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {isPatient ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Solde MCT :{' '}
          <strong className="text-teal-brand">{mctBalance}</strong>
          {' · '}
          <Link to="/tokens" className="font-semibold text-teal-brand underline">
            acheter des tokens
          </Link>
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-teal-brand/10 px-4 py-3 text-sm text-teal-800">
          {message}
        </p>
      ) : null}

      {isPatient ? (
        <>
          <section>
            <h2 className="mb-4 font-display text-xl font-semibold text-charcoal">
              <FontAwesomeIcon icon={faPills} className="mr-2 text-teal-brand" />
              Liste des médicaments
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {MEDICINES.map((m) => {
                const active = medicineId === m.id
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setMedicineId(m.id)}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        active
                          ? 'border-teal-brand bg-mint-soft/60 shadow-sm ring-1 ring-teal-brand/30'
                          : 'border-slate-200 bg-white hover:border-teal-brand/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-brand">
                            {m.category}
                          </p>
                          <p className="mt-1 font-semibold text-charcoal">
                            {m.name}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {m.form}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-display text-lg font-semibold text-charcoal">
                            {m.priceMct} MCT
                          </p>
                          <p className="text-[11px] text-slate-400">
                            ≈ {mctToEth(m.priceMct)} ETH
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <SpotlightCard className="space-y-5 p-6">
            <h2 className="font-display text-lg font-semibold text-charcoal">
              Commander
            </h2>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <FontAwesomeIcon
                  icon={faLocationDot}
                  className="text-teal-brand"
                />
                Ta localisation
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
              >
                {LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Pharmacie
              </label>
              <select
                value={pharmacyId}
                onChange={(e) => setPharmacyId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
              >
                {pharmacies.length === 0 ? (
                  <option value="">Aucune pharmacie inscrite</option>
                ) : (
                  pharmacies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} (
                      {truncateAddress(p.walletAddress ?? '', 4)})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <FontAwesomeIcon
                  icon={faFileMedical}
                  className="text-teal-brand"
                />
                Certificat / ordonnance
              </label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <select
                  value={certId}
                  onChange={(e) => setCertId(e.target.value)}
                  className="w-full flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                >
                  {certs.length === 0 ? (
                    <option value="">
                      Aucun — importe une fiche ou attends le médecin
                    </option>
                  ) : (
                    certs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.kind === 'patient_upload' ? 'Import · ' : 'Médecin · '}
                        {c.title}
                        {c.uploadedAt ? ` · ${formatDateFr(c.uploadedAt)}` : ''}
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
                      void importCertFile(f)
                    }}
                  />
                </label>
                {selectedCert?.kind === 'patient_upload' ? (
                  <button
                    type="button"
                    disabled={importing || busy}
                    onClick={() => void deleteImportedCert()}
                    title="Supprimer la fiche importée"
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    Supprimer
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Importe ton ordo/certif ou choisis celle du médecin · lié
                on-chain à la pharmacie. (Le Dossier reste lecture seule.)
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">
                Mode de paiement
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPayMethod('mct')}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    payMethod === 'mct'
                      ? 'border-teal-brand bg-teal-brand/10 text-teal-900'
                      : 'border-slate-200 text-slate-700 hover:border-teal-brand/40'
                  }`}
                >
                  <FontAwesomeIcon icon={faCoins} className="text-teal-brand" />
                  <span>
                    Tokens MCT
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {selectedMed?.priceMct ?? '—'} MCT
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod('cash')}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    payMethod === 'cash'
                      ? 'border-teal-brand bg-teal-brand/10 text-teal-900'
                      : 'border-slate-200 text-slate-700 hover:border-teal-brand/40'
                  }`}
                >
                  <FontAwesomeIcon
                    icon={faMoneyBill}
                    className="text-teal-brand"
                  />
                  <span>
                    Cash (ETH)
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {ethPrice} ETH on-chain
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
              <p>
                <strong className="text-charcoal">{selectedMed?.name}</strong>
                {' · '}
                {location}
              </p>
              {selectedCert ? (
                <p className="mt-1">
                  Certif ·{' '}
                  <strong className="text-charcoal">{selectedCert.title}</strong>
                </p>
              ) : null}
              <p className="mt-1">
                Total :{' '}
                {payMethod === 'mct'
                  ? `${selectedMed?.priceMct} MCT`
                  : `${ethPrice} ETH`}
              </p>
            </div>

            <button
              type="button"
              disabled={busy || !pharmacyId || !medicineId || !certId}
              onClick={() => void orderMedicine()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-brand px-6 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 sm:w-auto"
            >
              <FontAwesomeIcon icon={faWallet} />
              {busy
                ? 'Signature MetaMask…'
                : payMethod === 'mct'
                  ? 'Commander & payer en MCT'
                  : 'Commander & payer en ETH'}
            </button>
          </SpotlightCard>
        </>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-charcoal">
              {isPharmacy ? 'File de délivrance' : 'Mes commandes'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isPharmacy
                ? 'Chaque fiche patient est structurée comme un dossier professionnel.'
                : 'Suivi de tes commandes médicaments on-chain.'}
            </p>
          </div>
        </div>

        {shares.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center">
            <FontAwesomeIcon
              icon={faPills}
              className="mb-3 text-2xl text-slate-300"
            />
            <p className="font-medium text-charcoal">Aucune commande</p>
            <p className="mt-1 text-sm text-slate-500">
              Les prescriptions partagées on-chain apparaîtront ici.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {shares.map((s) => {
              const info = parseMemo(s.memo || '')
              const st = statusMeta(s.status)
              return (
                <li key={s.id}>
                  <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)]">
                    <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-stretch sm:p-6">
                      <div className="flex shrink-0 flex-col items-center gap-3 sm:w-36 sm:border-r sm:border-slate-100 sm:pr-6">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-brand to-teal-800 text-2xl text-white shadow-md shadow-teal-brand/20">
                          <FontAwesomeIcon icon={faUserInjured} />
                        </div>
                        <div className="text-center">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            Commande
                          </p>
                          <p className="font-display text-lg font-semibold text-charcoal">
                            #{s.id}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${st.className}`}
                        >
                          <FontAwesomeIcon icon={st.icon} className="text-[10px]" />
                          {st.label}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-brand">
                              Prescription
                            </p>
                            <h3 className="mt-1 font-display text-xl font-semibold text-charcoal">
                              {info.medicine}
                            </h3>
                          </div>
                          {isPharmacy && s.status === 1 ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void dispense(s.id)}
                              className="inline-flex items-center gap-2 rounded-xl bg-teal-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-brand/20 hover:bg-teal-700 disabled:opacity-50"
                            >
                              <FontAwesomeIcon icon={faCheck} />
                              Délivrer
                            </button>
                          ) : null}
                        </div>

                        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              <FontAwesomeIcon icon={faFileMedical} />
                              Certificat
                            </dt>
                            <dd
                              className="mt-1 truncate text-sm font-medium text-charcoal"
                              title={info.cert}
                            >
                              {info.cert}
                            </dd>
                          </div>
                          <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              <FontAwesomeIcon icon={faLocationDot} />
                              Localisation
                            </dt>
                            <dd className="mt-1 text-sm font-medium text-charcoal">
                              {info.location}
                            </dd>
                          </div>
                          <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              <FontAwesomeIcon icon={faCoins} />
                              Paiement
                            </dt>
                            <dd className="mt-1 text-sm font-medium text-charcoal">
                              {info.pay}
                              {info.price !== '—' ? ` · ${info.price}` : ''}
                            </dd>
                          </div>
                          <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                            <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              <FontAwesomeIcon icon={faWallet} />
                              Patient
                            </dt>
                            <dd className="mt-1 font-mono text-sm font-medium text-charcoal">
                              {truncateAddress(s.patient, 5)}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
