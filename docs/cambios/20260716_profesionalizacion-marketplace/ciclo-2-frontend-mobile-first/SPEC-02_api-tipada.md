# SPEC-02 — API tipada (OpenAPI + `/api/v1` + cliente tipado en `web/`)

**Ciclo:** 2 `frontend-mobile-first` · **Sub-ciclo:** 2b (construcción) · **Fecha:** 20-jul-2026 · **Fase JCC:** especificación.
**DESIGN (fuente del porqué):** `DESIGN.md` §3 (2b: "Formalizar la API" = OpenAPI + cliente tipado + `/api/v1` aditivo, el backend NO se reescribe), §4.5 (decisión estructural), §5 (backend/API `/api/*` intacto), §6 R2 (integración de ramas). **Trazas:** contrato estable y suficiente (supuesto §6); API formalizada = lo que consumirán los clientes nativos futuros (§2, §3 FUERA).
**Es el 2.º de 6 SPEC de 2b** (01 cimiento ✓ · **02 API tipada** · 03 auth/login · 04 captura+salvaguardas · 05 resto flujo · 06 marco).

**Decisiones estructurales confirmadas en mesa común (20-jul):**
- **OpenAPI spec-first, escrito a mano** como fotografía fiel del contrato actual; los tipos TS se generan de él. El backend **no se anota ni se toca** salvo el alias `/api/v1`. (Alternativa code-first anotando rutas: descartada — tocaría las 8 rutas que el ciclo manda PRESERVAR y acerca el trabajo a una reescritura, contra el DESIGN.)
- **Cliente tipado = `openapi-typescript` (tipos) + `openapi-fetch` (wrapper fetch tipado).** Ligero, sin codegen de métodos, middleware para el token. (Alternativa orval/openapi-generator: descartada por sobredimensionada.)

> **ADDENDUM 2026-07-20 — `openapi-typescript` vía `npx`, no como devDep (desviación de tooling, NO estructural).** Al implementar, `openapi-typescript@7.13.0` declara peer `typescript@^5` y el proyecto va con **TS 6** (stack moderno del ADDENDUM de SPEC-01) → `npm i -D` da `ERESOLVE`. Como el generador es una **CLI de codegen que solo se ejecuta a mano** (`npm run gen:api`), **nunca** en el build ni en el CI (el `schema.d.ts` se versiona), se resuelve **sin** meterlo en el árbol de deps: el script usa `npx --yes openapi-typescript@7.13.0 …` (versión fijada). Ventaja: `npm ci`/build/CI quedan intactos (R5 a salvo) y sin conflicto de peer. Verificado: genera correctamente con TS 6 (exit 0) e idempotente. Esto **sustituye** el "añadir openapi-typescript como devDep" de §2/§3.2; `openapi-fetch` **sí** es dependencia runtime normal (sin conflicto).

---

## 1. Resumen
Formalizar el contrato HTTP existente **sin reescribir el backend**: (a) un documento **OpenAPI 3.1 escrito a mano** (`openapi/speech-to-prompt.yaml`) que describe fielmente las operaciones `/api/*` de hoy; (b) un **alias de versión `/api/v1`** en el backend, **aditivo puro** (remonta los routers existentes; `/api/*` sigue igual); (c) un **cliente HTTP tipado** en `web/` generado del OpenAPI (`openapi-typescript` + `openapi-fetch`) con una costura de inyección de token (no-op hoy, MSAL en SPEC-03), consumiendo `/api/v1`. El placeholder de Captura pasa a usar el cliente tipado como prueba del lazo front→API.

## 2. Stack y arquitectura

**Contexto (código existente que se respeta):** backend Node/Express en la raíz, rutas montadas en `server.js` (ver §4.0). Frontend nuevo en `web/` (React 19 + Vite 8 + TS 6 + Tailwind v4 + shadcn, SPEC-01). El cliente HTTP viejo `public/js/api-client.js` es el contrato de facto que el cliente tipado espeja.

