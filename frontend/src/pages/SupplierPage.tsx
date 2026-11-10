import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBoxesStacked,
  faCheck,
  faCircleCheck,
  faClock,
  faPaperPlane,
  faPills,
  faPlus,
  faStore,
  faTrash,
  faTruck,
} from '@fortawesome/free-solid-svg-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { getContracts } from '../lib/chain'
import { formatTxError, okMessage, sendLocalTx } from '../lib/tx'
import { MEDICINES, medicineById } from '../lib/medicines'
import { formatDateFr, truncateAddress } from '../lib/utils'
import type { User } from '../types'

type Supply = {
  id: string
  supplierName: string
  pharmacyId: string
  pharmacyName: string
  medicineId: string
  medicineName: string
  quantity: number
  location: string
  status: 'sent' | 'received' | 'cancelled'
  createdAt: string
  txHash?: string
}

type SupplierProduct = {
  id: string
  supplierId: string
  medicineId: string
  name: string
  form: string
  category: string
  quantity: number
  priceMct: number
  createdAt: string
  updatedAt: string
}

type ChainOrder = {
  id: number
  pharmacy: string
  supplier: string
  medicineId: string
  medicineName: string
  quantity: number
  memo: string
  status: number
}

const ORDER_STATUS = ['None', 'Demandée', 'Livrée', 'Annulée'] as const

