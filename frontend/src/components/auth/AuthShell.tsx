import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../BrandLogo'

const SIDE_IMG =
  'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=1400&q=80'

type Mode = 'login' | 'register'

export function AuthShell({
  mode,
  title,
  subtitle,
  children,
}: {
  mode: Mode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <motion.img
          src={SIDE_IMG}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          initial={{ scale: 1.06 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-charcoal/95 via-charcoal/78 to-teal-brand/45" />
        <div className="relative z-10">
          <BrandLogo size="xl" light />
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-12 max-w-md font-display text-4xl font-semibold leading-tight text-white"
          >
            MediChain
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28 }}
            className="mt-4 max-w-sm text-base leading-relaxed text-cyan-brand/95"
          >
            {mode === 'login'
              ? 'Déjà inscrit ? Reconnecte ton wallet — ton rôle revient tout seul.'
              : 'Première fois : choisis ton rôle, puis lie MetaMask. Pas d’e-mail.'}
          </motion.p>
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="relative z-10 text-xs leading-relaxed text-white/55"
        >
          Exemple démo Hardhat — Compte 1 client · Compte 2 médecin · Compte 3
          pharmacie
        </motion.p>
      </aside>

      <main className="relative flex flex-col justify-center px-6 py-14 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandLogo size="lg" />
          </div>

          {/* Switch Connexion / Inscription */}
          <div className="mb-8 grid grid-cols-2 rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur">
            <Link
              to="/login"
              className={`rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${
                mode === 'login'
                  ? 'bg-teal-brand text-white shadow-md shadow-teal-brand/25'
                  : 'text-slate-600 hover:text-charcoal'
              }`}
            >
              Connexion
            </Link>
            <Link
              to="/register"
              className={`rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${
                mode === 'register'
                  ? 'bg-teal-brand text-white shadow-md shadow-teal-brand/25'
                  : 'text-slate-600 hover:text-charcoal'
              }`}
            >
              Inscription
            </Link>
          </div>

          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
          >
            <h1 className="font-display text-3xl font-semibold tracking-tight text-charcoal">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {subtitle}
            </p>
            <div className="mt-8">{children}</div>
          </motion.div>

          <p className="mt-10 text-center text-sm text-slate-400">
            <Link to="/" className="transition hover:text-teal-brand">
              ← Retour à l’accueil
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
