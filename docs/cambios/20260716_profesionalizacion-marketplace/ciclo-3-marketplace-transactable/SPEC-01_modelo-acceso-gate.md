# SPEC-01 — Modelo de acceso (entitlement) + gate

> **Trazabilidad.** Implementa el cimiento del `DESIGN.md` de este ciclo: decisiones [E] nº 2 (entitlement unificado), nº 3 (concesiones manuales), nº 4 (retirar `ALLOWED_EMAILS`), nº 7 (punto/forma del gate) y nº 8 (hueco H6). Es el **spec fundacional** (§10 del DESIGN): desbloquea landing/webhook/fulfillment/retención, que llegan en SPEC-02…06. Autocontenido: implementable sin releer la conversación de diseño.

## 1. Resumen

Introduce un **modelo de acceso unificado** (`entitlements`) y cambia el gate de la app: pasa de una **lista blanca de correos** (`ALLOWED_EMAILS`, interina) a **"¿el usuario tiene un acceso activo?"**. Un acceso tiene dos orígenes: `marketplace` (poblado por SPEC-02/03/04) o `manual` (concesiones que Xenix crea sin pasar por el Marketplace). En este spec se crea la tabla, el servicio de acceso, el nuevo gate, se **retira la lista blanca** (migrando a Jesús y Agustín a concesiones manuales) y se **resuelve el hueco H6**.

## 2. Stack y arquitectura (código existente — se respeta)

- **Node.js + Express**, sin build. Driver **`mssql`** con el helper `src/services/db.js` (`getRequest`, `sql`). Migraciones SQL versionadas en `migrations/NNN_*.sql` aplicadas por `npm run migrate` (tabla `schema_migrations`). Tests con `node --test` (solo lógica pura, sin BD/red).
- El gate vive en el middleware `src/middleware/identity.js`, montado sobre `/api/{config,sessions,prompts,diagnostics}` y sus alias `/api/v1/*` (`server.js`). El contrato que consumen las rutas —`req.user = { id, externalId, tenantId, oid, email, name }`— **no cambia**.
- La identidad JIT (`src/services/user-store.js#ensureUser`) identifica por `external_id = tid.oid`; el email es atributo mutable. Se mantiene.
- **Encaje del cambio:** el gate deja de leer un `Set` de correos en memoria y pasa a consultar la tabla `entitlements` a través de un servicio nuevo (`entitlement-store.js`), en la misma posición del pipeline (tras validar el token y hacer JIT). Ningún otro módulo cambia.

## 3. Delta (ADDED / MODIFIED / REMOVED)

**ADDED**
- `migrations/007_entitlements.sql` — tabla `dbo.entitlements` + índices + fix H6 (`users.email` → NULL).
- `src/services/entitlement-store.js` — servicio de acceso (consulta/creación/vinculación) + helper puro.
- `test/entitlement.test.js` — tests de la lógica pura de "acceso activo".
- `scripts/sql/seed-entitlements-cutover.sql` — semilla de cutover (una vez): migra la lista blanca actual a concesiones manuales.

**MODIFIED**
- `src/middleware/identity.js` — el gate pasa de `isAllowed(email, allowlist)` a `hasActiveAccess(userId)` (con vinculación previa de concesiones pendientes por email). Se conserva el bypass de dev local.

**REMOVED**
- `src/utils/allowlist.js` — ya no se usa.
- `test/allowlist.test.js` — su lógica desaparece; se sustituye por `test/entitlement.test.js`.
- Lectura de `process.env.ALLOWED_EMAILS` en `identity.js` (y, en ops, el App Setting `ALLOWED_EMAILS` de Azure tras el despliegue — ver §6).

## 4. Interfaces y contratos

### 4.1 Modelo de datos — `migrations/007_entitlements.sql`

Tabla `dbo.entitlements`. Idempotente (guardas `IF`). Columnas núcleo las usa este spec; **marketplace** y **retención** quedan latentes (las poblarán SPEC-02/03/04 y SPEC-05) — se crean ya para no re-migrar.

