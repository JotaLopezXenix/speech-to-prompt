import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

// Cliente HTTP tipado del contrato /api/v1 (SPEC-02). Los tipos vienen de
// `schema.d.ts`, generado del OpenAPI (`npm run gen:api`). openapi-fetch devuelve
// `{ data, error, response }` (NO lanza en errores HTTP; solo en fallo de red).

// --- Costura de autenticación ------------------------------------------------
// Proveedor de token. En SPEC-02 es no-op (dev bypass local, sin login): las
// rutas protegidas responden con el usuario dev del backend. SPEC-03 lo cablea a
// MSAL con `setTokenProvider`. Es el ÚNICO punto de acoplamiento a auth.
type TokenProvider = () => string | null | Promise<string | null>

let tokenProvider: TokenProvider = () => null

export function setTokenProvider(fn: TokenProvider): void {
  tokenProvider = fn
}

// Handler de 401 irrecuperable. En SPEC-03 el AuthProvider lo cablea a la
// re-adquisición interactiva de MSAL (acquireTokenRedirect); en devBypass no se
// registra (el backend acepta al usuario dev, nunca hay 401). Sin acoplar a MSAL.
type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null
let handling401 = false

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await tokenProvider()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
  onResponse({ response }) {
    // 401: token ausente/expirado. Dispara re-adquisición interactiva (navega
    // fuera), una sola vez para no encadenar redirecciones ante 401 concurrentes.
    if (response.status === 401 && unauthorizedHandler && !handling401) {
      handling401 = true
      unauthorizedHandler()
    }
  },
}

// baseUrl relativo: en dev, Vite hace proxy de /api → :3000; en prod el backend
// sirve /api/v1 en el mismo origen. En el cutover final no cambia (sigue /api/v1).
export const client = createClient<paths>({ baseUrl: '/api/v1' })
client.use(authMiddleware)

// --- Helper de conveniencia (paridad con el cliente viejo, opcional) ---------
// Desenvuelve un resultado de openapi-fetch: lanza con el mensaje del envelope
// `{ error: { code, message } }` si la respuesta no fue OK; si no, devuelve `data`.
// Las pantallas que quieran ergonomía "throw" (como public/js/api-client.js) lo usan.
export async function unwrap<T>(
  p: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await p
  if (error || !response.ok) {
    const msg =
      (error as { error?: { message?: string } } | undefined)?.error?.message ??
      `Error ${response.status}`
    throw new Error(msg)
  }
  return data as T
}

// --- Fachada tipada fina (espejo de public/js/api-client.js) -----------------
// Endpoints JSON. `addSegment` (multipart) y `getSegmentAudio` (stream) se
// consumen y verifican en SPEC-04 (captura) → se añaden allí; el contrato ya los
// describe en el OpenAPI y sus tipos ya existen en `paths`.
export const api = {
  // Salud / auth pública
  healthDb: () => client.GET('/health/db'),
  getAuthConfig: () => client.GET('/auth-config'),

  // Warm-up de la BD (fire-and-forget): despierta la Serverless mientras se dicta.
  warmup: () => client.GET('/health/db').catch(() => {}),

  // Config
  getConfig: () => client.GET('/config'),
  updateConfig: (body: paths['/config']['put']['requestBody']['content']['application/json']) =>
    client.PUT('/config', { body }),

  // Sesiones
  createSession: () => client.POST('/sessions'),
  listSessions: () => client.GET('/sessions'),
  getSession: (id: number) => client.GET('/sessions/{id}', { params: { path: { id } } }),
  updateSession: (
    id: number,
    body: paths['/sessions/{id}']['put']['requestBody']['content']['application/json'],
  ) => client.PUT('/sessions/{id}', { params: { path: { id } }, body }),
  getSessionUsage: (id: number) =>
    client.GET('/sessions/{id}/usage', { params: { path: { id } } }),
  reprocess: (id: number) => client.POST('/sessions/{id}/reprocess', { params: { path: { id } } }),
  distill: (
    id: number,
    body?: paths['/sessions/{id}/distill']['post']['requestBody'] extends { content: { 'application/json': infer B } }
      ? B
      : never,
  ) => client.POST('/sessions/{id}/distill', { params: { path: { id } }, body }),

  // Prompts de destilado (familia del modelo activo)
  getPrompts: () => client.GET('/prompts'),

  // Telemetría de captura (best-effort; el llamador ignora errores)
  postDiagnostics: (
    events: paths['/diagnostics']['post']['requestBody']['content']['application/json']['events'],
  ) => client.POST('/diagnostics', { body: { events } }),
}