**Decisiones técnicas:**
- **OpenAPI 3.1** (superset de JSON Schema; encaja con `openapi-typescript`). Un único fichero YAML, fuente de verdad del contrato, **neutral de lenguaje** (lo consumirán también los clientes nativos futuros) → vive en **`openapi/` en la raíz**, no dentro de `web/`.
- **`servers: [{ url: /api/v1 }]`** en el OpenAPI: el contrato versionado es lo que documenta. Las rutas del YAML se escriben **sin** el prefijo (`/sessions`, `/health/db`, …); el prefijo lo aporta `servers` + el `baseUrl` del cliente.
- **Versionado por alias aditivo:** en `server.js` se remontan los **mismos** routers e idéntico middleware `identity` bajo el prefijo `/api/v1`, **además** de los `/api/*` actuales. No se duplica lógica; son las mismas instancias de router. `/api/*` queda **byte-idéntico** en comportamiento (lo sigue usando el frontend viejo).
- **`openapi-typescript`** (devDep) genera `web/src/api/schema.d.ts` (solo tipos, `import type`). El fichero generado **se versiona** (el build y el CI no regeneran; regen manual con el script cuando cambie el YAML).
- **`openapi-fetch`** (dep) da un `createClient<paths>({ baseUrl: '/api/v1' })` tipado. Se envuelve en `web/src/api/client.ts` con:
  - **Middleware `onRequest`** que añade `Authorization: Bearer <token>` si hay token. Hoy el proveedor de token es **no-op** (`() => null` — dev bypass, sin login); en SPEC-03 se sustituye por el token de MSAL. Es el único punto de acoplamiento a auth.
  - **Manejo de error uniforme**: helper que, ante `!response.ok`, lanza con `error.message` del envelope `{error:{code,message}}` (paridad con el cliente viejo). El 401-retry/redirect interactivo **no** se implementa aquí (llega con MSAL en SPEC-03); hoy, en dev bypass, no aplica.
  - **Fachada tipada fina** `api` (objeto con métodos `createSession`, `listSessions`, `getSession`, `updateSession`, `getSessionUsage`, `addSegment`, `reprocess`, `distill`, `getConfig`, `updateConfig`, `getPrompts`, `postDiagnostics`, `warmup`, `getAuthConfig`, `healthDb`) que espeja el `api` de `public/js/api-client.js`, para ergonomía de las pantallas de SPEC-04/05/06. Cada método delega en `client.GET/POST/PUT` con paths tipados.
- **En dev:** el proxy de Vite (`server.proxy['/api']`, SPEC-01 `vite.config.ts`) ya cubre `/api/v1` (mismo prefijo `/api`). No hay cambio de proxy.

**Cómo encaja en lo existente:** el YAML documenta lo que ya hay; el alias `/api/v1` es una línea por router en `server.js`; el cliente vive solo en `web/`. Nada del comportamiento de negocio cambia.

## 3. Estructura / Delta

### 3.1 ADDED
```
openapi/
  speech-to-prompt.yaml     # OpenAPI 3.1, contrato fiel de /api/* (servers: /api/v1)
web/src/api/
  schema.d.ts               # tipos generados por openapi-typescript (versionado)
  client.ts                 # createClient<paths> baseUrl /api/v1 + middleware token + fachada `api`
web/src/api/                # (opcional) auth.ts — proveedor de token no-op; se rellena en SPEC-03
```

### 3.2 MODIFIED
- **`server.js`** — tras los montajes `/api/*` actuales y **antes** del bloque `/app` y del catch-all, añadir el espejo `/api/v1` remontando los mismos routers con el mismo orden de `identity`:
  ```js
  // Alias de versión /api/v1 — espejo ADITIVO del contrato actual (SPEC-02).
  // Mismos routers e idéntico gating; /api/* queda intacto para el frontend viejo.
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth-config', authConfigRouter);
  app.use('/api/v1/config', identity);
  app.use('/api/v1/config', configRouter);
  app.use('/api/v1/sessions', identity);
  app.use('/api/v1/sessions', sessionsRouter);
  app.use('/api/v1/sessions', transcribeRouter);
  app.use('/api/v1/sessions', distillRouter);
  app.use('/api/v1/prompts', identity);
  app.use('/api/v1/prompts', promptsRouter);
  app.use('/api/v1/diagnostics', identity);
  app.use('/api/v1/diagnostics', diagnosticsRouter);
  ```
