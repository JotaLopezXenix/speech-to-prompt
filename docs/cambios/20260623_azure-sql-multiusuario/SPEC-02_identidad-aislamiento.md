# Flujo 2 — Identidad real + aislamiento por usuario — SPEC técnico

**Fecha:** 2026-06-23
**Tipo:** delta-spec de implementación del flujo 2 del cambio.
**Depende de:** [`DESIGN.md`](DESIGN.md) (D4, D5, D6) y [`SPEC-01`](SPEC-01_capa-datos-sql.md) (los ganchos `callerId` ya están puestos e inertes).

> **Trazabilidad.** Concreta el **flujo 2** de `DESIGN.md §9`. Activa el aislamiento por propietario y la provisión de usuarios; **no** implementa compartir (D6: solo esquema) ni gestión de roles/UI de admin (fuera de alcance).

---

## 1. Objetivo

Que la aplicación **sepa quién entra** y **cada usuario vea/opere solo sus sesiones**. Para ello: leer el principal autenticado (Easy Auth en Azure; simulado en local), **provisionarlo en `users` (JIT)** en cada petición, y **activar los ganchos `callerId`** que el flujo 1 dejó inertes. Al terminar, el aislamiento se fuerza **en la capa de datos** (no solo en la UI), según D5.

---

## 2. Punto de partida

- Easy Auth (Entra) ya protege la app a nivel de plataforma (login obligatorio, asignación restringida a Jesús + Agustín), pero el código **aún no lee** la identidad.
- `session-store` ya acepta `callerId`/`ownerId` (inerte). El **usuario bootstrap** del flujo 1 (`resolveBootstrapOwnerId`) se **retira** en este flujo.
- El front **no necesita cambios** para identidad: en Azure la cookie de Easy Auth viaja sola en cada `fetch`; en local, el middleware inyecta un usuario de desarrollo.

---

## 3. De dónde sale la identidad

- **Azure (Easy Auth)** inyecta cabeceras en cada petición ya autenticada:
  - `X-MS-CLIENT-PRINCIPAL-ID` → **oid estable** de Entra → `users.external_id`.
  - `X-MS-CLIENT-PRINCIPAL-NAME` → email/UPN → `users.email`.
  - `X-MS-CLIENT-PRINCIPAL` → base64 del JSON de claims (de ahí el display name si hiciera falta).
- **Local (sin Easy Auth):** fallback por entorno. Orden de resolución del middleware:
  1. Si llegan las cabeceras `X-MS-CLIENT-PRINCIPAL-*` → usarlas. (Vale en Azure **y** permite **simular usuarios distintos en local** enviándolas a mano para probar el aislamiento.)
  2. Si no, y **no** estamos en Azure → **usuario dev de entorno**: `DEV_USER_OID`, `DEV_USER_EMAIL`, `DEV_USER_NAME` (con defaults; `DEV_USER_EMAIL` por defecto = `dev@speech-to-prompt.local`, el mismo del bootstrap, para seguir viendo las sesiones de prueba en local).
  3. Si estamos en Azure y faltan las cabeceras (no debería pasar con "require auth") → **401**. Defensa en profundidad.

---

## 4. Middleware `src/middleware/identity.js` (nuevo)

- Resuelve `{ oid, email, name }` según §3.
- **JIT provisioning** (`ensureUser`): upsert en `users` por `external_id = oid`:
  - existe → `UPDATE last_login_at` (+ email/display_name si cambiaron); devuelve `users.id`.
  - no existe pero hay fila con ese **email** (p. ej. una sembrada con `external_id NULL`) → `UPDATE` esa fila fijando `external_id = oid` (reconciliación); devuelve su `id`.
  - no existe → `INSERT (external_id, email, display_name)`; devuelve el `id`.
- Deja `req.user = { id, oid, email, name }`.
- **Montaje:** solo en el grupo `/api/sessions` (cubre sesiones + `segments`/`reprocess` + `distill`). `/api/config` y `/api/prompts` son globales y **no** se filtran por usuario, así que no lo necesitan.

