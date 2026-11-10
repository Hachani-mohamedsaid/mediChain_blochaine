import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faCheck,
  faCoins,
  faFileMedical,
  faLock,
  faPaperPlane,
  faReceipt,
  faUserDoctor,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import axios from 'axios'
import { parseEther, formatEther, ZeroHash } from 'ethers'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { getContracts } from '../lib/chain'
import { pushNotification } from '../lib/notifications'
import { formatTxError, okMessage, sendLocalTx } from '../lib/tx'
import { formatDateFr, truncateAddress } from '../lib/utils'
import type { User } from '../types'

type PayStatus = 'pending' | 'locked' | 'released' | 'failed'

type LocalPayment = {
  id: string
  paymentId?: number
  doctorName: string
  from: string
  to: string
  amountEth: string
  feeEth: string
  memo: string
  txHash: string
  at: string
  status: PayStatus
}

type ReservationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paid'
  | 'cancelled'

type Reservation = {
  id: string
  patientId: string
  doctorId: string
  patientName: string
  doctorName: string
  memo: string
  feeEth: string
  status: ReservationStatus
  createdAt: string
  acceptedAt?: string
  paymentId?: number
  txHash?: string
}

const PAY_STATUS = ['None', 'Locked', 'Released', 'Refunded', 'Disputed'] as const

type ChainEscrow = {
  id: number
  patient: string
  doctor: string
  amountEth: string
  memo: string
  status: number
}

const LS_KEY = 'medichain_payments'

function loadLocal(): LocalPayment[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]') as LocalPayment[]
  } catch {
    return []
  }
}

function saveLocal(rows: LocalPayment[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows))
}

function formatEthDisplay(eth: string | null): string {
  if (eth == null) return '—'
  const n = Number(eth)
  if (!Number.isFinite(n)) return eth
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

function statusLabel(s: ReservationStatus): string {
  if (s === 'pending') return 'En attente médecin'
  if (s === 'accepted') return 'Acceptée — à payer'
  if (s === 'rejected') return 'Refusée'
  if (s === 'paid') return 'Payée'
  return 'Annulée'
}

function errMsg(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const m = e.response?.data?.message
    if (Array.isArray(m)) return m.join(', ')
    if (typeof m === 'string') return m
  }
  if (e instanceof Error) return e.message
  return fallback
}

