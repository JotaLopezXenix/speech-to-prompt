import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/shell/AppShell'
import { PATHS } from '@/routes/paths'
import { useAuth } from '@/auth/authContext'
import { RequireAuth } from '@/auth/RequireAuth'
import { Splash } from '@/auth/AuthProvider'
import { ActiveSessionProvider } from '@/session/ActiveSessionProvider'
import Capture from '@/routes/Capture'
import Review from '@/routes/Review'
import Distill from '@/routes/Distill'
import Result from '@/routes/Result'
import History from '@/routes/History'
import Settings from '@/routes/Settings'
import Login from '@/routes/Login'

// Acopla el router a la ruta temporal /app (= vite `base`). En el cutover final,
// base pasa a '/' y esto se resuelve solo.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

// /login público, pero si ya hay sesión → al flujo (evita ver el login logueado).
function LoginRoute() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to={PATHS.capture} replace /> : <Login />
}

function AppRoutes() {
  // Mientras el bootstrap/redirect MSAL no ha asentado, splash único (sin rebote).
  const { ready } = useAuth()
  if (!ready) return <Splash />

  return (
    <Routes>
      <Route path={PATHS.login} element={<LoginRoute />} />
      <Route
        element={
          <RequireAuth>
            <ActiveSessionProvider>
              <AppShell />
            </ActiveSessionProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to={PATHS.capture} replace />} />
        <Route path={PATHS.capture} element={<Capture />} />
        <Route path={PATHS.review} element={<Review />} />
        <Route path={PATHS.distill} element={<Distill />} />
        <Route path={PATHS.result} element={<Result />} />
        <Route path={PATHS.history} element={<History />} />
        <Route path={PATHS.settings} element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to={PATHS.capture} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <AppRoutes />
    </BrowserRouter>
  )
}