> El `email` es `NOT NULL` en el esquema. Si un principal no expone email, usar el UPN/`name` como email; en dev lo da el entorno.

---

## 5. Activar el aislamiento (capa de datos)

Las rutas resuelven `req.user.id` y lo pasan como `callerId`. La **propiedad se comprueba en `session-store`** (D5), no solo en la ruta:

| Función | Cambio |
|---|---|
| `createSession(ownerId)` | `ownerId = req.user.id` (se retira el bootstrap). |
| `getSession(id, callerId)` | `WHERE id=@id AND owner_id=@caller` → `null` si no es suya (la ruta responde **404**, sin revelar existencia). |
| `listSessions(callerId)` | `WHERE owner_id=@caller`. |
| `updateSession(id, partial, callerId)` | `UPDATE … WHERE id=@id AND owner_id=@caller`; 0 filas → `null`. |
| `addSegment(id, segment, callerId)` | el chequeo de existencia inicial pasa a `WHERE id=@id AND owner_id=@caller`. |
| `replaceSegments(id, segments, callerId)` | idem. |

Las rutas `transcribe`/`distill` ya hacen `getSession(id, callerId)` al inicio (→ 404 si no es suya); añadir `callerId` también a las mutaciones cierra el hueco TOCTOU y cumple "forzado en la capa de datos".

**Ownership mismatch → 404** (no 403): no se revela que la sesión de otro existe. Decisión reversible.

---

## 6. Qué se PRESERVA / qué cambia

**Preservado:** forma del objeto sesión; las 4 fases del front y el contrato de `api-client` (el front no envía identidad: la aporta Easy Auth/cookie en Azure y el middleware en local); puerta Easy Auth.

**Cambia:** nuevo `src/middleware/identity.js`; `session-store` retira el bootstrap y sus funciones de mutación/lectura ganan `callerId` **efectivo** (con `owner_id` en el `WHERE`); las 3 rutas de `/api/sessions` pasan `req.user.id`; `.env` gana `DEV_USER_*`. Sin nueva dependencia.

> **UI de usuario (fuera de alcance, fácil después):** mostrar "conectado como X" y un enlace de logout (`/.auth/logout`) es trivial pero no entra en este flujo.

---

## 7. Verificación (criterios de aceptación)

- **Aislamiento (lo central):** con el usuario A se crean sesiones; al cambiar a usuario B (cambiando `DEV_USER_*` o enviando cabeceras `X-MS-CLIENT-PRINCIPAL-*`), B **no ve** ninguna de A en `listSessions`, y `getSession`/`updateSession`/`addSegment`/`reprocess`/`distill` sobre una sesión de A devuelven **404**.
- **JIT:** un usuario nuevo se crea solo en `users` al primer acceso; un repetido actualiza `last_login_at` sin duplicar.
- Script de humo multi-usuario contra `session-store` (dos `callerId`) que asevera lo anterior **sin HTTP**, más una comprobación por cabeceras en local.
- Regresión: el ciclo grabar→transcribir→destilar de un usuario sigue funcionando igual.

---

## 8. Riesgos

- **Nombres/forma de las cabeceras de Easy Auth:** confirmar en el App Service real que `X-MS-CLIENT-PRINCIPAL-ID` trae el oid (para Entra, sí). Si no, decodificar el JSON base64 de `X-MS-CLIENT-PRINCIPAL`.
- **Email ausente en claims:** contemplar el fallback a UPN/`name`.
- **Sesiones de prueba del flujo 1:** son del bootstrap (`dev@…`); en local seguirán visibles si `DEV_USER_EMAIL` coincide, "huérfanas" si no. Son datos de prueba; se pueden borrar.
- **TOCTOU:** mitigado al comprobar `owner_id` en las mutaciones de la capa de datos.
