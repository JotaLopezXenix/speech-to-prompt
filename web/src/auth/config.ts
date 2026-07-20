import { api } from '@/api/client'

// Config de autenticación servida por el backend (público, /api/auth-config).
// En local devuelve { devBypass:true }; en Azure, los parámetros MSAL no secretos.
// Se lee vía el cliente tipado (SPEC-02) y se cachea (no cambia en runtime).

export type MsalConfig = { clientId: string; authority: string; apiScope: string }
export type AuthConfig = { devBypass: true } | ({ devBypass: false } & MsalConfig)

let cached: AuthConfig | null = null

export async function loadAuthConfig(): Promise<AuthConfig> {
  if (cached) return cached
  const { data, error } = await api.getAuthConfig()
  if (error || !data) throw new Error('No se pudo cargar /api/auth-config')

  if ('devBypass' in data && data.devBypass) {
    cached = { devBypass: true }
  } else if ('clientId' in data && data.clientId && data.apiScope) {
    cached = { devBypass: false, clientId: data.clientId, authority: data.authority, apiScope: data.apiScope }
  } else {
    throw new Error('Config de autenticación incompleta (falta clientId/apiScope)')
  }
  return cached
}
