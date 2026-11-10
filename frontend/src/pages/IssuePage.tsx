import { Navigate } from 'react-router-dom'
import { DoctorIssueForm } from '../components/DoctorIssueForm'
import { useAuth } from '../context/AuthContext'

/** Ajouter une fiche au dossier médical (côté médecin) */
export default function IssuePage() {
  const { user } = useAuth()
  if (user && user.role !== 'doctor') {
    return <Navigate to="/dashboard" replace />
  }
  return <DoctorIssueForm mode="ajouter" />
}