export default function SupplierPage() {
  const { user } = useAuth()
  const { address, connect } = useWallet()
  const isSupplier = user?.role === 'supplier'
  const isPharmacy = user?.role === 'pharmacy'

  const [pharmacies, setPharmacies] = useState<User[]>([])
  const [suppliers, setSuppliers] = useState<User[]>([])
  const [pharmacyId, setPharmacyId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [medicineId, setMedicineId] = useState('')
  const [quantity, setQuantity] = useState(10)
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [catalog, setCatalog] = useState<SupplierProduct[]>([])
  const [orders, setOrders] = useState<ChainOrder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [newName, setNewName] = useState('')
  const [newForm, setNewForm] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newQty, setNewQty] = useState(50)
  const [newPrice, setNewPrice] = useState(10)

  const selectedMed = useMemo(() => {
    const fromCatalog = catalog.find((p) => p.medicineId === medicineId)
    if (fromCatalog) {
      return {
        id: fromCatalog.medicineId,
        name: fromCatalog.name,
        form: fromCatalog.form,
        category: fromCatalog.category,
        priceMct: fromCatalog.priceMct,
        stock: fromCatalog.quantity,
      }
    }
    const fallback = MEDICINES.find((m) => m.id === medicineId) ?? MEDICINES[0]
    return fallback
      ? { ...fallback, stock: undefined as number | undefined }
      : null
  }, [catalog, medicineId])

  const inventory = useMemo(() => {
    const qty = new Map<string, number>()
    for (const s of supplies) {
      if (s.status !== 'received') continue
      qty.set(s.medicineId, (qty.get(s.medicineId) ?? 0) + s.quantity)
    }
    const base =
      catalog.length > 0
        ? catalog.map((p) => ({
            id: p.medicineId,
            name: p.name,
            form: p.form,
            category: p.category,
            priceMct: p.priceMct,
          }))
        : MEDICINES
    return base.map((m) => ({
      ...m,
      quantity: qty.get(m.id) ?? 0,
    }))
  }, [supplies, catalog])

  const totalUnits = inventory.reduce((n, m) => n + m.quantity, 0)
  const catalogUnits = catalog.reduce((n, p) => n + p.quantity, 0)
  const pendingOrders = orders.filter((o) => o.status === 1)

  const loadSupplies = useCallback(async () => {
    const { data } = await api.get<Supply[]>('/supplies/mine')
    setSupplies(data)
  }, [])

  const loadCatalog = useCallback(
    async (sid?: string) => {
      if (isSupplier) {
        const { data } = await api.get<SupplierProduct[]>(
          '/supplies/products/mine',
        )
        setCatalog(data)
        setMedicineId((prev) =>
          prev && data.some((p) => p.medicineId === prev)
            ? prev
            : (data[0]?.medicineId ?? ''),
        )
        return
      }
      if (isPharmacy && sid) {
        const { data } = await api.get<SupplierProduct[]>(
          `/supplies/products/by-supplier/${sid}`,
        )
        setCatalog(data)
        setMedicineId(data[0]?.medicineId ?? '')
        return
      }
      setCatalog([])
    },
    [isSupplier, isPharmacy],
  )

  const loadOrders = useCallback(async () => {
    try {
      const ctx = await getContracts()
      if (!ctx.supply) {
        setOrders([])
        return
      }
      const signerAddr = (await ctx.signer.getAddress()).toLowerCase()
      const mine = (address || user?.walletAddress || signerAddr).toLowerCase()
      const next = Number(await ctx.supply.nextOrderId())
      const rows: ChainOrder[] = []
      for (let id = 1; id < next; id++) {
        let o: {
          pharmacy?: string
          supplier?: string
          medicineId?: string
          medicineName?: string
          quantity?: bigint | number
          memo?: string
          status?: bigint | number
          0?: string
          1?: string
          2?: string
          3?: string
          4?: bigint | number
          5?: string
          7?: bigint | number
        }
        try {
          o = ctx.supply.getOrder
            ? await ctx.supply.getOrder(id)
            : await ctx.supply.orders(id)
        } catch {
          continue
        }
        const pharmacy = String(o.pharmacy ?? o[0]).toLowerCase()
        const supplier = String(o.supplier ?? o[1]).toLowerCase()
        const status = Number(o.status ?? o[7])
        if (status === 0) continue
        if (isPharmacy && pharmacy !== mine) continue
        if (isSupplier && supplier !== mine) continue
        rows.push({
          id,
          pharmacy,
          supplier,
          medicineId: String(o.medicineId ?? o[2] ?? ''),
          medicineName: String(o.medicineName ?? o[3] ?? ''),
          quantity: Number(o.quantity ?? o[4] ?? 0),
          memo: String(o.memo ?? o[5] ?? ''),
          status,
        })
      }
      setOrders(rows.reverse())
    } catch {
      setOrders([])
    }
  }, [isPharmacy, isSupplier, address, user?.walletAddress])

  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        if (isSupplier) {
          const ph = await api.get<User[]>('/users/pharmacies')
          setPharmacies(ph.data)
          if (ph.data[0]) setPharmacyId(ph.data[0].id)
          await loadCatalog()
        }
        if (isPharmacy) {
          const su = await api.get<User[]>('/users/suppliers')
          setSuppliers(su.data)
          const first = su.data[0]?.id ?? ''
          if (first) setSupplierId(first)
          await loadCatalog(first || undefined)
        }
        await loadSupplies()
        await loadOrders()
      } catch {
        setError('Chargement impossible')
      }
    })()
  }, [user, isSupplier, isPharmacy, loadSupplies, loadOrders, loadCatalog])

  useEffect(() => {
    if (!isPharmacy || !supplierId) return
    void loadCatalog(supplierId)
  }, [isPharmacy, supplierId, loadCatalog])

  async function supplyCtx() {
    if (!address) await connect()
    const ctx = await getContracts()
    if (!ctx.supply) {
      throw new Error('Contrat MediChainSupply manquant — redéploie')
    }
    return ctx
  }

  /** Pharmacie → fournisseur via MetaMask (Compte 3) */
  async function requestFromSupplier() {
    setError('')
    setMessage('')
    if (!isPharmacy) {
      setError('Connecte-toi en pharmacie (Compte 3).')
      return
    }
    if (!selectedMed) {
      setError('Choisis un médicament.')
      return
    }
    if (!supplierId) {
      setError('Choisis un fournisseur.')
      return
    }
    setBusy(true)
    try {
      const supplier = suppliers.find((s) => s.id === supplierId)
      if (!supplier?.walletAddress) {
        throw new Error('Fournisseur sans wallet (Compte 4 MetaMask)')
      }
      const stock = catalog.find((p) => p.medicineId === selectedMed.id)
      if (stock && stock.quantity < quantity) {
        throw new Error(
          `Stock fournisseur insuffisant (${stock.quantity} dispo).`,
        )
      }

      const ctx = await supplyCtx()
      const supply = ctx.supply!
      const before = Number(await supply.nextOrderId())
      await sendLocalTx(
        (gas) =>
          supply.requestSupply(
            supplier.walletAddress,
            selectedMed.id,
            selectedMed.name,
            quantity,
            `cmd pharmacie · ${selectedMed.form}`,
            gas,
          ),
        {
          verifyOk: async () => Number(await supply.nextOrderId()) > before,
        },
      )

      setMessage(
        okMessage(
          `Commande OK · ${selectedMed.name} ×${quantity} → ${supplier.displayName} · #${before}`,
        ),
      )
      await loadOrders()
    } catch (e) {
      setError(formatTxError(e, 'Commande impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function addProduct() {
    if (!isSupplier || !newName.trim()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.post('/supplies/products', {
        name: newName.trim(),
        form: newForm.trim() || undefined,
        category: newCategory.trim() || undefined,
        quantity: newQty,
        priceMct: newPrice,
      })
      setNewName('')
      setNewForm('')
      setNewCategory('')
      setNewQty(50)
      setNewPrice(10)
      setMessage('Produit ajouté au catalogue.')
      await loadCatalog()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ajout impossible')
    } finally {
      setBusy(false)
    }
  }

  async function updateProductQty(id: string, nextQty: number) {
    if (!isSupplier) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/supplies/products/${id}`, {
        quantity: Math.max(0, Math.floor(nextQty)),
      })
      await loadCatalog()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mise à jour impossible')
    } finally {
      setBusy(false)
    }
  }

  async function removeProduct(id: string) {
    if (!isSupplier) return
    setBusy(true)
    setError('')
    try {
      await api.delete(`/supplies/products/${id}`)
      setMessage('Produit retiré.')
      await loadCatalog()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible')
    } finally {
      setBusy(false)
    }
  }

  /** Fournisseur livre via MetaMask (Compte 4) */
  async function fulfillOrder(order: ChainOrder) {
    if (!isSupplier) {
      setError('Connecte-toi en fournisseur (Compte 4).')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const ctx = await supplyCtx()
      const me = ctx.address.toLowerCase()
      if (order.supplier !== me) {
        throw new Error(
          `Mauvais wallet. Commande pour ${order.supplier.slice(0, 10)}… — Compte 4.`,
        )
      }

      const supply = ctx.supply!
      let status = 0
      try {
        const o = supply.getOrder
          ? await supply.getOrder(order.id)
          : await supply.orders(order.id)
        status = Number(o.status ?? o[7] ?? 0)
      } catch {
        status = 0
      }

      let txHash = `fulfill-${order.id}`
      if (status === 1) {
        const { hash } = await sendLocalTx(
          (gas) => supply.fulfillSupply(order.id, gas),
          {
            verifyOk: async () => {
              const o = supply.getOrder
                ? await supply.getOrder(order.id)
                : await supply.orders(order.id)
              return Number(o.status ?? o[7]) === 2
            },
          },
        )
        txHash = hash
      } else if (status !== 2) {
        throw new Error(`Commande #${order.id} non livrable (statut ${status}).`)
      }

      const pharmacy = pharmacies.find(
        (p) => p.walletAddress?.toLowerCase() === order.pharmacy,
      )
      if (pharmacy) {
        try {
          await api.post('/supplies', {
            pharmacyId: pharmacy.id,
            medicineId: order.medicineId,
            medicineName:
              order.medicineName || medicineById(order.medicineId)?.name,
            quantity: order.quantity,
            location: 'Livraison SC',
            txHash,
            autoReceive: true,
          })
        } catch {
          /* ignore */
        }
      }

      const prod = catalog.find((p) => p.medicineId === order.medicineId)
      if (prod) {
        try {
          await api.patch(`/supplies/products/${prod.id}`, {
            quantity: Math.max(0, prod.quantity - order.quantity),
          })
        } catch {
          /* ignore */
        }
      }

      setMessage(
        okMessage(
          `Livré #${order.id} · ${order.medicineName} ×${order.quantity}`,
        ),
      )
      await loadOrders()
      await loadSupplies()
      await loadCatalog()
    } catch (e) {
      setError(formatTxError(e, 'Livraison impossible'))
    } finally {
      setBusy(false)
    }
  }

  async function receiveSupply(id: string) {
    setBusy(true)
    setError('')
    try {
      await api.post(`/supplies/${id}/receive`)
      setMessage('Stock reçu et enregistré.')
      await loadSupplies()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Réception impossible')
    } finally {
      setBusy(false)
    }
  }

  if (!isSupplier && !isPharmacy) {
    return (
      <p className="text-sm text-slate-600">
        Connecte-toi en fournisseur (Compte 4) ou pharmacie (Compte 3).
      </p>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={isSupplier ? 'Fournisseur — produits & livraisons' : 'Mon stock'}
        subtitle={
          isSupplier
            ? 'Ton catalogue · commandes pharmacies · livre via MediChainSupply'
            : 'Stock en rayon · commande au fournisseur'
        }
        action={
          isPharmacy ? (
            <Link
              to="/pharmacy"
              className="inline-flex items-center gap-2 rounded-xl border border-teal-brand/25 bg-teal-brand/5 px-4 py-2.5 text-sm font-semibold text-teal-brand"
            >
              Délivrance
            </Link>
          ) : undefined
        }
      />
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

      {isPharmacy ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                En rayon
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
                {totalUnits}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Commandes
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-charcoal">
                {orders.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                En attente
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-amber-800">
                {pendingOrders.length}
              </p>
            </div>
          </div>

          <SpotlightCard className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faPaperPlane} className="text-teal-brand" />
              <h2 className="font-display text-lg font-semibold text-charcoal">
                Commander au fournisseur
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              Dis au fournisseur quel médicament t’apporter — ancré on-chain.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {(catalog.length > 0
                ? catalog.map((p) => ({
                    id: p.medicineId,
                    name: p.name,
                    form: p.form,
                    category: p.category,
                    supplierStock: p.quantity,
                  }))
                : MEDICINES.map((m) => ({
                    id: m.id,
                    name: m.name,
                    form: m.form,
                    category: m.category,
                    supplierStock: undefined as number | undefined,
                  }))
              ).map((m) => {
                const active = medicineId === m.id
                const myStock =
                  inventory.find((i) => i.id === m.id)?.quantity ?? 0
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMedicineId(m.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-teal-brand bg-mint-soft/50 ring-1 ring-teal-brand/25'
                        : 'border-slate-200 bg-white hover:border-teal-brand/35'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-brand">
                          {m.category}
                        </p>
                        <p className="mt-0.5 font-semibold text-charcoal">
                          {m.name}
                        </p>
                        <p className="text-xs text-slate-500">{m.form}</p>
                        {m.supplierStock !== undefined ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Chez fournisseur : {m.supplierStock}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={
                          myStock > 0
                            ? 'text-sm font-semibold text-teal-brand'
                            : 'text-sm font-semibold text-slate-300'
                        }
                        title="Mon stock"
                      >
                        {myStock}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[10rem] flex-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Fournisseur
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                      {s.walletAddress
                        ? ` (${truncateAddress(s.walletAddress, 4)})`
                        : ' (sans wallet)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Quantité
                </label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={busy || !supplierId || !selectedMed}
                onClick={() => void requestFromSupplier()}
                className="rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Signature MetaMask…' : 'Commander'}
              </button>
            </div>
            {error && isPharmacy ? (
              <p className="text-sm font-medium text-red-600">{error}</p>
            ) : null}
            {message && isPharmacy ? (
              <p className="text-sm font-medium text-teal-800">{message}</p>
            ) : null}
          </SpotlightCard>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <FontAwesomeIcon icon={faBoxesStacked} className="text-teal-brand" />
              <h2 className="font-display text-lg font-semibold text-charcoal">
                Médicaments que j’ai
              </h2>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
              {inventory.map((m, i) => (
                <li
                  key={m.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 ${
                    i > 0 ? 'border-t border-slate-100' : ''
                  }`}
                >
                  <div>
                    <p className="font-semibold text-charcoal">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.form}</p>
                  </div>
                  <p
                    className={
                      m.quantity > 0
                        ? 'font-display text-xl font-semibold text-teal-brand'
                        : 'font-display text-xl font-semibold text-slate-300'
                    }
                  >
                    {m.quantity}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {isSupplier ? (
        <>
          <section className="overflow-hidden rounded-3xl border border-teal-brand/10 bg-gradient-to-br from-white via-[#F7FFFC] to-teal-brand/5 shadow-sm">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-brand text-xl text-white shadow-lg shadow-teal-brand/25">
                  <FontAwesomeIcon icon={faTruck} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-brand">
                    Espace fournisseur
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-charcoal">
                    {user?.displayName ?? 'Fournisseur MediChain'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Catalogue · commandes pharmacies · livraisons on-chain
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:min-w-[280px]">
                <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-center shadow-sm">
                  <p className="font-display text-xl font-semibold text-charcoal">
                    {catalog.length}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    Produits
                  </p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-center shadow-sm">
                  <p className="font-display text-xl font-semibold text-charcoal">
                    {catalogUnits}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    Unités
                  </p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/90 px-3 py-3 text-center shadow-sm">
                  <p className="font-display text-xl font-semibold text-amber-800">
                    {pendingOrders.length}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    À livrer
                  </p>
                </div>
              </div>
            </div>
          </section>

          <SpotlightCard className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faPlus} className="text-teal-brand" />
              <h2 className="font-display text-lg font-semibold text-charcoal">
                Ajouter un produit
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Nom
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex. Doliprane 1000"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Forme
                </label>
                <input
                  value={newForm}
                  onChange={(e) => setNewForm(e.target.value)}
                  placeholder="Boîte 16 cp"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Catégorie
                </label>
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Antalgique"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Qté
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value) || 0)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-20">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    MCT
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value) || 0)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !newName.trim()}
              onClick={() => void addProduct()}
              className="rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? '…' : 'Ajouter au catalogue'}
            </button>
          </SpotlightCard>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <FontAwesomeIcon icon={faBoxesStacked} className="text-teal-brand" />
              <h2 className="font-display text-lg font-semibold text-charcoal">
                Mes produits
              </h2>
            </div>
            {catalog.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-8 text-center text-sm text-slate-500">
                Aucun produit. Ajoute ton premier médicament ci-dessus.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                {catalog.map((p, i) => (
                  <li
                    key={p.id}
                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5 ${
                      i > 0 ? 'border-t border-slate-100' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-brand">
                        {p.category}
                      </p>
                      <p className="font-semibold text-charcoal">{p.name}</p>
                      <p className="text-sm text-slate-500">
                        {p.form} · {p.priceMct} MCT
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        defaultValue={p.quantity}
                        key={`${p.id}-${p.quantity}`}
                        disabled={busy}
                        onBlur={(e) => {
                          const next = Number(e.target.value) || 0
                          if (next !== p.quantity) {
                            void updateProductQty(p.id, next)
                          }
                        }}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm font-semibold"
                        title="Quantité en stock"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void removeProduct(p.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-400 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                        title="Supprimer"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-charcoal">
                  Commandes pharmacies
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  File de livraison · chaque demande est une fiche client.
                </p>
              </div>
              {pendingOrders.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                  <FontAwesomeIcon icon={faClock} className="text-[10px]" />
                  {pendingOrders.length} en attente
                </span>
              ) : null}
            </div>

            {pendingOrders.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center">
                <FontAwesomeIcon
                  icon={faTruck}
                  className="mb-3 text-2xl text-slate-300"
                />
                <p className="font-medium text-charcoal">
                  Aucune commande en attente
                </p>
                <p className="mt-1.5 text-sm text-slate-500">
                  La pharmacie commande depuis Mon stock.
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {pendingOrders.map((o) => {
                  const memoParts = (o.memo || '')
                    .split(' · ')
                    .map((p) => p.trim())
                    .filter(Boolean)
                  const formHint =
                    memoParts.find((p) => /comprimé|boîte|ml|gélule/i.test(p)) ||
                    memoParts[memoParts.length - 1] ||
                    '—'
                  return (
                    <li key={o.id}>
                      <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.35)]">
                        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-stretch sm:p-6">
                          <div className="flex shrink-0 flex-col items-center gap-3 sm:w-36 sm:border-r sm:border-slate-100 sm:pr-6">
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-brand to-teal-800 text-2xl text-white shadow-md shadow-teal-brand/20">
                              <FontAwesomeIcon icon={faStore} />
                            </div>
                            <div className="text-center">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                Commande
                              </p>
                              <p className="font-display text-lg font-semibold text-charcoal">
                                #{o.id}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200">
                              <FontAwesomeIcon
                                icon={faClock}
                                className="text-[10px]"
                              />
                              À livrer
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-teal-brand">
                                  Produit demandé
                                </p>
                                <h3 className="mt-1 font-display text-xl font-semibold text-charcoal">
                                  {o.medicineName || o.medicineId}
                                </h3>
                                <p className="mt-1 text-sm text-slate-500">
                                  Quantité ·{' '}
                                  <strong className="text-charcoal">
                                    ×{o.quantity}
                                  </strong>
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void fulfillOrder(o)}
                                className="inline-flex items-center gap-2 rounded-xl bg-teal-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-brand/20 hover:bg-teal-700 disabled:opacity-50"
                              >
                                <FontAwesomeIcon icon={faCheck} />
                                Livrer
                              </button>
                            </div>

                            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                                <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  <FontAwesomeIcon icon={faStore} />
                                  Pharmacie
                                </dt>
                                <dd className="mt-1 font-mono text-sm font-medium text-charcoal">
                                  {truncateAddress(o.pharmacy, 5)}
                                </dd>
                              </div>
                              <div className="rounded-2xl bg-slate-50/90 px-4 py-3">
                                <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  <FontAwesomeIcon icon={faPills} />
                                  Conditionnement
                                </dt>
                                <dd
                                  className="mt-1 truncate text-sm font-medium text-charcoal"
                                  title={formHint}
                                >
                                  {formHint}
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
        </>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-charcoal">
            {isPharmacy ? 'Mes commandes' : 'Historique livraisons'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {isPharmacy
              ? 'Suivi de tes commandes fournisseur on-chain.'
              : 'Toutes les commandes reçues et livrées.'}
          </p>
        </div>
        {orders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center">
            <FontAwesomeIcon
              icon={faPills}
              className="mb-3 text-2xl text-slate-300"
            />
            <p className="font-medium text-charcoal">Aucune commande</p>
            <p className="mt-1.5 text-sm text-slate-500">
              {isPharmacy
                ? 'Choisis un médicament et clique Commander.'
                : 'Attends une commande de la pharmacie.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const delivered = o.status === 2
              const pending = o.status === 1
              return (
                <li key={o.id}>
                  <article className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex min-w-0 items-start gap-4">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${
                          delivered
                            ? 'bg-teal-brand'
                            : pending
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                        }`}
                      >
                        <FontAwesomeIcon
                          icon={delivered ? faCircleCheck : faTruck}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-lg font-semibold text-charcoal">
                          #{o.id} · {o.medicineName || o.medicineId}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          ×{o.quantity}
                          {' · '}
                          {isPharmacy
                            ? `Fournisseur ${truncateAddress(o.supplier, 5)}`
                            : `Pharmacie ${truncateAddress(o.pharmacy, 5)}`}
                        </p>
                      </div>
                    </div>
                    <span
                      className={
                        delivered
                          ? 'inline-flex items-center gap-1.5 self-start rounded-full bg-teal-brand/10 px-3 py-1 text-xs font-semibold text-teal-brand ring-1 ring-teal-brand/20'
                          : pending
                            ? 'inline-flex items-center gap-1.5 self-start rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200'
                            : 'inline-flex self-start rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500'
                      }
                    >
                      {ORDER_STATUS[o.status] ?? '—'}
                    </span>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {isPharmacy && supplies.some((s) => s.status === 'sent') ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
            Livraisons manuelles à réceptionner
          </h2>
          <ul className="space-y-2">
            {supplies
              .filter((s) => s.status === 'sent')
              .map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-charcoal">
                      {s.medicineName} ×{s.quantity}
                    </p>
                    <p className="text-sm text-slate-500">
                      ← {s.supplierName} · {formatDateFr(s.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void receiveSupply(s.id)}
                    className="rounded-xl bg-teal-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Réceptionner
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