export default function PaymentsPage() {
  const { user } = useAuth()
  const { ensureReady } = useWallet()
  const isPatient = user?.role === 'patient'
  const isDoctor = user?.role === 'doctor'

  const [doctors, setDoctors] = useState<User[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [memo, setMemo] = useState('Consultation')
  const [feeEth, setFeeEth] = useState('0.05')
  const [onChainFee, setOnChainFee] = useState<string | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [history, setHistory] = useState<LocalPayment[]>(() => loadLocal())
  const [escrows, setEscrows] = useState<ChainEscrow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedDoctor = doctors.find((d) => d.id === doctorId)
  const feeWeiOk = onChainFee != null && Number(onChainFee) > 0
  const amountEth = feeWeiOk ? onChainFee! : null

  const totalLabel = useMemo(
    () => (amountEth ? `${formatEthDisplay(amountEth)} ETH` : '—'),
    [amountEth],
  )

  const loadReservations = useCallback(async () => {
    const { data } = await api.get<Reservation[]>('/reservations/mine')
    setReservations(data)
  }, [])

  useEffect(() => {
    if (!user) return
    void (async () => {
      if (isPatient) {
        const d = await api.get<User[]>('/users/doctors')
        setDoctors(d.data)
        if (!doctorId && d.data[0]) setDoctorId(d.data[0].id)
      }
      await loadReservations()
    })().catch(() => setError('Chargement impossible.'))
  }, [user, isPatient, loadReservations])

  useEffect(() => {
    if (!isPatient || !doctorId) return
    const doc = doctors.find((d) => d.id === doctorId)
    if (!doc?.walletAddress) {
      setOnChainFee(null)
      return
    }
    let cancelled = false
    setFeeLoading(true)
    void (async () => {
      try {
        await ensureReady()
        const ctx = await getContracts()
        if (!ctx.pay || cancelled) return
        const wei = await ctx.pay.consultationFeeWei(doc.walletAddress)
        if (cancelled) return
        setOnChainFee(formatEther(wei))
      } catch {
        if (!cancelled) setOnChainFee(null)
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [doctorId, doctors, isPatient, ensureReady])

  useEffect(() => {
    if (!isDoctor || !user) return
    let cancelled = false
    setFeeLoading(true)
    void (async () => {
      try {
        await ensureReady()
        const ctx = await getContracts()
        if (!ctx.pay || cancelled) return
        const addr = ctx.address
        if (!addr) {
          if (!cancelled) setOnChainFee(null)
          return
        }
        const wei = await ctx.pay.consultationFeeWei(addr)
        if (cancelled) return
        const eth = formatEther(wei)
        setOnChainFee(eth)
        if (Number(eth) > 0) {
          setFeeEth(parseFloat(Number(eth).toFixed(6)).toString())
        }
      } catch (e) {
        if (!cancelled) {
          setOnChainFee(null)
          setError(
            e instanceof Error
              ? e.message
              : 'Impossible de lire le tarif on-chain',
          )
        }
      } finally {
        if (!cancelled) setFeeLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isDoctor, user, ensureReady])

  async function loadEscrows() {
    try {
      await ensureReady()
      const ctx = await getContracts()
      if (!ctx.pay) {
        setEscrows([])
        return
      }
      const next = Number(await ctx.pay.nextPaymentId())
      const me = ctx.address.toLowerCase()
      const rows: ChainEscrow[] = []
      for (let id = 1; id < next; id++) {
        const p = await ctx.pay.payments(id)
        const patient = String(p.patient).toLowerCase()
        const doctor = String(p.doctor).toLowerCase()
        if (patient !== me && doctor !== me) continue
        rows.push({
          id,
          patient: String(p.patient),
          doctor: String(p.doctor),
          amountEth: formatEther(p.amountWei),
          memo: String(p.memo),
          status: Number(p.status),
        })
      }
      setEscrows(rows.reverse())
    } catch {
      setEscrows([])
    }
  }

  useEffect(() => {
    if (!user || (!isPatient && !isDoctor)) return
    void loadEscrows()
  }, [user, isPatient, isDoctor])

  async function disputeEscrow(paymentId: number) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await ensureReady()
      const ctx = await getContracts()
      if (!ctx.pay) throw new Error('MediChainPay manquant')
      await sendLocalTx((gas) =>
        ctx.pay!.raiseDispute(
          paymentId,
          'Litige consultation MediChain',
          gas,
        ),
      )
      setMessage(okMessage(`Litige ouvert sur paiement #${paymentId}.`))
      await loadEscrows()
    } catch (e) {
      setError(formatTxError(e, 'Litige impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function setDoctorFee() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const n = Number(feeEth)
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('Le tarif doit être supérieur à 0 ETH')
      }
      await ensureReady()
      const ctx = await getContracts()
      if (!ctx.pay) throw new Error('Contrat MediChainPay manquant — redéploie.')
      if (!(await ctx.doctor.isDoctor(ctx.address))) {
        await sendLocalTx((gas) => ctx.doctor.joinAsDoctor(gas))
      }
      const value = parseEther(feeEth)
      await sendLocalTx((gas) => ctx.pay!.setConsultationFee(value, gas))
      const wei = await ctx.pay.consultationFeeWei(ctx.address)
      const eth = formatEther(wei)
      setOnChainFee(eth)
      setFeeEth(parseFloat(Number(eth).toFixed(6)).toString())
      setMessage(okMessage(`Tarif publié : ${formatEthDisplay(eth)} ETH`))
    } catch (e) {
      setError(formatTxError(e, 'Échec tarif'))
    } finally {
      setBusy(false)
    }
  }

  /** Étape 1 — patient envoie la demande (sans payer) */
  async function sendRequest() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (!doctorId) throw new Error('Choisis un médecin')
      if (!amountEth || Number(amountEth) <= 0) {
        throw new Error(
          'Ce médecin n’a pas encore publié de tarif. Impossible d’envoyer.',
        )
      }
      const { data } = await api.post<Reservation>('/reservations', {
        doctorId,
        memo: memo || 'Consultation',
        feeEth: amountEth,
      })
      pushNotification({
        title: 'Demande envoyée',
        body: `En attente d’acceptation · ${data.doctorName}`,
        href: '/payments',
      })
      setMessage(
        `Demande envoyée à ${data.doctorName}. Tu paieras ${formatEthDisplay(amountEth)} ETH après acceptation.`,
      )
      await loadReservations()
    } catch (e) {
      setError(errMsg(e, 'Envoi impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function acceptReservation(id: string) {
    setBusy(true)
    setError('')
    try {
      await api.post(`/reservations/${id}/accept`)
      setMessage('Demande acceptée — le patient peut maintenant payer.')
      await loadReservations()
    } catch (e) {
      setError(errMsg(e, 'Acceptation impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function rejectReservation(id: string) {
    setBusy(true)
    setError('')
    try {
      await api.post(`/reservations/${id}/reject`)
      setMessage('Demande refusée.')
      await loadReservations()
    } catch (e) {
      setError(errMsg(e, 'Refus impossible'))
    } finally {
      setBusy(false)
    }
  }

  /** Étape 3 — patient paie après acceptation */
  async function payAccepted(res: Reservation) {
    setBusy(true)
    setError('')
    setMessage('')
    const pendingId = crypto.randomUUID()
    try {
      if (res.status !== 'accepted') {
        throw new Error('Paiement possible seulement après acceptation')
      }
      const doctor = doctors.find((d) => d.id === res.doctorId)
      const doctorWallet =
        doctor?.walletAddress ??
        (
          await api.get<User[]>('/users/doctors').then((r) => r.data)
        ).find((d) => d.id === res.doctorId)?.walletAddress
      if (!doctorWallet) throw new Error('Wallet médecin introuvable')

      await ensureReady()
      const ctx = await getContracts()
      if (!ctx.pay) throw new Error('Contrat MediChainPay manquant — redéploie.')
      if (!(await ctx.mediChain.isPatient(ctx.address))) {
        await sendLocalTx((gas) => ctx.mediChain.joinAsPatient(gas))
      }

      const amount = res.feeEth
      const pending: LocalPayment = {
        id: pendingId,
        doctorName: res.doctorName,
        from: ctx.address,
        to: doctorWallet,
        amountEth: amount,
        feeEth: amount,
        memo: res.memo,
        txHash: '',
        at: new Date().toISOString(),
        status: 'pending',
      }
      saveLocal([pending, ...loadLocal()])
      setHistory(loadLocal())

      const value = parseEther(amount)
      const beforePay = Number(await ctx.pay.nextPaymentId())
      const { hash: txHash } = await sendLocalTx(
        (gas) =>
          ctx.pay!.payConsultation(
            doctorWallet,
            ZeroHash,
            res.memo || 'Consultation',
            { value, ...gas },
          ),
        {
          verifyOk: async () =>
            Number(await ctx.pay!.nextPaymentId()) > beforePay,
        },
      )
      const paymentId = Number(await ctx.pay.nextPaymentId()) - 1
      const next = loadLocal().map((p) =>
        p.id === pendingId
          ? { ...p, paymentId, txHash, status: 'locked' as const }
          : p,
      )
      saveLocal(next)
      setHistory(next)

      await api.post(`/reservations/${res.id}/mark-paid`, {
        paymentId,
        txHash,
      })

      try {
        await api.post('/blockchain/log-consultation', {
          patientWallet: ctx.address,
          doctorWallet,
        })
      } catch {
        /* optional */
      }

      let bonusNote = ''
      try {
        if (ctx.token) {
          await sendLocalTx((gas) =>
            ctx.token!.claimReservationBonus(paymentId, gas),
          )
          bonusNote = ' · bonus MCT reçu'
        }
      } catch {
        bonusNote = ` · claim MCT (#${paymentId}) sur /tokens`
      }

      pushNotification({
        title: 'Consultation payée',
        body: `${formatEthDisplay(amount)} ETH escrow → ${res.doctorName}`,
        href: '/payments',
      })
      setMessage(
        okMessage(
          `Paiement #${paymentId} · ${formatEthDisplay(amount)} ETH${bonusNote}`,
        ),
      )
      await loadReservations()
      await loadEscrows()
    } catch (e) {
      const next = loadLocal().map((p) =>
        p.id === pendingId ? { ...p, status: 'failed' as const } : p,
      )
      saveLocal(next)
      setHistory(next)
      setError(errMsg(e, 'Paiement impossible'))
    } finally {
      setBusy(false)
    }
  }

  const pendingForDoctor = reservations.filter((r) => r.status === 'pending')
  const acceptedToPay = reservations.filter((r) => r.status === 'accepted')

  const bookingSteps = isDoctor
    ? [
        {
          step: '1',
          title: 'Publie ton tarif',
          hint: 'Visible par les patients',
          icon: faCoins,
        },
        {
          step: '2',
          title: 'Accepte la demande',
          hint: 'Le patient est notifié',
          icon: faCheck,
        },
        {
          step: '3',
          title: 'Patient paie',
          hint: 'Escrow sécurisé',
          icon: faLock,
        },
        {
          step: '4',
          title: 'Ouvre le dossier',
          hint: 'Consultation prête',
          icon: faFileMedical,
        },
      ]
    : [
        {
          step: '1',
          title: 'Envoie la demande',
          hint: 'Choisis ton médecin',
          icon: faPaperPlane,
        },
        {
          step: '2',
          title: 'Le médecin accepte',
          hint: 'Confirmation reçue',
          icon: faUserDoctor,
        },
        {
          step: '3',
          title: 'Tu paies l’escrow',
          hint: 'Paiement sécurisé',
          icon: faLock,
        },
        {
          step: '4',
          title: 'Dossier ouvert',
          hint: 'Le médecin consulte',
          icon: faFileMedical,
        },
      ]

  return (
    <div className="space-y-4">
      <PageHeader title="Réservation consultation" />

      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {bookingSteps.map((item, i) => (
          <div key={item.step} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="w-full rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-brand/10 text-teal-brand">
                  <FontAwesomeIcon icon={item.icon} className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Étape {item.step}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-charcoal">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>
                </div>
              </div>
            </div>
            {i < bookingSteps.length - 1 ? (
              <FontAwesomeIcon
                icon={faArrowRight}
                className="hidden shrink-0 text-teal-brand/40 sm:block"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-teal-brand">{message}</p>}

      {isDoctor && (
        <SpotlightCard className="mb-8 space-y-4 p-6">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCoins} className="text-teal-brand" />
            <h2 className="font-display text-lg font-semibold text-charcoal">
              Publier mon tarif
            </h2>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-sm font-medium text-slate-700">
              Tarif actuel on-chain
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
              {feeLoading
                ? '…'
                : feeWeiOk
                  ? `${formatEthDisplay(onChainFee)} ETH`
                  : 'Non publié'}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Nouveau tarif (ETH)
              </label>
              <input
                value={feeEth}
                onChange={(e) => setFeeEth(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-36 rounded-xl border border-slate-200 px-4 py-2.5"
              />
            </div>
            <button
              type="button"
              disabled={busy || feeLoading}
              onClick={() => void setDoctorFee()}
              className="rounded-xl bg-teal-brand px-6 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {busy ? 'Signature…' : 'Publier on-chain'}
            </button>
          </div>
        </SpotlightCard>
      )}

      {isDoctor && (
        <SpotlightCard className="mb-8 space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold text-charcoal">
            Demandes de consultation
          </h2>
          {pendingForDoctor.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune demande en attente.</p>
          ) : (
            <ul className="space-y-3">
              {pendingForDoctor.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-charcoal">
                      {r.patientName}
                    </p>
                    <p className="text-sm text-slate-500">
                      {r.memo} · {formatEthDisplay(r.feeEth)} ETH ·{' '}
                      {formatDateFr(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void acceptReservation(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-teal-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <FontAwesomeIcon icon={faCheck} />
                      Accepter
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void rejectReservation(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                      Refuser
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SpotlightCard>
      )}

      {isPatient && (
        <SpotlightCard className="mb-8 space-y-4 p-6">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faReceipt} className="text-teal-brand" />
            <h2 className="font-display text-lg font-semibold text-charcoal">
              Demander une consultation
            </h2>
          </div>
          <p className="text-sm text-slate-600">
            Tu vois le tarif, tu envoies la demande. Le paiement se fait{' '}
            <strong>après</strong> acceptation du médecin — pas besoin de lier
            un dossier.
          </p>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Médecin
            </label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName} — {d.specialty || 'Médecine générale'}
                  {d.walletAddress
                    ? ` · ${truncateAddress(d.walletAddress)}`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Motif</label>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Tarif (affiché — pas encore à payer)
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
                  {feeLoading ? '…' : totalLabel}
                </p>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <FontAwesomeIcon icon={faLock} className="text-teal-brand" />
                Fixé on-chain
              </p>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Médecin : {selectedDoctor?.displayName ?? '—'}
              {selectedDoctor
                ? ` — ${selectedDoctor.specialty || 'Médecine générale'}`
                : ''}
            </p>
            {!feeLoading && !feeWeiOk && (
              <p className="mt-2 text-xs text-amber-800">
                Ce médecin n’a pas encore publié de tarif.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={busy || !doctorId || !feeWeiOk}
            onClick={() => void sendRequest()}
            className="rounded-xl bg-teal-brand px-6 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy
              ? 'Envoi…'
              : feeWeiOk
                ? 'Envoyer la demande (sans payer)'
                : 'En attente du tarif médecin'}
          </button>
        </SpotlightCard>
      )}

      {isPatient && acceptedToPay.length > 0 && (
        <SpotlightCard className="mb-8 space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold text-charcoal">
            À payer — acceptées par le médecin
          </h2>
          <ul className="space-y-3">
            {acceptedToPay.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-teal-brand/25 bg-mint-soft/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-charcoal">{r.doctorName}</p>
                  <p className="text-sm text-slate-600">
                    {r.memo} · {formatEthDisplay(r.feeEth)} ETH
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void payAccepted(r)}
                  className="rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? 'Signature…'
                    : `Payer ${formatEthDisplay(r.feeEth)} ETH`}
                </button>
              </li>
            ))}
          </ul>
        </SpotlightCard>
      )}

      {(isPatient || isDoctor) && reservations.length > 0 && (
        <>
          <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
            Mes demandes
          </h2>
          <ul className="mb-8 space-y-3">
            {reservations.map((r) => (
              <SpotlightCard
                key={r.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-charcoal">
                    {isPatient ? r.doctorName : r.patientName}
                    <span className="font-normal text-slate-500">
                      {' '}
                      · {formatEthDisplay(r.feeEth)} ETH
                    </span>
                  </p>
                  <p className="text-sm text-slate-500">
                    {r.memo} · {formatDateFr(r.createdAt)}
                  </p>
                </div>
                <span
                  className={
                    r.status === 'accepted'
                      ? 'rounded-full bg-teal-brand/10 px-3 py-1 text-xs font-semibold text-teal-brand'
                      : r.status === 'pending'
                        ? 'rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800'
                        : r.status === 'paid'
                          ? 'rounded-full bg-mint-muted px-3 py-1 text-xs font-semibold text-teal-900'
                          : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600'
                  }
                >
                  {statusLabel(r.status)}
                </span>
              </SpotlightCard>
            ))}
          </ul>
        </>
      )}

      {!isPatient && !isDoctor && (
        <p className="text-sm text-slate-600">
          Connecte-toi en patient ou médecin.
        </p>
      )}

      <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
        Escrow on-chain
      </h2>
      {escrows.length === 0 ? (
        <SpotlightCard className="mb-8 p-8 text-center text-slate-600">
          Aucun paiement escrow pour ce wallet.
        </SpotlightCard>
      ) : (
        <ul className="mb-8 space-y-4">
          {escrows.map((p) => (
            <SpotlightCard
              key={p.id}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-charcoal">
                  #{p.id} · {formatEthDisplay(p.amountEth)} ETH
                </p>
                <p className="text-sm text-slate-500">
                  {p.memo || 'Consultation'} · {truncateAddress(p.patient)} →{' '}
                  {truncateAddress(p.doctor)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  {PAY_STATUS[p.status] ?? p.status}
                </span>
                {p.status === 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void disputeEscrow(p.id)}
                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                  >
                    Ouvrir un litige
                  </button>
                )}
              </div>
            </SpotlightCard>
          ))}
        </ul>
      )}

      <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
        Journal local
      </h2>
      {history.length === 0 ? (
        <SpotlightCard className="p-8 text-center text-slate-600">
          Aucune entrée locale.
        </SpotlightCard>
      ) : (
        <ul className="space-y-4">
          {history.map((p) => (
            <SpotlightCard
              key={p.id}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-charcoal">
                  {formatEthDisplay(p.amountEth)} ETH
                  <span className="font-normal text-slate-500">
                    {' '}
                    → {p.doctorName || truncateAddress(p.to)}
                  </span>
                </p>
                <p className="text-sm text-slate-500">{p.memo}</p>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                {p.status === 'locked'
                  ? 'Escrow'
                  : p.status === 'pending'
                    ? 'En cours'
                    : p.status}
              </span>
            </SpotlightCard>
          ))}
        </ul>
      )}
    </div>
  )
}
