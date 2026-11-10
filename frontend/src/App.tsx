import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import RecordsPage from './pages/RecordsPage'
import IssuePage from './pages/IssuePage'
import SendToClientPage from './pages/SendToClientPage'
import AccessPage from './pages/AccessPage'
import AuditPage from './pages/AuditPage'
import BlockchainPage from './pages/BlockchainPage'
import ProfilePage from './pages/ProfilePage'
import PaymentsPage from './pages/PaymentsPage'
import PharmacyPage from './pages/PharmacyPage'
import TokensPage from './pages/TokensPage'
import SupplierPage from './pages/SupplierPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/ajouter" element={<IssuePage />} />
        <Route path="/envoyer" element={<SendToClientPage />} />
        <Route path="/issue" element={<Navigate to="/ajouter" replace />} />
        <Route path="/access" element={<AccessPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/blockchain" element={<BlockchainPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/pharmacy" element={<PharmacyPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/supplier" element={<SupplierPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