```sql
-- 007_entitlements.sql — modelo de acceso unificado (ciclo marketplace-transactable, SPEC-01).
-- Un "entitlement" = un acceso, con dos orígenes: 'marketplace' | 'manual'.
-- El gate pasa de lista blanca de correos a "¿tiene acceso activo?".

IF OBJECT_ID('dbo.entitlements', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.entitlements (
    id                INT IDENTITY(1,1) CONSTRAINT PK_entitlements PRIMARY KEY,
    owner_id          INT NULL,                 -- users.id; NULL hasta que el 1er login lo vincula
    email             NVARCHAR(320) NULL,       -- clave de vinculación pre-login (minúsculas); beneficiario en marketplace
    source            VARCHAR(20)  NOT NULL,    -- 'marketplace' | 'manual'
    status            VARCHAR(20)  NOT NULL CONSTRAINT DF_entitlements_status DEFAULT 'active', -- active|suspended|canceled|pending
    access_expires_at DATETIME2(3) NULL,        -- NULL = sin caducidad
    -- marketplace (latentes hasta SPEC-02/03/04)
    marketplace_subscription_id UNIQUEIDENTIFIER NULL,
    plan_id           NVARCHAR(100) NULL,
    offer_id          NVARCHAR(100) NULL,
    purchaser_email   NVARCHAR(320) NULL,
    purchaser_oid     NVARCHAR(200) NULL,
    purchaser_tid     NVARCHAR(200) NULL,
    beneficiary_oid   NVARCHAR(200) NULL,
    beneficiary_tid   NVARCHAR(200) NULL,
    raw               NVARCHAR(MAX) NULL,        -- último payload resolve/webhook (JSON)
    -- retención (latentes hasta SPEC-05)
    canceled_at       DATETIME2(3) NULL,
    data_purge_at     DATETIME2(3) NULL,
    -- auditoría
    granted_by        NVARCHAR(320) NULL,        -- quién concedió (manual)
    note              NVARCHAR(400) NULL,
    created_at        DATETIME2(3) NOT NULL CONSTRAINT DF_entitlements_created DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(3) NOT NULL CONSTRAINT DF_entitlements_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_entitlements_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT CK_entitlements_source CHECK (source IN ('marketplace','manual')),
    CONSTRAINT CK_entitlements_status CHECK (status IN ('active','suspended','canceled','pending'))
  );
END
GO

-- Unicidad de la suscripción de Marketplace (filtrada: solo filas con subscriptionId)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_entitlements_mp_sub' AND object_id=OBJECT_ID('dbo.entitlements'))
  CREATE UNIQUE INDEX UX_entitlements_mp_sub ON dbo.entitlements(marketplace_subscription_id)
    WHERE marketplace_subscription_id IS NOT NULL;
GO

-- Gate por dueño (solo filas ya vinculadas)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_entitlements_owner' AND object_id=OBJECT_ID('dbo.entitlements'))
  CREATE INDEX IX_entitlements_owner ON dbo.entitlements(owner_id) WHERE owner_id IS NOT NULL;
GO

-- Vinculación pendiente por email (solo filas sin vincular)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_entitlements_email_unbound' AND object_id=OBJECT_ID('dbo.entitlements'))
  CREATE INDEX IX_entitlements_email_unbound ON dbo.entitlements(email) WHERE owner_id IS NULL;
GO

-- H6: el email del usuario deja de ser obligatorio (un token sin claim email no debe romper el JIT)
IF COLUMNPROPERTY(OBJECT_ID('dbo.users'), 'email', 'AllowsNull') = 0
  ALTER TABLE dbo.users ALTER COLUMN email NVARCHAR(320) NULL;
GO
```

**Semántica de "acceso activo"** (única fuente de verdad del gate): `status = 'active'` **y** (`access_expires_at IS NULL` **o** `access_expires_at > ahora`). Los estados `suspended`/`canceled`/`pending` **no** dan acceso (los gobernarán SPEC-04/05).

### 4.2 Servicio — `src/services/entitlement-store.js`