- **`web/package.json`** — `dependencies += openapi-fetch`; `devDependencies += openapi-typescript`; `scripts += "gen:api": "openapi-typescript ../openapi/speech-to-prompt.yaml -o src/api/schema.d.ts"`.
- **`web/src/routes/Capture.tsx`** — sustituir el `fetch('/api/health/db')` crudo por `api.healthDb()` del cliente tipado (misma semántica de `checking|ok|fail`; verificación del lazo).

### 3.3 REMOVED
- Nada. `public/js/api-client.js` se conserva (lo usa el frontend viejo en `/`, que sigue vivo hasta el cutover).

## 4. Interfaces y contratos

### 4.0 Montaje actual (referencia, NO se modifica lo `/api/*`)
`server.js` (SPEC-01) monta, en este orden: `/api/health`(sin identity) · `/api/auth-config`(sin identity) · `/api/config`(identity) · `/api/sessions`(identity; sessions+transcribe+distill) · `/api/prompts`(identity) · `/api/diagnostics`(identity). El espejo `/api/v1` (§3.2) replica exactamente ese orden.

### 4.1 Operaciones del contrato (fiel al backend de hoy)
Envelope de error **uniforme** en todo fallo con cuerpo JSON: `{ "error": { "code": string, "message": string } }`.

**Públicas (sin auth):**
| Método | Ruta (bajo `/api/v1`) | Éxito | Errores |
|---|---|---|---|
| GET | `/health/db` | 200 `{ok:true}` | 503 `{ok:false, error}` |
| GET | `/auth-config` | 200 `AuthConfig` (`oneOf`: `{devBypass:true}` \| `{clientId,authority,apiScope}`) | — |

**Protegidas (`bearerAuth`; 401 `UNAUTHENTICATED`/`TOKEN_INVALID`, 403 `NOT_ALLOWLISTED`, 500 `IDENTITY_FAILED`):**
| Método | Ruta | Body | Éxito | Errores propios |
|---|---|---|---|---|
| GET | `/config` | — | 200 `ConfigResponse` | 500 `CONFIG_READ_ERROR` |
| PUT | `/config` | `{api_keys?, defaults?}` | 200 `{config: Config}` (enmascarada) | 500 `CONFIG_WRITE_ERROR` |
| POST | `/sessions` | — | 201 `Session` | 500 `SESSION_CREATE_ERROR` |
| GET | `/sessions` | — | 200 `SessionListItem[]` | 500 `SESSION_LIST_ERROR` |
| GET | `/sessions/{id}` | — | 200 `Session` | 404 `SESSION_NOT_FOUND`, 500 `SESSION_READ_ERROR` |
| PUT | `/sessions/{id}` | `SessionUpdate` (columnas escalares) | 200 `Session` | 404, 500 `SESSION_UPDATE_ERROR` |
| GET | `/sessions/{id}/usage` | — | 200 `Usage` | 404, 500 `USAGE_READ_ERROR` |
| POST | `/sessions/{id}/segments` | multipart `audio`(binary)+`source`(recorded\|imported) | 200 `AddSegmentResult` | 400 `MISSING_AUDIO`/`MISSING_API_KEY`, 404, 500 `STT_FAILED` |
| POST | `/sessions/{id}/transcribe` | ídem (alias histórico de `/segments`) | ídem | ídem |
| GET | `/sessions/{id}/audio/{ordinal}` | — | 200 `audio/webm` (binary stream) | 404 `SESSION_NOT_FOUND`/`AUDIO_NOT_FOUND`, 500 `AUDIO_FAILED` |
| POST | `/sessions/{id}/reprocess` | — | 200 `ReprocessResult` | 400 `MISSING_API_KEY`/`NO_AUDIO`, 404, 500 `STT_FAILED` |
| POST | `/sessions/{id}/distill` | `{mode?, systemPrompt?}` | 200 `DistillResult` | 400 `NO_TRANSCRIPTION`/`MODEL_DISABLED`/`MISSING_API_KEY`, 404, 500 `LLM_FAILED` |
| GET | `/prompts` | — | 200 `FamilyPrompts` (`{[mode]: string}`) | 500 `PROMPTS_READ_ERROR` |
| POST | `/diagnostics` | `{events: DiagnosticEvent[]}` | 200 `{inserted: int}` | 400 `BAD_REQUEST`, 413 `TOO_LARGE`, 500 `DIAG_FAILED` |

