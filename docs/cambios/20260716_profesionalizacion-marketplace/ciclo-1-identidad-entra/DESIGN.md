# DESIGN — Ciclo 1 `identidad-entra`

**Programa:** `profesionalizacion-marketplace` (ver `../DESIGN.md`, §3 troceo ciclo 1, §5 decisión estructural 4)
**Fecha:** 17-jul-2026 · **Fase JCC:** análisis (este documento la cierra)
**Tipo:** cambio sobre código existente (no producto nuevo).

## 1. Objetivo y problema

**Objetivo:** sustituir la identidad actual —Easy Auth contra el tenant Entra de Xenix— por un **login OIDC propio de la aplicación, basado en token**, que acepte **cualquier cuenta Microsoft (Entra multi-tenant + cuentas personales MSA)**, conservando intactos `owner_id` y el aislamiento por propietario que ya vive en la capa de datos.

**Problema:** la identidad de hoy bloquea el producto comercial en tres frentes:
1. **Tenant-locked:** solo entra gente del tenant de Xenix; ningún cliente externo puede autenticarse.
2. **Cookie-based y a nivel plataforma:** Easy Auth gatea todo el sitio con cookies, modelo que no sirve para la **API desacoplada + apps móviles nativas** (necesitan *bearer tokens*) ni para una landing pública (ciclo 3).
3. **La app no controla su auth:** toda la autenticación la hace la plataforma; la app solo confía en cabeceras. No hay dónde enganchar onboarding, otros proveedores (Google, futuro) ni el token de compra del Marketplace.

## 2. Usuarios y casos de uso

- **Profesional individual** con cuenta Microsoft (trabajo **o** personal) inicia sesión en la app y obtiene su espacio aislado.
- **Usuario existente** (Jesús; y Agustín si aplica): tras la migración, sigue viendo **sus sesiones e histórico** al entrar por el flujo nuevo.
- **Caso interino (hasta ciclo 3):** solo los correos en **lista blanca** pueden usar la app; el resto se autentica pero recibe 403.
- **Fuera (ciclos posteriores):** alta desde el flujo de compra del Marketplace (ciclo 3), Google/email (futuro), cuentas de organización/empresa (futuro).

## 3. Alcance

**En alcance:**
- Reemplazar Easy Auth por **auth OIDC propio** en la app: inicio de sesión, cierre de sesión, y **validación server-side del token** emitido por la plataforma de identidad de Microsoft.
- **Identidad multi-tenant Entra + MSA.**
- **Modelo token-based** como cimiento común para web + móvil + landing (los clientes obtienen el token; el backend lo valida como *bearer*).
- **Modelo de datos de identidad** (ver §4): `external_id = tid.oid`, nueva columna `tenant_id`, `email` deja de ser único, `ensureUser` casa solo por `external_id`.
- **Migración puntual** de los usuarios reales existentes al nuevo `external_id`.
- **Lista blanca de correos** permitidos (interina), comprobada tras validar el token → 403 si no está.
- **Puerta a nivel de app** que sustituye el gate de plataforma de Easy Auth: decidir qué queda público (p. ej. `/api/health`, el shell mínimo para pintar el login) y qué protegido.
- **Login UI mínima** en el frontend (hoy no existe ninguna).
- Mantener el **bypass `DEV_USER_*`** en local.

**Fuera de alcance:**
- Verja de **suscripción** y gating por plan (ciclo 3).
- **Landing del Marketplace** y token de compra (ciclo 3).
- **Google/email** u otros proveedores (futuro).
- **Organizaciones/empresa** y compra corporativa (futuro; pero `tenant_id` se captura ya para no repintar).
- **Compartir sesiones** (`session_shares` sigue siendo solo esquema).
- **Rediseño visual** del login (lo absorbe el ciclo 2; aquí, login funcional mínimo).
- Políticas avanzadas (MFA, conditional access, rotación/refresh sofisticada) más allá de lo estándar de la plataforma.

## 4. Decisiones acordadas ([E] = estructural, decidida en mesa común)

1. **[E] Auth OIDC propio, token-based** (no Easy Auth, no cookies de plataforma). Motivo: es cimiento de la app; seguridad y API/móvil primero. Coste mayor ahora a cambio de base correcta.
2. **[E] Identidad multi-tenant Entra + cuentas personales MSA.**
3. **[E] Clave canónica `external_id = tid.oid`** (tupla tenant + object-id; identificador estable/único/inmutable documentado por Microsoft para apps multi-tenant). Descartados: `oid` a secas (pierde tenant, colisiona), `email`/UPN (reasignable → riesgo de seguridad), `sub` (pairwise por app → distinto entre registro web y móvil, rompería la cuenta compartida). `tid.oid` es uniforme para cuentas de trabajo y MSA.
4. **[E] Cambios de esquema `users`:** (a) nueva columna `tenant_id` (captura del `tid`); (b) **`email` deja de ser único** — se elimina `UQ_users_email`, pasa a atributo mutable; (c) `ensureUser` casa **solo** por `external_id` y se elimina la reconciliación por email (parche del bootstrap dev; agujero en multi-tenant).
5. **[E] Migración puntual determinista** de las 1-2 filas de usuarios reales al nuevo `external_id` (conocemos `tid` de Xenix + `oid`). Sin reconciliar por email. **Verificar el `external_id` real que produce el login nuevo antes de reescribir** (ver R3).
6. **Lista blanca de correos** permitidos (interina; se retira al llegar el gate de suscripción en ciclo 3); 403 si no está.
7. **(reversible, decisión local)** Se mantiene el bypass `DEV_USER_*` en local, sin tokens reales.
8. **Se conserva `owner_id`, `callerId` y el aislamiento** en la capa de datos — no se tocan.