```js
import { getRequest, sql } from './db.js';

// Helper PURO (testable sin BD): ¿esta fila da acceso ahora?
export function isEntitlementActive(row, now = new Date()) {
  if (!row || row.status !== 'active') return false;
  if (row.access_expires_at == null) return true;
  return new Date(row.access_expires_at) > now;
}

// ¿El usuario tiene algún acceso activo? (gate)
export async function hasActiveAccess(userId) {
  if (!userId) return false;
  const req = await getRequest();
  req.input('owner_id', sql.Int, userId);
  const r = await req.query(`
    SELECT TOP 1 1 AS ok FROM dbo.entitlements
    WHERE owner_id = @owner_id AND status = 'active'
      AND (access_expires_at IS NULL OR access_expires_at > SYSUTCDATETIME())
  `);
  return r.recordset.length > 0;
}

// Vincula al usuario las concesiones creadas por email antes de su primer login.
// Devuelve el nº de filas vinculadas. Sin email → no-op.
export async function bindPendingEntitlements(userId, email) {
  if (!userId || !email) return 0;
  const req = await getRequest();
  req.input('owner_id', sql.Int, userId);
  req.input('email', sql.NVarChar(320), String(email).trim().toLowerCase());
  const r = await req.query(`
    UPDATE dbo.entitlements
      SET owner_id = @owner_id, updated_at = SYSUTCDATETIME()
      WHERE owner_id IS NULL AND email = @email
  `);
  return r.rowsAffected[0] ?? 0;
}

// Concesión manual (uso operativo/backoffice futuro; en v1 se crea por SQL o por aquí).
// expiresAt: Date|null (null = indefinida). Devuelve el id creado.
export async function grantManual({ email, expiresAt = null, grantedBy = null, note = null }) {
  if (!email) throw new Error('grantManual requiere email');
  const req = await getRequest();
  req.input('email', sql.NVarChar(320), String(email).trim().toLowerCase());
  req.input('expires', sql.DateTime2, expiresAt);
  req.input('granted_by', sql.NVarChar(320), grantedBy);
  req.input('note', sql.NVarChar(400), note);
  const r = await req.query(`
    INSERT INTO dbo.entitlements (email, source, status, access_expires_at, granted_by, note)
    OUTPUT INSERTED.id
    VALUES (@email, 'manual', 'active', @expires, @granted_by, @note)
  `);
  return r.recordset[0].id;
}
```

### 4.3 Gate — `src/middleware/identity.js` (delta)

- **Eliminar** `import { parseAllowlist, isAllowed } from '../utils/allowlist.js'`, la constante `allowlist` y la comprobación `isAllowed(...)`.
- **Añadir** `import { hasActiveAccess, bindPendingEntitlements } from '../services/entitlement-store.js'`.
- El **bypass de dev local** (sin Azure y sin `Authorization` → `DEV_USER_*`) se conserva **sin gate** (igual que hoy saltaba la lista blanca).
- Rama autenticada: validar token → `ensureUser` (id) → `bindPendingEntitlements(id, claims.email)` → `hasActiveAccess(id)`:
  - `true` → `req.user = {...}` y `next()`.
  - `false` → **403** `{ error: { code: 'NO_ACCESS', message: 'Tu cuenta no tiene una suscripción activa' } }`.

```js
// … tras verificar el token y construir externalId:
const id = await ensureUser({ externalId, tenantId: claims.tid, email: claims.email, name: claims.name });
await bindPendingEntitlements(id, claims.email);          // vincula concesiones pendientes por email
if (!(await hasActiveAccess(id))) {
  return res.status(403).json({ error: { code: 'NO_ACCESS', message: 'Tu cuenta no tiene una suscripción activa' } });
}
req.user = { id, externalId, tenantId: claims.tid, oid: claims.oid, email: claims.email, name: claims.name };
next();
```

> **Nota de códigos:** el 403 cambia de `NOT_ALLOWLISTED` a **`NO_ACCESS`**. El frontend (SPEC-03) mostrará con ese código la invitación a suscribirse; en este spec basta con el 403.

### 4.4 Semilla de cutover — `scripts/sql/seed-entitlements-cutover.sql`

Ejecución **una sola vez** tras aplicar la 007 (paso de cutover documentado, análogo al backfill del ciclo 1). Migra los correos hoy en `ALLOWED_EMAILS` a concesiones manuales **ya vinculadas** (los usuarios existen, son dueños de sesiones), para que **no pierdan acceso**. Idempotente.

```sql
INSERT INTO dbo.entitlements (owner_id, email, source, status, granted_by, note)
SELECT u.id, LOWER(u.email), 'manual', 'active', 'cutover-spec01',
       'Acceso interino migrado de ALLOWED_EMAILS'
FROM dbo.users u
WHERE LOWER(u.email) IN ('jesus.lopez@xenix.es', 'agustin.hernandez@xenix.es')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.entitlements e
    WHERE e.owner_id = u.id AND e.source = 'manual' AND e.status = 'active'
  );
```

## 5. Qué se PRESERVA (superficie de regresión)

- **Validación de token del ciclo 1** (`src/services/token-verify.js`): **no se toca**. Es la frontera de seguridad; el gate se apoya en su resultado (`claims`).
- **Contrato `req.user`** que consumen las rutas: idéntico (mismos campos). Las rutas protegidas y su montaje en `server.js` **no cambian**.
- **Aislamiento por `owner_id`/`callerId`** (cruzado → 404) y `ensureUser` por `external_id`: intactos. `email` sigue actualizándose por COALESCE.
- **Bypass de dev local** (`DEV_USER_*` sin token): sigue entrando sin gate (el desarrollo no se frena).
- **Comportamiento observable de los usuarios actuales** (Jesús, Agustín): tras el cutover (§4.4) conservan acceso exactamente igual que con la lista blanca.
- Resto del sistema (sesiones, captura, proveedores, red privada, migraciones previas): sin cambios.

