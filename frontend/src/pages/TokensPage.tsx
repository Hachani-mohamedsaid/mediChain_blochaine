import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faCoins,
  faExchangeAlt,
  faGift,
  faPills,
} from '@fortawesome/free-solid-svg-icons'
import { formatEther, parseEther } from 'ethers'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { getContracts } from '../lib/chain'
import { formatTxError, okMessage, sendLocalTx } from '../lib/tx'

export default function TokensPage() {
  const { user } = useAuth()
  const { connect, isHardhat } = useWallet()
  const isPatient = user?.role === 'patient'

  const [balance, setBalance] = useState('0')
  const [ethAmount, setEthAmount] = useState('0.01')
  const [paymentId, setPaymentId] = useState('')
  const [rate, setRate] = useState('1000')
  const [bonus, setBonus] = useState('50')
  const [medPrice, setMedPrice] = useState('25')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const ctx = await getContracts()
      if (!ctx.token) return
      const [bal, tpe, rb, dmp] = await Promise.all([
        ctx.token.balanceOf(ctx.address),
        ctx.token.tokensPerEth(),
        ctx.token.reservationBonus(),
        ctx.token.defaultMedicinePrice(),
      ])
      setBalance(formatEther(bal))
      setRate(formatEther(tpe))
      setBonus(formatEther(rb))
      setMedPrice(formatEther(dmp))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, user])

  async function buyTokens() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      if (!isHardhat) await connect()
      const ctx = await getContracts()
      if (!ctx.token) throw new Error('MediChainToken manquant — redéploie')
      const value = parseEther(ethAmount || '0')
      if (value <= 0n) throw new Error('Montant ETH invalide')
      const before = await ctx.token.balanceOf(ctx.address)
      const { hash } = await sendLocalTx(
        (gas) => ctx.token!.buyWithEth({ value, ...gas }),
        {
          verifyOk: async () => {
            const after = await ctx.token!.balanceOf(ctx.address)
            return after > before
          },
        },
      )
      setMessage(okMessage(`Achat MCT confirmé · tx ${hash.slice(0, 14)}…`))
      await refresh()
    } catch (e) {
      setError(formatTxError(e, 'Achat impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function claimBonus() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      if (!isHardhat) await connect()
      const ctx = await getContracts()
      if (!ctx.token) throw new Error('Token manquant')
      if (!(await ctx.mediChain.isPatient(ctx.address))) {
        await sendLocalTx((gas) => ctx.mediChain.joinAsPatient(gas))
      }
      const id = Number(paymentId)
      if (!Number.isFinite(id) || id < 1) throw new Error('paymentId invalide')
      const before = await ctx.token.balanceOf(ctx.address)
      const { hash } = await sendLocalTx(
        (gas) => ctx.token!.claimReservationBonus(id, gas),
        {
          verifyOk: async () => {
            const after = await ctx.token!.balanceOf(ctx.address)
            return after > before
          },
        },
      )
      setMessage(okMessage(`Bonus réservation reçu · tx ${hash.slice(0, 14)}…`))
      await refresh()
    } catch (e) {
      setError(formatTxError(e, 'Claim impossible'))
    } finally {
      setBusy(false)
    }
  }

  const tokenSteps = [
    {
      step: '1',
      title: 'Échange ETH → MCT',
      hint: 'Achète des tokens',
      icon: faExchangeAlt,
    },
    {
      step: '2',
      title: 'Bonus réservation',
      hint: 'Récompense après RDV',
      icon: faGift,
    },
    {
      step: '3',
      title: 'Paie à la pharmacie',
      hint: 'Médicaments en MCT',
      icon: faPills,
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Tokens MCT" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {tokenSteps.map((item, i) => (
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
            {i < tokenSteps.length - 1 ? (
              <FontAwesomeIcon
                icon={faArrowRight}
                className="hidden shrink-0 text-teal-brand/40 sm:block"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>

      <SpotlightCard className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-sm text-slate-500">Solde wallet</p>
          <p className="font-display text-3xl font-semibold text-teal-brand">
            {Number(balance).toLocaleString('fr-FR', { maximumFractionDigits: 4 })}{' '}
            MCT
          </p>
        </div>
        <ul className="text-sm text-slate-600">
          <li>Taux : {rate} MCT / 1 ETH</li>
          <li>Bonus réservation : {bonus} MCT</li>
          <li>Prix médicament par défaut : {medPrice} MCT</li>
        </ul>
      </SpotlightCard>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-teal-brand/10 px-4 py-3 text-sm text-teal-900">
          {message}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SpotlightCard className="space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">
            <FontAwesomeIcon icon={faCoins} className="mr-2 text-teal-brand" />
            Acheter des MCT (argent → token)
          </h2>
          <label className="block text-sm font-medium text-slate-600">
            ETH à échanger
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={ethAmount}
              onChange={(e) => setEthAmount(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            ≈ {(Number(ethAmount || 0) * Number(rate || 0)).toLocaleString('fr-FR')}{' '}
            MCT
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void buyTokens()}
            className="rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Signature…' : 'Acheter avec ETH'}
          </button>
        </SpotlightCard>

        {isPatient ? (
          <SpotlightCard className="space-y-4 p-6">
            <h2 className="font-display text-lg font-semibold">
              <FontAwesomeIcon icon={faGift} className="mr-2 text-teal-brand" />
              Bonus après réservation BC
            </h2>
            <p className="text-sm text-slate-600">
              Après un paiement MediChainPay, entre l’ID du paiement (#) pour
              recevoir {bonus} MCT.
            </p>
            <label className="block text-sm font-medium text-slate-600">
              paymentId
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                placeholder="ex. 1"
                value={paymentId}
                onChange={(e) => setPaymentId(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || !paymentId}
              onClick={() => void claimBonus()}
              className="rounded-xl border border-teal-brand px-5 py-2.5 text-sm font-semibold text-teal-brand disabled:opacity-50"
            >
              Claim bonus réservation
            </button>
          </SpotlightCard>
        ) : (
          <SpotlightCard className="space-y-3 p-6 text-sm text-slate-600">
            <FontAwesomeIcon icon={faPills} className="text-teal-brand" />
            <p>
              Les patients utilisent les MCT pour payer le médicament sur la page
              Médicaments. La pharmacie reçoit les tokens dans son wallet.
            </p>
          </SpotlightCard>
        )}
      </div>
    </div>
  )
}