## 5. Qué se PRESERVA (superficie de regresión)

- **Aislamiento por propietario:** `owner_id`, `callerId` y los filtros en `session-store.js`, `usage-store.js`, `diagnostics-store.js` — intactos.
- **Contrato `req.user.id`:** lo consumen todas las rutas (`sessions`, `transcribe`, `distill`, `diagnostics`). Cambia **cómo** se resuelve el principal, no el contrato que ven las rutas.
- **JIT `ensureUser`:** sigue devolviendo `users.id`; cambia la **clave de matching** (external_id) y desaparece el matching por email.
- **Sesiones e histórico existentes:** preservados vía la migración de `external_id` (decisión 5).
- **Endpoints sin `identity` hoy** (`/api/health`, `/api/config`): protegidos actualmente por el gate de plataforma de Easy Auth; al quitarlo hay que **re-decidir explícitamente** su exposición.
- **Frontend:** hoy asume "si la SPA carga, estás autenticado"; deja de ser cierto → necesita pantalla/estado de login.

## 6. Supuestos, riesgos y preguntas abiertas

**Supuestos:**
- S1: se puede crear/configurar el registro de app Entra **multi-tenant + MSA** con la cuenta de Xenix. (Verificar en spec/impl.)
- S2: los tokens de Microsoft se validan server-side (claves públicas + issuer multi-tenant) sin depender de la plataforma.

**Riesgos:**
- **R1 (seguridad):** pasamos el gate de una capa muy probada (Easy Auth) a código propio; un fallo en la validación del token = exposición. Mitigación: validación JWT rigurosa (firma, issuer, audience, expiración) + lista blanca interina + revisión adversarial en la fase de review.
- **R2 (consentimiento):** algunos tenants exigen *admin consent*. Para sign-in + perfil básico suele bastar el consentimiento de usuario; verificar.
- **R3 (migración):** si el `tid.oid` que asumimos no coincide exactamente con el que emite el login nuevo, orfandad de sesiones. Mitigación: **loguear y comparar** el `external_id` real del primer login antes de reescribir las filas.
- **R4 (hueco de gating):** entre este ciclo y el ciclo 3 cualquiera podría autenticarse; mitigado por la lista blanca.
- **R5 (dos clientes):** web y móvil serán registros de app distintos → la validación debe aceptar ambos *audiences*, y `external_id` (`tid.oid`) debe ser idéntico entre ellos (lo es; por eso se descartó `sub`).

**Preguntas abiertas (se acotan en `/jcc-spec`):**
1. Qué queda exactamente **público** sin auth (health sí; ¿`/api/config`?; el shell mínimo para poder pintar el login).
2. Estrategia de **logout** y de expiración/renovación de sesión de cara a UX.
3. Normalización de la **lista blanca** (case-insensitive, dominios).

---

## ADDENDUM 17-jul-2026 — hallazgos de la review adversarial (Fase 4) y resolución

Revisión independiente del commit `f4ea1a6`. Veredicto: cumple lo sustancial y no rompe regresión; validación del token sin bypass. Hallazgos y resolución (bucle 3↔4):

- **H1 (MEDIA, defecto de código):** `/api/prompts` quedó sin `identity` → tras retirar Easy Auth quedaría abierto. **CORREGIDO** (`server.js` monta `identity` en `/api/prompts`; SPEC §3 enmendado; test de arranque cubre `GET /api/prompts` sin token → 401).
- **H2 (MEDIA, config):** la validación exige issuer **v2.0**; los access tokens de una API propia son v1.0 salvo `requestedAccessTokenVersion:2`. **Resuelto por documentación:** requisito anotado en `token-verify.js`, SPEC §4 y la guía del registro de app Entra (no es agujero: falla cerrado).
- **H3 (MEDIA, plan de cutover):** el orden literal del backfill podía orfanar el histórico por colisión con `UX_users_external_id`. **CORREGIDO en SPEC §6:** backfill **antes** del primer login del flujo nuevo; verificación R3 con cuenta de prueba distinta.
- **H4 (BAJA, hardening):** no se comprobaba el scope. **AÑADIDO** `assertScope` (`scp` debe contener `access_as_user`; desactivable por env) + test.
- **H5 (BAJA, cosmético):** el MSAL vendorizado es `.min.js` UMD, no `.esm.js`. **SPEC §3 enmendado** al nombre real.
- **H6 (BAJA, latente → ciclo 3):** `users.email` sigue `NOT NULL`; muerde al retirar la lista blanca (ciclo `marketplace-transactable`) si un token no trae email. **Anotado como trabajo del ciclo 3** (no se toca aquí).
- **H7 (BAJA, frontend interino):** el login rompe si el `<script>` de MSAL no carga. **Aceptado**: el ciclo 2 rehace el frontend.

Verificación tras el fix: `npm test` **14/14** (se añadieron 2 tests de `assertScope`); arranque local+Azure-sim **12/12** (incluye `/api/prompts`→401). Re-review: pendiente de confirmar veredicto limpio.