## 6. Migración de datos y despliegue

> ⚠️ **Este §6 tenía dos defectos que causaron una caída de producción de ~8 h el 23-jul. Leer el ADDENDUM 2026-07-29 al final antes de usarlo como plantilla para SPEC-02 y siguientes.**

1. `npm run migrate` aplica la **007** (crea `entitlements`, índices, y `users.email` → NULL). Idempotente.
2. Ejecutar **una vez** `scripts/sql/seed-entitlements-cutover.sql` (contra la BD, con las credenciales admin de siempre) → siembra a Jesús y Agustín.
3. Desplegar el código (gate nuevo). Orden seguro: **migrar + sembrar ANTES de desplegar** el código nuevo, para que al arrancar el gate ya encuentre los accesos (si se despliega antes de sembrar, Jesús/Agustín recibirían 403 hasta el seed).
4. Tras verificar en prod: **retirar el App Setting `ALLOWED_EMAILS`** del App Service (ya sin uso). Hasta retirarlo no pasa nada (el código ya no lo lee).

## 7. Fuera de alcance (de este spec)

- Landing de activación, webhook, cliente de Fulfillment APIs, app de Entra dedicada + credencial federada (SPEC-02/03/04).
- Estados `suspended`/`canceled`/`pending`, retención, purga y pantalla post-baja (SPEC-04/05); aquí solo `active` da acceso y el resto no.
- UI/backoffice para crear concesiones manuales (ciclo 6); en v1 se crean por SQL (`seed`/`grantManual`).
- Precio/planes y configuración de la oferta en Partner Center (SPEC-06 / negocio).

## 8. Verificación

**Estático / unitario (sin BD):**
- `test/entitlement.test.js` cubre `isEntitlementActive(row, now)`:
  - `active` + `access_expires_at = null` → **true**.
  - `active` + expiración **futura** → **true**.
  - `active` + expiración **pasada** → **false**.
  - `suspended` / `canceled` / `pending` → **false**.
  - fila nula/sin status → **false**.
- `npm test` (raíz) sigue verde; `test/allowlist.test.js` se elimina (su cometido desaparece).

**Integración local (BD SQL local + dev bypass):**
1. `npm run migrate` aplica la 007 sin error; re-ejecutar `migrate` es no-op (idempotente).
2. Con la BD **sin** entitlements para el usuario dev → una llamada a un endpoint protegido (`GET /api/sessions`) devuelve **403 `NO_ACCESS`** cuando se ejerce por token; **el bypass de dev local sigue entrando** (sin `Authorization`).
3. `grantManual({email: <dev>})` (o el seed) + re-login → `bindPendingEntitlements` vincula (`owner_id`) y el endpoint responde **200**.
4. Una concesión con `access_expires_at` **pasada** → **403**; con fecha **futura** → **200**.
5. Un token **sin claim email** (H6): `ensureUser` inserta el usuario **sin** reventar (email NULL) — ya no hay 500 por `NOT NULL`.

**Regresión (debe seguir verde):**
- Un usuario **con** acceso activo ve **solo sus** sesiones (aislamiento por `owner_id` intacto; cross-owner → 404).
- El flujo completo (captura → transcribir → revisar → destilar → historial) funciona igual para un usuario con acceso.
- El contrato `req.user` no ha cambiado (las rutas no requieren ajustes).

**Prod (tras desplegar, curl + smoke logueado):**
- Con el seed aplicado, Jesús/Agustín entran y operan igual que antes (sin regresión perceptible).
- Una cuenta Microsoft **sin** entitlement → 403 `NO_ACCESS` (antes daba `NOT_ALLOWLISTED`).

---

## ADDENDUM 2026-07-29 — despliegue (as-built): el §6 falló en producción, y por qué

Este ADDENDUM cierra la deuda que señaló la auditoría del 28-jul (**H-06**: el despliegue de SPEC-01 no tenía artefacto; su evidencia vivía en el mensaje del commit `6691fd2`). Reconstruido el 29-jul con evidencia primaria. **Lo importante no es la crónica: es que el §6 sigue siendo la plantilla mental para desplegar SPEC-02 y siguientes, y tal como está escrito no funciona.**

### Qué pasó

