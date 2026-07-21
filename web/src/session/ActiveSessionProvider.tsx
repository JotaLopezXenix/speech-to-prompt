import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ActiveSessionContext, type ActiveSessionValue, type Session } from './activeSessionContext'

// Estado en memoria de la SPA (no persiste). Se monta bajo RequireAuth para que
// todas las fases lo lean vía useActiveSession().
export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null)
  const setSession = useCallback((s: Session) => setSessionState(s), [])
  const reset = useCallback(() => setSessionState(null), [])

  const value = useMemo<ActiveSessionValue>(
    () => ({ sessionId: session?.id ?? null, session, setSession, reset }),
    [session, setSession, reset],
  )

  return <ActiveSessionContext.Provider value={value}>{children}</ActiveSessionContext.Provider>
}
