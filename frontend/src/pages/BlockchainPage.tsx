import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronDown,
  faChevronUp,
  faCircleCheck,
  faFileMedical,
  faFingerprint,
  faKey,
  faLinkSlash,
  faTriangleExclamation,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { SpotlightCard } from '../components/effects/SpotlightCard'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { CHAIN, getContracts } from '../lib/chain'
import { truncateAddress } from '../lib/utils'
import { watchNftInMetaMask, watchNftsInMetaMask } from '../lib/watchNft'
import type { BlockchainStatus, MedicalRecord } from '../types'

interface NftItem {
  tokenId: number
  title: string
  contentHash: string
}

type ContractsMap = {
  MediChain?: string
  MediChainDoctor?: string
  MedicalRecordNFT?: string
  MediChainPay?: string
  MediChainIdentity?: string
}

const JOURNEYS = [
  {
    to: '/records',
    icon: faFileMedical,
    title: 'Dossiers',
    text: 'Déposer un document et l’ancrer en NFT (certificat hash).',
  },
  {
    to: '/access',
    icon: faKey,
    title: 'Accès',
    text: 'Partager ou révoquer un accès médecin — signé on-chain.',
  },
  {
    to: '/payments',
    icon: faWallet,
    title: 'Paiements',
    text: 'Payer une consultation en escrow ETH.',
  },
  {
    to: '/profile',
    icon: faFingerprint,
    title: 'Profil',
    text: 'Lier empreinte biométrique au smart contract Identity.',
  },
] as const