El código del gate llegó a producción **antes** de que existiera `dbo.entitlements`. Con la tabla ausente, el gate no devolvía 403: **el middleware de identidad lanzaba 500 `IDENTITY_FAILED`** (`Invalid object name 'dbo.entitlements'`) en **toda petición autenticada** → **producción caída para Jesús y Agustín ~8 h**.

Cronología (todo UTC; `gh run list` + `git log` el 29-jul, BD de producción vía la auditoría del 28-jul):

| Hora | Hecho | Evidencia |
|---|---|---|
| 08:31:27 → 08:33:19 | Push de `eb21a2c..d20d304` a `main` → **el workflow despliega el gate a producción** | run de `d20d304` |
| 11:20:49 → 11:24:00 | Segundo deploy (`1396a75`), sin relación con el gate | run de `1396a75` |
| **16:40:35** | **Migración 007 aplicada** → `dbo.entitlements` existe; fin de la caída | `schema_migrations` |
| 16:41 | Seed de cutover → Jesús, `owner_id = 1` | `entitlements` |
| 16:51:14 | Primer evento STT posterior → smoke real de un usuario | `usage_events` |
| 17:10 | Concesión **pre-login de Agustín** añadida a mano (`owner_id NULL`) | `entitlements` |
| 17:14:38 | Commit `6691fd2` «SPEC-01 desplegado — fix del orden migrate+seed + Agustín pre-login» | `git log` |

### Los dos defectos del §6

1. **El paso 3 es inejecutable como está escrito.** Dice «desplegar el código» como una acción deliberada y posterior, pero **no existe un paso de despliegue separado**: `.github/workflows/azure-deploy.yml` tiene `on: push: branches: [main]` (líneas 9-13) → **cualquier push a `main` despliega a producción**. La sesión del 23-jul commiteó y pusheó creyendo dejarlo «pusheado, SIN desplegar» (así lo declaró su handoff) y el pipeline lo desplegó a los dos minutos. **El orden correcto no es "migrar antes de desplegar": es migrar antes de PUSHEAR.**
2. **El paso 3 predice el fallo equivocado.** Dice «si se despliega antes de sembrar, Jesús/Agustín recibirían **403** hasta el seed». Eso solo es cierto si la **tabla ya existe**. Sin migración aplicada no hay 403 degradado, hay **500 para todo el mundo**: el fallo no es de autorización, es de esquema — y por tanto no es "acceso denegado a dos personas", es "aplicación caída".

### Regla para SPEC-02 y siguientes (hereda esto)

- **Toda migración va aplicada a producción ANTES del push que lleva el código que la necesita.** No hay ventana intermedia que administrar.
- **Un cambio que introduce dependencia de esquema nuevo no degrada: tumba.** Si se quiere degradación elegante, hay que programarla explícitamente (p. ej. tolerar la ausencia de la tabla), y **este spec no lo hizo** — decisión asumida, no defecto oculto.
- **Migrar contra Azure NO es `npm run migrate`**: ese script carga el `.env` local y apuntaría a la BD de desarrollo. Se invoca el script con la conexión de producción explícita: `SQL_SERVER=sql-speech-to-prompt.database.windows.net`, `SQL_DATABASE=db-speech-to-prompt`, `SQL_AUTH=entra-default`, `node scripts/migrate-db.js`.
- **El seed de cutover no cubre a quien nunca ha hecho login.** `scripts/sql/seed-entitlements-cutover.sql` siembra `FROM dbo.users`, y el 23-jul **solo existía Jesús** (`users.id = 1`): Agustín nunca se había logueado. De ahí la concesión **pre-login** creada a mano (`grantManual`, `owner_id NULL`, se vincula en su primer login) — que es también la primera prueba real, en producción, del binding pre-login que SPEC-03 necesitará para las suscripciones.

### Recuperación

Restaurar producción fue **solo BD** (aplicar la migración y sembrar): no hizo falta re-deploy ni reinicio, porque el código correcto ya estaba desplegado. Un dictado de ~14 min que se había quedado sin subir sobrevivió en la memoria de la pestaña (`pendingRetryRef`, salvaguarda R1 del ciclo 2) y subió con **Reintentar** sin recargar — la salvaguarda hizo exactamente su trabajo en un incidente real.

*(Nota: el App Setting `ALLOWED_EMAILS` — paso 4 del §6 — no se retiró el 23-jul, como afirmaron algunos apuntes, sino el **27-jul**: commit `a6983bd`, 16:21Z. El commit del 23-jul lo dejaba explícitamente como «higiene pendiente».)*
