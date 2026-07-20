import { useEffect, useState, type ReactNode } from 'react'
import {
  EventType,
  InteractionStatus,
  type AuthenticationResult,
  type PublicClientApplication,
} from '@azure/msal-browser'
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react'
import { useTranslation } from 'react-i18next'
import { setTokenProvider, setUnauthorizedHandler } from '@/api/client'
import { AuthContext, computeInitials, type AuthContextValue } from './authContext'
import { loadAuthConfig } from './config'
import { createMsalInstance } from './msal'

// Splash a pantalla completa mientras el bootstrap o una interacción MSAL están
// en curso. Exportado para reutilizarlo en App (estado !ready de las rutas).
export function Splash({ message }: { message?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 text-muted-foreground">
      <p className="text-sm">{message ?? t('auth.loading')}</p>
    </div>
  )
}

// Modo devBypass (local): autenticado siempre, sin MSAL; login/logout no-op.
const DEV_VALUE: AuthContextValue = {
  ready: true,
  isDevBypass: true,
  isAuthenticated: true,
  user: { name: 'Dev local', email: null, initials: 'DEV' },
  login: () => {},
  logout: () => {},
}

type BootState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'dev' }
  | { phase: 'msal'; instance: PublicClientApplication; apiScope: string }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>({ phase: 'loading' })

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const cfg = await loadAuthConfig()
        if (cfg.devBypass) {
          if (alive) setState({ phase: 'dev' })
          return
        }
        const instance = createMsalInstance(cfg)
        instance.addEventCallback((event) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const account = (event.payload as AuthenticationResult).account
            if (account) instance.setActiveAccount(account)
          }
        })
        await instance.initialize()
        const accounts = instance.getAllAccounts()
        if (!instance.getActiveAccount() && accounts.length) {
          instance.setActiveAccount(accounts[0])
        }
        if (alive) setState({ phase: 'msal', instance, apiScope: cfg.apiScope })
      } catch (err) {
        console.error('Fallo en el bootstrap de autenticación:', err)
        if (alive) setState({ phase: 'error' })
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (state.phase === 'loading') return <Splash />
  if (state.phase === 'error') return <AuthError />
  if (state.phase === 'dev') return <AuthContext.Provider value={DEV_VALUE}>{children}</AuthContext.Provider>
  return (
    <MsalProvider instance={state.instance}>
      <MsalAuthBridge apiScope={state.apiScope}>{children}</MsalAuthBridge>
    </MsalProvider>
  )
}

function AuthError() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-error">{t('auth.error')}</p>
      <button className="text-sm underline" onClick={() => window.location.reload()}>
        {t('auth.retry')}
      </button>
    </div>
  )
}

// Dentro de MsalProvider: traduce el estado reactivo de MSAL al AuthContext y
// cablea las costuras del cliente tipado (token + 401).
function MsalAuthBridge({ apiScope, children }: { apiScope: string; children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const ready = inProgress === InteractionStatus.None

  useEffect(() => {
    setTokenProvider(async () => {
      const account = instance.getActiveAccount() ?? accounts[0]
      if (!account) return null
      try {
        const r = await instance.acquireTokenSilent({ scopes: [apiScope], account })
        return r.accessToken
      } catch {
        return null
      }
    })
    setUnauthorizedHandler(() => {
      void instance.acquireTokenRedirect({ scopes: [apiScope] })
    })
    return () => {
      setTokenProvider(() => null)
      setUnauthorizedHandler(null)
    }
  }, [instance, accounts, apiScope])

  const account = instance.getActiveAccount() ?? accounts[0] ?? null
  const user = account
    ? {
        name: account.name ?? null,
        email: account.username ?? null,
        initials: computeInitials(account.name, account.username),
      }
    : null

  const value: AuthContextValue = {
    ready,
    isDevBypass: false,
    isAuthenticated,
    user,
    login: () => {
      void instance.loginRedirect({ scopes: [apiScope] })
    },
    logout: () => {
      void instance.logoutRedirect()
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