export default function BlockchainPage() {
  const { user } = useAuth()
  const { address, connect, isHardhat, connecting } = useWallet()
  const [status, setStatus] = useState<BlockchainStatus | null>(null)
  const [contracts, setContracts] = useState<ContractsMap>({})
  const [nfts, setNfts] = useState<NftItem[]>([])
  const [nftError, setNftError] = useState('')
  const [nftLoading, setNftLoading] = useState(false)
  const [showTech, setShowTech] = useState(false)
  const [mmHint, setMmHint] = useState('')

  const nftContract =
    contracts.MedicalRecordNFT ??
    status?.nftContract ??
    CHAIN.MedicalRecordNFT

  async function syncMetaMaskNfts(ids: number[], force = false) {
    if (!ids.length) return
    setMmHint(force ? 'Ouverture MetaMask…' : '')
    try {
      if (force) {
        let n = 0
        let lastErr = ''
        for (const id of ids) {
          const r = await watchNftInMetaMask({
            tokenId: id,
            contract: nftContract,
            force: true,
          })
          if (r.ok) n += 1
          else if (r.error) lastErr = r.error
        }
        setMmHint(
          n > 0
            ? `${n} NFT proposé(s) à MetaMask — confirme dans la popup.`
            : lastErr ||
                'MetaMask n’a pas ajouté le NFT (vérifie le compte patient).',
        )
      } else {
        await watchNftsInMetaMask(ids, nftContract)
      }
    } catch {
      setMmHint('Impossible de synchroniser avec MetaMask.')
    }
  }

  useEffect(() => {
    if (!user) return
    void Promise.all([
      api.get<BlockchainStatus>('/blockchain/status'),
      api.get<ContractsMap>('/blockchain/contracts'),
    ])
      .then(([s, c]) => {
        setStatus(s.data)
        setContracts(c.data)
      })
      .catch(() => setStatus(null))
  }, [user])

  useEffect(() => {
    if (!user || user.role !== 'patient') return
    void api
      .get<MedicalRecord[]>('/records/mine')
      .then((r) => {
        const list = r.data
          .filter((x) => x.tokenId != null)
          .map((x) => ({
            tokenId: x.tokenId!,
            title: x.title,
            contentHash: x.contentHash,
          }))
        setNfts(list)
      })
      .catch(() => setNfts([]))
  }, [user?.id])

  async function refreshOnChainNfts() {
    setNftError('')
    setNftLoading(true)
    try {
      if (!address) await connect()
      const ctx = await getContracts()
      const items: NftItem[] = []
      const next = Number(await ctx.nft.nextTokenId())
      for (let id = 1; id < next; id++) {
        try {
          const owner = await ctx.nft.ownerOf(id)
          if (owner.toLowerCase() !== ctx.address.toLowerCase()) continue
          const hash = await ctx.nft.hashOfToken(id)
          items.push({
            tokenId: id,
            title: `Token #${id}`,
            contentHash: hash,
          })
        } catch {
          /* burned / missing */
        }
      }
      setNfts(items)
    } catch (e) {
      setNftError(e instanceof Error ? e.message : 'Lecture NFT impossible')
    } finally {
      setNftLoading(false)
    }
  }

  const rpcOk = Boolean(status?.connected)
  const walletOk = Boolean(address && isHardhat)
  const grants = status?.grants ?? 0
  const events = status?.events ?? 0

  const contractRows: { label: string; address?: string }[] = [
    {
      label: 'Accès patient',
      address: contracts.MediChain ?? status?.contract ?? CHAIN.MediChain,
    },
    {
      label: 'Médecin',
      address:
        contracts.MediChainDoctor ??
        status?.doctorContract ??
        CHAIN.MediChainDoctor,
    },
    {
      label: 'NFT dossiers',
      address:
        contracts.MedicalRecordNFT ??
        status?.nftContract ??
        CHAIN.MedicalRecordNFT,
    },
    {
      label: 'Paiements (escrow)',
      address:
        contracts.MediChainPay ?? status?.payContract ?? CHAIN.MediChainPay,
    },
    {
      label: 'Identité (empreinte)',
      address: contracts.MediChainIdentity ?? CHAIN.MediChainIdentity,
    },
  ]

  return (
    <div>
      <PageHeader
        title="État de la chaîne"
        subtitle="Vérifie que ton wallet et le réseau local sont prêts. Les actions se font dans Dossiers, Accès et Paiements."
      />

      <SpotlightCard className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-charcoal">
              Connexion
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={rpcOk ? faCircleCheck : faTriangleExclamation}
                  className={rpcOk ? 'text-teal-brand' : 'text-amber-600'}
                />
                <span className="text-slate-700">
                  {rpcOk
                    ? 'Réseau local joignable'
                    : 'Réseau local hors ligne — lance Hardhat'}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={walletOk ? faCircleCheck : faTriangleExclamation}
                  className={walletOk ? 'text-teal-brand' : 'text-amber-600'}
                />
                <span className="text-slate-700">
                  {walletOk
                    ? `Wallet connecté · ${truncateAddress(address!)}`
                    : address
                      ? 'Mauvais réseau — bascule sur Hardhat Local (31337)'
                      : 'Wallet non connecté'}
                </span>
              </li>
            </ul>
            <p className="mt-4 text-sm text-slate-600">
              <span className="font-semibold text-charcoal">{grants}</span>{' '}
              accès enregistrés ·{' '}
              <span className="font-semibold text-charcoal">{events}</span>{' '}
              événements on-chain
            </p>
          </div>
          <button
            type="button"
            disabled={connecting}
            onClick={() => void connect()}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faWallet} />
            {connecting
              ? 'Connexion…'
              : address
                ? 'Reconnecter le wallet'
                : 'Connecter le wallet'}
          </button>
        </div>
      </SpotlightCard>

      <h2 className="mb-3 font-display text-lg font-semibold text-charcoal">
        Que faire ensuite ?
      </h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {JOURNEYS.map((j) => (
          <Link key={j.to} to={j.to} className="block">
            <SpotlightCard className="h-full p-5 transition hover:border-teal-brand/40">
              <div className="mb-2 flex items-center gap-2 text-teal-brand">
                <FontAwesomeIcon icon={j.icon} />
                <span className="font-display text-base font-semibold text-charcoal">
                  {j.title}
                </span>
              </div>
              <p className="text-sm text-slate-600">{j.text}</p>
            </SpotlightCard>
          </Link>
        ))}
      </div>

      {user?.role === 'patient' && (
        <SpotlightCard className="mb-6 p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-semibold text-charcoal">
                Certificats NFT
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Preuve on-chain du hash du dossier — le fichier reste hors
                chaîne.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/records"
                className="rounded-xl border border-teal-brand/30 px-3 py-1.5 text-xs font-semibold text-teal-brand"
              >
                Aller aux dossiers
              </Link>
              <button
                type="button"
                disabled={nftLoading}
                onClick={() => void refreshOnChainNfts()}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                {nftLoading ? 'Lecture…' : 'Actualiser depuis la chaîne'}
              </button>
            </div>
          </div>
          {nftError && <p className="mb-2 text-sm text-red-600">{nftError}</p>}

          <div className="mb-4 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-charcoal">MetaMask</p>
            <p className="mt-1 text-xs text-slate-600">
              Aucune popup au chargement. Clique un bouton ci-dessous si tu veux
              voir un NFT dans MetaMask (compte patient). Contrat{' '}
              <span className="font-mono">{truncateAddress(nftContract, 5)}</span>
              .
            </p>
            {nfts.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  void syncMetaMaskNfts(
                    [...new Set(nfts.map((x) => x.tokenId))],
                    true,
                  )
                }
                className="mt-3 rounded-xl bg-teal-brand px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Afficher tous dans MetaMask
              </button>
            ) : null}
            {mmHint ? (
              <p className="mt-2 text-xs font-medium text-teal-800">{mmHint}</p>
            ) : null}
          </div>

          {nfts.length === 0 ? (
            <p className="text-sm text-slate-600">
              Aucun certificat pour l’instant. Le médecin doit ajouter une fiche
              avec « + NFT », ou tu cliques « Ancrer NFT » sur une fiche en
              attente.
            </p>
          ) : (
            <ul className="space-y-2">
              {nfts.map((n) => (
                <li
                  key={n.tokenId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mint-soft/60 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-charcoal">
                      NFT #{n.tokenId} · {n.title}
                    </p>
                    <p className="font-mono text-xs text-slate-500">
                      {n.contentHash.slice(0, 18)}…
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void watchNftInMetaMask({
                        tokenId: n.tokenId,
                        contract: nftContract,
                        force: true,
                      }).then((r) =>
                        setMmHint(
                          r.ok
                            ? `NFT #${n.tokenId} proposé — confirme dans MetaMask.`
                            : r.error ||
                                'Échec : compte patient MetaMask requis.',
                        ),
                      )
                    }
                    className="shrink-0 rounded-lg border border-teal-brand/30 bg-white px-3 py-1.5 text-xs font-semibold text-teal-brand"
                  >
                    MetaMask
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SpotlightCard>
      )}

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
        <FontAwesomeIcon
          icon={faLinkSlash}
          className="mt-0.5 text-teal-brand"
        />
        <p>
          <strong className="text-charcoal">Simple :</strong> les fichiers
          médicaux restent sur le serveur. La chaîne garde les accès, les
          paiements escrow et les certificats (hash), pas le contenu médical.
        </p>
      </div>

      <SpotlightCard className="p-0">
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="text-sm font-semibold text-charcoal">
            Détails techniques
          </span>
          <FontAwesomeIcon
            icon={showTech ? faChevronUp : faChevronDown}
            className="text-slate-400"
          />
        </button>
        {showTech && (
          <div className="space-y-3 border-t border-slate-100 px-5 py-4 text-sm">
            <p className="text-xs text-slate-500">
              Mode {status?.mode ?? '—'} · chainId {status?.chainId ?? '31337'}
            </p>
            <ul className="space-y-2 font-mono text-xs text-slate-600">
              {contractRows.map((row) => (
                <li
                  key={row.label}
                  className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-sans text-xs font-medium text-slate-500">
                    {row.label}
                  </span>
                  <span className="break-all">{row.address ?? '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SpotlightCard>
    </div>
  )
}