Notas de fidelidad:
- `id` de sesión es **entero**; en la ruta se acepta como string y el backend lo castea (no-entero → 404 vía `getSession`).
- `ordinal` es **1-based**.
- `distill.mode` ∈ `{completo,ligero,literal,limpio}`; ausente/desconocido → el backend resuelve a `completo` (documentar el enum + que es opcional).
- `PUT /config` devuelve `{config}` (solo la config enmascarada), **no** el `ConfigResponse` completo del GET.
- Cabecera `Authorization: Bearer` es **opcional** en el YAML a efectos de que en **local (dev bypass)** las protegidas responden sin token; en Azure el backend exige el token. Se modela con `security: [{bearerAuth: []}]` a nivel de operación y se documenta el bypass local en la `description`.

### 4.2 Schemas (`components/schemas`) — fieles a `assembleSession`/stores
- **`Segment`**: `audio_file:string|null, transcription_raw:string|null, transcription_edited:string|null, duration_seconds:integer|null, source:enum(recorded,imported), created_at:string|null`.
- **`Session`**: `id:integer, timestamp:string|null, segments:Segment[], transcription_raw:string|null, transcription_edited:string|null, prompt_distilled:string|null, distill_mode:string|null, distill_prompt_used:string|null, llm_provider:string|null, llm_model:string|null, stt_provider:string|null, stt_model:string|null, audio_file:string|null` (espejo legacy del 1.er segmento). Todos los escalares **nullable**.
- **`SessionListItem`**: `id:integer, timestamp:string|null, preview:string|null (≤100 chars), has_prompt:boolean, has_transcription:boolean, has_audio:boolean, segment_count:integer`.
- **`SessionUpdate`** (body de PUT): objeto con subconjunto de columnas escalares en lista blanca (`transcription_raw, transcription_edited, prompt_distilled, distill_mode, distill_prompt_used, llm_provider, llm_model, stt_provider, stt_model`); todas opcionales; claves fuera de la lista se ignoran en el backend.
- **`UsageEvent`**: `id:integer, kind:enum(stt,llm), provider:string, model:string, input_tokens:integer|null, output_tokens:integer|null, audio_seconds:integer|null, created_at:string`.
- **`Cost`**: `currency:string(USD), stt:number, llm:number, total:number, unpriced:integer`.
- **`Usage`**: `{events: UsageEvent[], cost: Cost}`.
- **`Config`**: `{api_keys: {[provider]: string}, defaults: {llm_provider,llm_model,stt_provider,stt_model}}` (claves de proveedor conocidas: `anthropic,groq,google,azure-whisper,azure-openai`; se modela con `additionalProperties: string` + propiedades documentadas). Las api_keys van **enmascaradas** en las respuestas.
- **`ConfigResponse`**: `{config: Config, llmProviders: string[], sttProviders: string[], configured: boolean}`.
- **`AddSegmentResult`**: `{segment: Segment, transcription_raw: string, session: Session}`.
- **`ReprocessResult`**: `{transcription_raw: string, session: Session}`.
- **`DistillResult`**: `{prompt_distilled: string, usage: LlmUsage|null, truncated: boolean, session: Session}` con `LlmUsage: {input_tokens?:integer, output_tokens?:integer}` (forma dependiente del proveedor → propiedades opcionales).
- **`FamilyPrompts`**: objeto `{[mode]: string}` (`additionalProperties: string`; claves = modos de la familia activa).
- **`DiagnosticEvent`** (input): `{captureRunId:string (req), type:string (req), seq?:integer, payload?:object, clientTs?:number|string, sessionId?:integer}`. El backend descarta los que no traen `type`+`captureRunId`.
- **`AuthConfig`**: `oneOf: [{devBypass:const(true)}, {clientId:string|null, authority:string, apiScope:string|null}]`.
- **`Error`**: `{error: {code:string, message:string}}` — respuesta reutilizable para 4xx/5xx.
- **`securitySchemes.bearerAuth`**: `type:http, scheme:bearer, bearerFormat:JWT`.

