import { Navigate } from 'react-router-dom'
import { DoctorIssueForm } from '../components/DoctorIssueForm'
import { useAuth } from '../context/AuthContext'

/** Envoyer un dossier au client (patient) */
export default function SendToClientPage() {
  const { user } = useAuth()
  if (user && user.role !== 'doctor') {
    return <Navigate to="/dashboard" replace />
  }
  return <DoctorIssueForm mode="envoyer" />
}
