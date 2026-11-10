import { Navigate } from 'react-router-dom'

/** Plus de page login séparée — connexion depuis l’accueil via MetaMask */
export default function LoginPage() {
  return <Navigate to="/" replace />
}