### 4.3 Contrato del cliente tipado (`web/src/api/client.ts`)
```ts
import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

// Proveedor de token — no-op en SPEC-02 (dev bypass, sin login). SPEC-03 lo cablea a MSAL.
let tokenProvider: () => string | null | Promise<string | null> = () => null
export function setTokenProvider(fn: typeof tokenProvider) { tokenProvider = fn }

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = await tokenProvider()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}

export const client = createClient<paths>({ baseUrl: '/api/v1' })
client.use(authMiddleware)

// Fachada fina y tipada, espejo de public/js/api-client.js (ergonomía para las pantallas).
export const api = {
  healthDb: () => client.GET('/health/db'),
  getAuthConfig: () => client.GET('/auth-config'),
  getConfig: () => client.GET('/config'),
  updateConfig: (body) => client.PUT('/config', { body }),
  createSession: () => client.POST('/sessions'),
  listSessions: () => client.GET('/sessions'),
  getSession: (id) => client.GET('/sessions/{id}', { params: { path: { id } } }),
  updateSession: (id, body) => client.PUT('/sessions/{id}', { params: { path: { id } }, body }),
  getSessionUsage: (id) => client.GET('/sessions/{id}/usage', { params: { path: { id } } }),
  reprocess: (id) => client.POST('/sessions/{id}/reprocess', { params: { path: { id } } }),
  distill: (id, body) => client.POST('/sessions/{id}/distill', { params: { path: { id } }, body }),
  getPrompts: () => client.GET('/prompts'),
  postDiagnostics: (events) => client.POST('/diagnostics', { body: { events } }),
  // addSegment (multipart) y warmup se detallan al implementar (openapi-fetch soporta bodySerializer para FormData).
}
```
> `addSegment` usa `multipart/form-data`; con openapi-fetch se pasa `body` como `FormData` + `bodySerializer: (b) => b` (el navegador fija el `Content-Type` con boundary), igual que el cliente viejo. `warmup` = `healthDb().catch(()=>{})` fire-and-forget. Firmas exactas al implementar; el contrato de tipos lo fija `schema.d.ts`.

### 4.4 Regeneración de tipos
`cd web && npm run gen:api` regenera `src/api/schema.d.ts` desde `../openapi/speech-to-prompt.yaml`. Se ejecuta **a mano** cuando cambia el YAML; el resultado se commitea. El build (`tsc -b && vite build`) **no** invoca `gen:api` (evita acoplar el build a tener el YAML resoluble y mantiene el CI de SPEC-01 sin cambios).

## 5. Qué se PRESERVA (regresión)
- **Contrato `/api/*` (sin versión):** las 16 operaciones responden **byte-idéntico** que antes. El alias `/api/v1` es **aditivo**; no altera orden de montaje, gating de `identity`, ni cuerpos. El frontend viejo (`public/`, cliente `public/js/api-client.js`) sigue funcionando en `/` sin cambios.
- **Backend y lógica de negocio:** ningún router, servicio, store ni prompt se modifica. `server.js` solo **añade** los montajes `/api/v1` (y nada antes del bloque existente cambia de orden).
- **Aislamiento por propietario e identidad:** `/api/v1/*` pasa por el **mismo** middleware `identity` con el mismo orden; el aislamiento `owner_id`/`callerId` es intacto (misma capa de datos).
- **SPEC-01 (`web/` cimiento):** shell, stepper, navegación, tema, i18n, PWA y el servido en `/app` no cambian. El único delta en `web/` es añadir `src/api/*`, las deps del cliente y migrar la llamada de `Capture.tsx`.
- **Deploy/CI:** el workflow de Azure (build de `web/` + deploy) no cambia; `gen:api` no entra en el build. `npm test` (raíz) intacto.

