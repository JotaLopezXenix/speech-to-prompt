import { createContext, useContext } from 'react'

// Contexto de autenticación unificado: lo poblan por igual el modo MSAL (prod) y
// el modo devBypass (local). Las pantallas/shell usan `useAuth()`, nunca MSAL
// directamente. Fichero separado del componente para no disparar el lint de
// react-refresh (only-export-components).

export type AuthUser = { name: string | null; email: string | null; initials: string }

export type AuthContextValue = {
  ready: boolean // bootstrap listo y sin interacción MSAL en curso
  isDevBypass: boolean // local: sin MSAL ni gating
  isAuthenticated: boolean // devBypass → true; MSAL → hay cuenta activa
  user: AuthUser | null
  login: () => void // MSAL loginRedirect; devBypass → no-op
  logout: () => void // MSAL logoutRedirect; devBypass → no-op
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

// Iniciales para el avatar: 2 letras de nombre (o email si no hay nombre).
export function computeInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.trim()) || ''
  if (!source) return '?'
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2)
  return letters.toUpperCase()
}
