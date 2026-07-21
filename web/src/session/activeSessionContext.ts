import { createContext, useContext } from 'react'
import type { components } from '@/api/schema'

// Sesión activa del flujo guiado (SPEC-04). Captura la crea/actualiza; Revisión,
// Resultado (SPEC-05) e Historial (SPEC-06) la consumen. Fichero separado del
// componente para no disparar el lint react-refresh (only-export-components).

export type Session = components['schemas']['Session']

export type ActiveSessionValue = {
  sessionId: number | null
  session: Session | null
  setSession: (s: Session) => void
  reset: () => void
}

export const ActiveSessionContext = createContext<ActiveSessionValue | null>(null)

export function useActiveSession(): ActiveSessionValue {
  const ctx = useContext(ActiveSessionContext)
  if (!ctx) throw new Error('useActiveSession debe usarse dentro de <ActiveSessionProvider>')
  return ctx
}
