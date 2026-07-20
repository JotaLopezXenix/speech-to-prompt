import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './authContext'
import { PATHS } from '@/routes/paths'

// Guard de las rutas de la app. El estado !ready (bootstrap/interacción MSAL) lo
// cubre App con un Splash antes de montar las rutas, así que aquí `ready` ya es
// true. En devBypass es passthrough (espejo del backend local).
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isDevBypass, isAuthenticated } = useAuth()
  if (isDevBypass || isAuthenticated) return <>{children}</>
  return <Navigate to={PATHS.login} replace />
}
