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

// Cache SÍNCRONO del último token conocido, para consumidores que no pueden
// `await` el provider (el beacon de telemetría en `pagehide`; SPEC-04 §4.7). Lo
// refresca el middleware en cada request; en devBypass queda null (sin token).
let cachedToken: string | null = null

export function getCachedToken(): string | null {
  return cachedToken
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
    cachedToken = token
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

  // Segmentos y audio (SPEC-04; cierra el diferido de SPEC-02).
  // addSegment: multipart → `bodySerializer` construye el FormData (el `body`
  // tipado satisface el contrato AddSegmentForm: audio binario + source).
  addSegment: (
    id: number,
    audio: Blob,
    { source = 'recorded', filename = 'audio.webm' }: { source?: 'recorded' | 'imported'; filename?: string } = {},
  ) =>
    client.POST('/sessions/{id}/segments', {
      params: { path: { id } },
      body: { audio: audio as unknown as string, source },
      bodySerializer: (body: { audio: unknown; source?: string }) => {
        const fd = new FormData()
        fd.append('audio', audio, filename)
        if (body.source) fd.append('source', body.source)
        return fd
      },
    }),
  // getSegmentAudio: respuesta binaria (audio/webm) → parseAs 'blob'. Se cablea
  // aquí; se consume en SPEC-05 (reproducción en Revisión/Resultado).
  getSegmentAudio: (id: number, ordinal: number) =>
    client.GET('/sessions/{id}/audio/{ordinal}', {
      params: { path: { id, ordinal } },
      parseAs: 'blob',
    }),
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
