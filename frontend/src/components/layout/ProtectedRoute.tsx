import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AppNavbar } from './AppNavbar'
import { PatientNftBanner } from '../PatientNftBanner'
import { DoctorAccessNftBanner } from '../DoctorAccessNftBanner'
import { AnimatePresence, motion } from 'motion/react'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-display text-xl text-teal-brand">
        Chargement…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return (
    <div className="min-h-screen">
      <AppNavbar />
      {user.role === 'patient' ? <PatientNftBanner /> : null}
      {user.role === 'doctor' ? <DoctorAccessNftBanner /> : null}
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </div>
  )
}
