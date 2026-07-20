import { PublicClientApplication } from '@azure/msal-browser'
import type { MsalConfig } from './config'

// Crea la instancia MSAL desde la config del backend. `redirectUri` = origen + base
// de Vite (→ …/app/ durante 2b; …/ tras el cutover, sin cambio de código). La URI
// debe estar registrada como SPA redirect en el registro de app Entra.
// Cache en sessionStorage (más seguro; coincide con el frontend viejo).
export function createMsalInstance(cfg: MsalConfig): PublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: cfg.authority,
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
}
