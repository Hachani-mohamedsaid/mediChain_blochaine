import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faFileMedical,
  faLock,
  faShieldHalved,
  faUserDoctor,
  faUserInjured,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackgroundBeams } from '../components/effects/BackgroundBeams'
import { BrandLogo } from '../components/BrandLogo'
import { TextGenerateEffect } from '../components/effects/TextGenerateEffect'
import { useAuth } from '../context/AuthContext'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1920&q=80'

const PRODUCT_IMG =
  'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1400&q=80'

const pillars = [
  {
    title: 'Contrôle patient',
    text: 'Vous décidez qui voit vos dossiers, pour combien de temps, et vous révoquez à tout moment.',
    icon: faUserInjured,
  },
  {
    title: 'Accès médecin',
    text: 'Le médecin consulte uniquement ce qui lui a été ouvert — rien d’autre.',
    icon: faUserDoctor,
  },
  {
    title: 'Preuve légère',
    text: 'Un seul contrat on-chain. Les fichiers restent hors chaîne pour limiter le coût.',
    icon: faShieldHalved,
  },
]

const flow = [
  { step: '1', label: 'Déposer', hint: 'Document sécurisé' },
  { step: '2', label: 'Autoriser', hint: 'Durée limitée' },
  { step: '3', label: 'Consulter', hint: 'Trace d’accès' },
  { step: '4', label: 'Révoquer', hint: 'Contrôle total' },
]

export default function LandingPage() {
  const { loginWithWallet, user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function connectWallet() {
    setError('')
    setBusy(true)
    try {
      const u = await loginWithWallet()
      navigate('/dashboard', { replace: true })
      void u
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion MetaMask impossible')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  return (
    <div className="relative min-h-screen">
      {/* HERO */}
      <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
        <motion.img
          src={HERO_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/65 to-charcoal/20" />
        <BackgroundBeams className="z-[1] opacity-30 mix-blend-screen" />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
          <BrandLogo size="xl" light />
          <h1 className="mt-12 max-w-3xl font-display text-4xl font-semibold leading-[1.12] text-white sm:text-5xl md:text-6xl lg:text-[4.25rem]">
            <TextGenerateEffect words="Vos dossiers médicaux, sous votre contrôle." />
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-6 max-w-xl text-lg text-cyan-brand/95 sm:text-xl"
          >
            Partagez en confiance avec vos médecins. Accès temporaires,
            révocation instantanée, historique vérifiable.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            className="mt-10 flex flex-wrap gap-4"
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => void connectWallet()}
              className="inline-flex items-center gap-2 rounded-full bg-teal-brand px-9 py-4 text-base font-semibold text-white shadow-xl shadow-teal-brand/30 transition hover:bg-teal-700 disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faWallet} />
              {busy ? 'Signature…' : 'Connecter MetaMask'}
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </motion.div>
          <p className="mt-4 text-sm text-white/70">
            Compte 1 → patient · 2 → médecin · 3 → pharmacie · 4 → fournisseur
          </p>
          {error ? (
            <p className="mt-3 max-w-md rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-100">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {/* HOW IT WORKS — light SaaS product section */}
      <section className="relative overflow-hidden bg-[#F8FFFC] py-24 sm:py-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-charcoal/5 to-transparent" />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-sm font-semibold tracking-wide text-teal-brand"
            >
              Comment ça marche
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-3 font-display text-4xl font-semibold text-charcoal sm:text-5xl"
            >
              Simple pour les patients.
              <span className="block text-teal-brand">
                Fiable pour les médecins.
              </span>
            </motion.h2>
            <p className="mt-5 text-lg text-slate-600">
              Un parcours clair, sans jargon technique inutile. La blockchain
              reste invisible sauf quand elle protège vos droits.
            </p>
          </div>

          {/* Product preview strip */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mt-14 overflow-hidden rounded-[2rem] border border-teal-brand/10 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)]"
          >
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
              <div className="relative min-h-[280px] lg:min-h-[360px]">
                <img
                  src={PRODUCT_IMG}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-charcoal/50 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 sm:right-auto sm:max-w-sm">
                  <div className="rounded-2xl border border-white/20 bg-white/15 p-4 text-white backdrop-blur-md">
                    <div className="flex items-center gap-2 text-sm font-semibold text-cyan-brand">
                      <FontAwesomeIcon icon={faLock} />
                      Partage sécurisé
                    </div>
                    <p className="mt-2 text-sm text-white/90">
                      Le fichier ne quitte pas votre espace. Seul le droit
                      d’accès voyage on-chain.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-center gap-6 p-8 sm:p-10">
                <div className="flex items-center gap-3 text-teal-brand">
                  <FontAwesomeIcon icon={faFileMedical} className="text-xl" />
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    Parcours en 4 étapes
                  </span>
                </div>
                <ol className="space-y-4">
                  {flow.map((item, i) => (
                    <motion.li
                      key={item.step}
                      initial={{ opacity: 0, x: 12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-center gap-4"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-brand text-sm font-bold text-white">
                        {item.step}
                      </span>
                      <div>
                        <p className="font-semibold text-charcoal">
                          {item.label}
                        </p>
                        <p className="text-sm text-slate-500">{item.hint}</p>
                      </div>
                      {i < flow.length - 1 && (
                        <span className="ml-auto hidden text-teal-brand/40 sm:inline">
                          →
                        </span>
                      )}
                    </motion.li>
                  ))}
                </ol>
              </div>
            </div>
          </motion.div>

          {/* Three pillars — not dark tech cards */}
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {pillars.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-[1.75rem] border border-teal-brand/10 bg-white p-8 shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-teal-brand/10"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-brand/10 text-teal-brand">
                  <FontAwesomeIcon icon={p.icon} className="text-lg" />
                </div>
                <h3 className="mt-6 font-display text-xl font-semibold text-charcoal">
                  {p.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {p.text}
                </p>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16 flex flex-col items-center justify-between gap-6 rounded-[2rem] bg-charcoal px-8 py-10 text-center sm:flex-row sm:px-12 sm:text-left"
          >
            <div>
              <p className="font-display text-2xl font-semibold text-white sm:text-3xl">
                Prêt à démarrer ?
              </p>
              <p className="mt-2 text-slate-300">
                Compte MetaMask 1 patient · 2 médecin · 3 pharmacie · 4
                fournisseur — une signature suffit.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void connectWallet()}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-teal-brand px-8 py-4 font-semibold text-white shadow-lg shadow-teal-brand/30 transition hover:bg-teal-600 disabled:opacity-60"
              >
                <FontAwesomeIcon icon={faWallet} />
                {busy ? 'Signature…' : 'Connecter MetaMask'}
                <FontAwesomeIcon icon={faArrowRight} />
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