## 6. Migración de datos
No aplica (sin cambios de esquema ni de datos).

## 7. Fuera de alcance
- **Login MSAL real** (SPEC-03): el `tokenProvider` queda no-op; el 401-retry/redirect interactivo del cliente viejo **no** se porta aún.
- **Servir el OpenAPI por HTTP** o Swagger UI (`GET /api/openapi.json`, `/docs`): no se añade ruta backend; el YAML en repo es el artefacto. (Posible nicety futura.)
- **Reescribir o anotar el backend**; cambiar el contrato de sesión o el flujo de datos.
- **Portar el flujo real** (captura/salvaguardas 04, resto 05, marco 06) a usar el cliente: aquí solo se migra el placeholder de Captura como verificación.
- **Retirar `public/js/api-client.js`** o el `/api/*` sin versión (será parte del cutover final).
- Contract testing exhaustivo/property-based; se hace solo el smoke ligero de §8.

## 8. Verificación (extremo a extremo)

**OpenAPI válido:**
1. El YAML valida como OpenAPI 3.1 (lint con `openapi-typescript` al generar sin error, o `redocly lint`/`swagger-cli validate` si está disponible). `npm run gen:api` produce `schema.d.ts` sin errores.
2. Revisión de fidelidad (checklist manual, autocontenida): cada operación de la tabla §4.1 existe en el YAML con su método, códigos de estado y schema de respuesta; los enums (`source`, `mode`, `kind`) y la nulabilidad de §4.2 coinciden con `assembleSession`/stores.

**Backend `/api/v1` (alias aditivo):**
3. Con el server arrancado, para una operación pública: `GET /api/v1/health/db` responde **igual** que `GET /api/health/db` (200 `{ok:true}` con BD viva; 503 si no). `GET /api/v1/auth-config` == `GET /api/auth-config`.
4. Para una protegida sin token en Azure-like (o con token basura): `/api/v1/sessions` devuelve el **mismo** 401 `UNAUTHENTICATED`/`TOKEN_INVALID` que `/api/sessions`. En local (dev bypass) ambas responden 200 con el usuario dev.
5. **Regresión:** `GET /api/sessions` (sin `/v1`) y el resto de `/api/*` responden idénticos a antes del cambio; `/` sigue sirviendo el frontend viejo; `GET /app` el nuevo (guarda `existsSync` de SPEC-01 intacta).

**Cliente tipado (`web/`):**
6. `cd web && npm run build` (tsc + vite) y `npm run lint` (oxlint) **verdes**; los tipos de `client.ts`/`api` compilan contra `schema.d.ts` (p. ej. `api.getSession(1)` tipa el `data` como `Session`).
7. **Lazo e2e:** `Capture.tsx` usa `api.healthDb()`; en el navegador (dev con proxy, o `/app` servido) muestra "● Backend conectado" cuando `/api/v1/health/db` responde 200 (mismo resultado visible que con el `fetch` crudo de SPEC-01, ahora vía cliente tipado y `/api/v1`).

**Regresión backend (obligatoria, reutilizable):**
8. `npm test` (raíz) sigue **verde** (no se toca backend testeado).
9. El orden de middlewares en `server.js` no cambia para `/api/*`; el bloque `/app` y el catch-all `app.get('*')` siguen **después** de todos los montajes de API (los nuevos `/api/v1` se insertan junto a los `/api/*`, antes de `/app`).

**Nota sobre entorno:** el usuario no desarrolla en local esta sesión (BD local sin migración `006`). Las comprobaciones 3-5 y 7 que requieran datos de sesión pueden hacerse contra Azure (prod, tras deploy en rama o en el merge) o diferirse; las 1-2, 6, 8 son locales y no requieren BD. El **smoke de contrato** mínimo = 3 (health) + 4 (401) no requiere la migración `006`.

**Rollback:** revertir el commit del bloque `/api/v1` en `server.js` retira el alias sin afectar `/api/*`; el cliente tipado vive solo en `web/` y no lo consume nadie más que el placeholder migrado.
