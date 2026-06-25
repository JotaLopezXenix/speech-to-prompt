# Flujo 1 — Capa de datos SQL + arranque en blanco — SPEC técnico

**Fecha:** 2026-06-23
**Tipo:** delta-spec de implementación (el "cómo") del flujo 1 del cambio.
**Depende de:** [`DESIGN.md`](DESIGN.md) (decisiones D1, D7, D13, D14 y la superficie de regresión).

> **Trazabilidad.** Concreta el **flujo 1** de `DESIGN.md §9`. Los flujos 2 (identidad+aislamiento), 3 (audio→Storage), 4 (procesadores), 5 (`usage_events`/coste) y 6 (red/seguridad) tienen su propio spec. Aquí **no** se implementa identidad efectiva ni se mueve el audio: ambos quedan con su *gancho* preparado.

> **Revisión 2026-06-23 (corrección del usuario).** Dos cambios sobre la primera versión:
> 1. **`sessions.id` pasa a `INT IDENTITY` (surrogate)**, como el resto de tablas — no se conserva el id-timestamp. Motivo: consistencia, seguridad ante colisiones (el id-timestamp truncado al segundo puede colisionar) y FKs limpias. El id-timestamp solo servía para abaratar la migración, y la migración se descarta.
> 2. **Arranque en blanco:** no se importan los datos actuales. La única razón para conservar el id-timestamp era migrar los JSON viejos; al renunciar a ello, se elimina toda la maquinaria de migración (remapeo, síntesis legacy, paridad) y se logra un **reset de confidencialidad**. **No se borra nada**: los `data/sessions/*.json` y audios quedan intactos en disco (local y `/home/data`), solo no se importan.

---

## 1. Objetivo del flujo

Sustituir las tripas de `session-store` (hoy ficheros JSON síncronos) por **Azure SQL Database**, **sin cambiar su contrato público ni la forma del objeto sesión**, y arrancar con la **BD en blanco**. Al terminar:

- Las sesiones/segmentos viven en SQL; `distill.js`, el historial y las 4 fases del front siguen funcionando sin tocarse.
- En local se desarrolla contra **SQL Server local** (`localhost`, base `db-speech-to-prompt`); en Azure, contra Azure SQL con **Managed Identity**.
- **El audio sigue en disco** (`/home/data/audio`) de momento; `audio_file` guarda el nombre de fichero. El flujo 3 lo moverá a Storage.
- **No hay identidad efectiva todavía:** el dueño es un **usuario bootstrap de desarrollo**; el flujo 2 lo reemplaza por el principal real (JIT desde Entra).

---

## 2. Estado de partida y contagio async

`session-store` es síncrono (`readFileSync`/`writeFileSync`). Pasar a SQL lo vuelve `async`. Contagio acotado a **3 ficheros de rutas**:

| Fichero | Llamadas a actualizar a `await` |
|---|---|
| `src/routes/sessions.js` | `createSession`, `getSession`, `updateSession`, `listSessions` (handlers hoy síncronos → pasar a `async`) |
| `src/routes/transcribe.js` | `getSession`, `addSegment`, `replaceSegments`, `updateSession` (handlers ya `async`). `getSegments`/`nextSegmentNumber` siguen **puros/síncronos** sobre el objeto sesión ya cargado |
| `src/routes/distill.js` | `getSession`, `updateSession` (handler ya `async`) |

Funciones que **se mantienen puras y síncronas**: `getSegments(session)`, `recomputeTranscription(segments)`, `nextSegmentNumber(session)`.

---

## 3. Esquema físico (migración `001_core_schema.sql`)

T-SQL para Azure SQL / SQL Server, esquema `dbo`. Solo el núcleo + el gancho de compartir. `usage_events` y `model_prices` llegan en el flujo 5 (otra migración numerada).

```sql
-- 001_core_schema.sql

CREATE TABLE dbo.users (
  id            INT IDENTITY(1,1) CONSTRAINT PK_users PRIMARY KEY,
  external_id   NVARCHAR(200) NULL,         -- oid de Entra; lo rellena el JIT del flujo 2
  email         NVARCHAR(320) NOT NULL,
  display_name  NVARCHAR(200) NULL,
  created_at    DATETIME2(3) NOT NULL CONSTRAINT DF_users_created DEFAULT SYSUTCDATETIME(),
  last_login_at DATETIME2(3) NULL,
  CONSTRAINT UQ_users_email UNIQUE (email)
);
CREATE UNIQUE INDEX UX_users_external_id ON dbo.users(external_id) WHERE external_id IS NOT NULL;

CREATE TABLE dbo.sessions (
  id                   INT IDENTITY(1,1) CONSTRAINT PK_sessions PRIMARY KEY,
  owner_id             INT          NOT NULL,
  created_at           DATETIME2(3) NOT NULL CONSTRAINT DF_sessions_created DEFAULT SYSUTCDATETIME(),
  transcription_raw    NVARCHAR(MAX) NULL,    -- VISTA MATERIALIZADA (join de segmentos)
  transcription_edited NVARCHAR(MAX) NULL,
  prompt_distilled     NVARCHAR(MAX) NULL,
  distill_mode         VARCHAR(20)  NULL,
  distill_prompt_used  NVARCHAR(MAX) NULL,
  llm_provider         VARCHAR(40)  NULL,
  llm_model            VARCHAR(60)  NULL,
  stt_provider         VARCHAR(40)  NULL,
  stt_model            VARCHAR(60)  NULL,
  CONSTRAINT FK_sessions_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id)
);
CREATE INDEX IX_sessions_owner_created ON dbo.sessions(owner_id, created_at DESC);

CREATE TABLE dbo.segments (
  id                   INT IDENTITY(1,1) CONSTRAINT PK_segments PRIMARY KEY,
  session_id           INT          NOT NULL,
  ordinal              INT          NOT NULL,                 -- 1-based
  audio_file           NVARCHAR(260) NULL,                    -- nombre de fichero hoy; ruta de blob tras flujo 3
  transcription_raw    NVARCHAR(MAX) NULL,
  transcription_edited NVARCHAR(MAX) NULL,
  duration_seconds     INT          NULL,
  source               VARCHAR(20)  NOT NULL CONSTRAINT DF_segments_source DEFAULT 'recorded',
  created_at           DATETIME2(3) NOT NULL CONSTRAINT DF_segments_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_segments_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(id) ON DELETE CASCADE,
  CONSTRAINT UQ_segments_ordinal UNIQUE (session_id, ordinal)
);

CREATE TABLE dbo.session_shares (          -- SOLO ESQUEMA (gancho opción C; sin función aún)
  id                  INT IDENTITY(1,1) CONSTRAINT PK_session_shares PRIMARY KEY,
  session_id          INT NOT NULL,
  shared_with_user_id INT NOT NULL,
  permission          VARCHAR(20) NOT NULL CONSTRAINT DF_shares_perm DEFAULT 'read',
  created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_shares_created DEFAULT SYSUTCDATETIME(),
  created_by          INT NULL,
  CONSTRAINT FK_shares_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(id) ON DELETE CASCADE,
  CONSTRAINT FK_shares_user    FOREIGN KEY (shared_with_user_id) REFERENCES dbo.users(id),
  CONSTRAINT UQ_shares UNIQUE (session_id, shared_with_user_id)
);
```

**Notas de diseño físico:**
- **`sessions.id` = `INT IDENTITY`** (surrogate, decisión del usuario). El id deja de llevar significado; `created_at` guarda la marca de tiempo. Los nuevos audios en disco se nombran con el id numérico (`<id>__seg-N.webm`); irrelevante tras el flujo 3.
- El **espejo `audio_file` a nivel de sesión** (que leen consumidores legacy) **no es columna**: se calcula al ensamblar el objeto (= `segments[0].audio_file`).
- `external_id` (oid de Entra) es **nullable** y único-cuando-no-nulo: el flujo 2 lo rellena con el JIT en el primer login. Sin migración, **no hay reconciliación**: cada usuario se crea limpio al entrar.
- `INT` (no `BIGINT`) en las PK: más que suficiente para el volumen y evita cualquier matiz de `bigint` en JS.

---

## 4. Capa de conexión — `src/services/db.js` (nuevo)

Pool único de `mssql`, configuración por entorno, con reintento ante el arranque en frío de Serverless (D13).

- **Selección de auth por entorno** (mismo patrón que `server.js` con `WEBSITE_HOSTNAME`):
  - **Azure** → Managed Identity, sin secretos: `authentication: { type: 'azure-active-directory-msi-app-service' }`, `server = SQL_SERVER`, `database = SQL_DATABASE`, `options.encrypt = true`.
  - **Local** → SQL auth: `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`/`SQL_PASSWORD`, `SQL_PORT`, `options.encrypt = SQL_ENCRYPT`, `options.trustServerCertificate = SQL_TRUST_SERVER_CERTIFICATE`.
- **Variables de entorno:** las del `.env` local (ver §10) y, en Azure, App Settings `SQL_SERVER`/`SQL_DATABASE` (sin secreto). El `dev` de `package.json` cargará el `.env` con `node --watch --env-file=.env server.js` (Node ≥ 20.6; sin dependencia `dotenv`).
- **Reintento de cold-start:** envolver el `connect()` inicial y las consultas en un reintento corto (hasta ~60 s, backoff) ante errores transitorios de Azure SQL: `40613`, `4060`, `40197`, `49918`, `10928/10929` y timeouts de login. Helper `withRetry(fn)`.
- **API interna:** `getPool()` (memoizado), `query(text, params)`, `tx(fn)` (transacción). Solo `session-store` y los scripts usan `mssql`; el resto del repo no.

`paths.js` deja de ser la fuente de los datos de sesión (sigue para `audio/` y `config.json` mientras el audio esté en disco). No se borra; se reduce su papel.

---

## 5. Reescritura de `session-store.js` (preservando el contrato)

Mismas firmas públicas; ahora `async` donde tocan SQL. La **forma del objeto devuelto es idéntica** a la actual (`DESIGN §8`). Un helper privado `assembleSession(row, segmentRows)` construye el objeto canónico:

```
{
  id, timestamp,                      // id numérico; timestamp = created_at en ISO
  segments: [ { audio_file, transcription_raw, transcription_edited,
                duration_seconds, source, created_at } ],   // ordenados por ordinal
  transcription_raw, transcription_edited,
  prompt_distilled, distill_mode, distill_prompt_used,
  llm_provider, llm_model, stt_provider, stt_model,
  audio_file                          // espejo = segments[0]?.audio_file ?? null
}
```

| Función | Comportamiento SQL |
|---|---|
| `createSession(ownerId?)` | INSERT en `sessions` con `owner_id` (= **usuario bootstrap dev** en este flujo; principal real en flujo 2) y `created_at` por defecto; `OUTPUT inserted.id` → devuelve el objeto con `id` generado y `segments: []`. |
| `getSession(id, callerId?)` | SELECT sesión + SELECT segmentos (ORDER BY `ordinal`) → `assembleSession`. `null` si no existe. **`callerId` es el gancho de aislamiento**: ignorado aquí; en flujo 2 filtra por dueño/compartido. |
| `updateSession(id, partial)` | UPDATE **solo de columnas escalares** en lista blanca (`transcription_raw`, `transcription_edited`, `prompt_distilled`, `distill_mode`, `distill_prompt_used`, `llm_*`, `stt_*`). **Ya no acepta `segments`**. Devuelve el objeto reensamblado. |
| `addSegment(id, segment)` | **Transacción:** `ordinal = MAX(ordinal)+1` → INSERT segmento → `recomputeTranscription` → UPDATE `sessions.transcription_raw`; conserva la lógica de anexar al `transcription_edited` de sesión si existía. Devuelve el objeto reensamblado. |
| `replaceSegments(id, segments)` | **Transacción:** DELETE segmentos → INSERT nuevos (re-`ordinal` 1..N) → recompute + UPDATE `transcription_raw`. Devuelve el objeto reensamblado. |
| `listSessions(callerId?)` | SELECT con agregados: `preview` (= `prompt_distilled` o `transcription_raw`, 100 chars), `has_prompt`, `has_transcription`, `has_audio` (EXISTS segmento con `audio_file`), `segment_count`, ORDER BY `created_at DESC`. Mismo array. `callerId` filtra por dueño en flujo 2. |
| `getSegments(session)` | **Puro**: `session.segments ?? []`. |
| `recomputeTranscription(segments)` | **Puro**, sin cambios. |
| `nextSegmentNumber(session)` | **Puro**: `getSegments(session).length + 1`. El `ordinal` autoritativo lo fija `addSegment`; `UQ_segments_ordinal` es el backstop ante una carrera (improbable a esta escala). |

**Atomicidad (mejora real frente a los JSON):** insertar segmento y recalcular `transcription_raw` van en **una transacción**.

---

## 6. Runner de migraciones de esquema

Forward-only, alineado con D14 (SQL a mano, sin ORM):

- Carpeta **`migrations/`** en la raíz con ficheros **`NNN_nombre.sql`** (`001_core_schema.sql`, …).
- Tabla de control **`dbo.schema_migrations(name PK, applied_at)`**.
- Script **`scripts/migrate-db.js`** (+ `npm run migrate`): aplica los ficheros no registrados (cada uno en transacción cuando sea posible) y los registra. Idempotente.
- **Se ejecuta a mano:** en local antes de desarrollar, y como **paso de despliegue** en Azure (no en el arranque de la app).

---

## 7. Arranque en blanco (sin migración de datos)

- **No se importan** los datos actuales. Los ficheros existentes (`data/sessions/*.json`, `data/audio/*`, y `/home/data` en Azure) **quedan intactos en disco**; solo no entran en SQL. Reversible: si algún prompt antiguo hiciera falta, se importa o copia a mano después.
- **Beneficios:** sin código de remapeo/síntesis legacy/verificación de paridad; **reset de confidencialidad** (el dato viejo, bajo procesadores antiguos, no entra en el régimen nuevo).
- **Usuario bootstrap (solo dev del flujo 1):** como aún no hay identidad efectiva, se **siembra un usuario de desarrollo** (un INSERT en `users`, p. ej. con tu email) y `createSession` lo usa como `owner_id`. El flujo 2 lo sustituye por el principal real (JIT desde Entra) y elimina la dependencia del bootstrap.

---

## 8. Ejecución (esquema) y seguridad

1. **Local:** crear login/usuario (`scripts/sql/create-app-user.sql`), rellenar `.env` (`SQL_PASSWORD`), `npm run migrate` (crea el esquema en `db-speech-to-prompt`), sembrar el usuario dev, `npm start` y humo de la app.
2. **Azure:** `migrate-db` como paso de despliegue contra la Azure SQL; perímetro cerrado (flujo 6).
3. **Confidencialidad:** al **no importar** el dato viejo, este flujo **no manipula material confidencial** (mejora respecto al plan inicial). El dato sensible antiguo permanece donde estaba; su retención/limpieza es una pregunta abierta del `DESIGN`.

Estado intermedio **válido**: metadatos en SQL + audio en disco; `Reprocesar` lee de disco hasta el flujo 3.

---

## 9. Qué se PRESERVA / qué cambia (resumen de regresión)

**Preservado:** forma del objeto sesión; `transcription_raw` materializada; las 4 fases del front y el contrato de `api-client`; abstracción de proveedores; puerta Easy Auth; semántica de `getSegments`/`recomputeTranscription`/`nextSegmentNumber`.

**Cambia:** `session-store` async (3 ficheros de rutas con `await`); `addSegment`/`replaceSegments` escriben filas + recompute transaccional; `updateSession` solo escalares (lista blanca); `createSession` devuelve un **id numérico generado** por la BD; `createSession`/`getSession`/`listSessions` ganan un parámetro de usuario **opcional** (gancho del flujo 2, inerte ahora). Nuevos `src/services/db.js`, `migrations/001_core_schema.sql`, `scripts/migrate-db.js`, `scripts/sql/create-app-user.sql`, `.env`; nueva dependencia **`mssql`** (deps 4→5); `dev` de `package.json` con `--env-file=.env`.

> **Nota:** el front pasa a manejar **ids numéricos** en URLs/estado (antes strings). Revisar que ningún punto asuma string (riesgo bajo: se usan como opacos). El **historial arranca vacío** (esperado: BD en blanco).

---

## 10. Prerrequisitos (provisión)

- **Local (ya disponible):** SQL Server en `localhost`, base **`db-speech-to-prompt`** creada. Falta: ejecutar `scripts/sql/create-app-user.sql` (crea **`stp_app`**) y poner `SQL_PASSWORD` en `.env`. El servidor debe estar en **modo de autenticación mixto** para que el login SQL conecte (ver cabecera del script).
- **Azure (lo ejecutas tú / juntos; no lo lanzo por mi cuenta):** Azure SQL Database **Serverless (GP, auto-pausa)**, West Europe, en `rg-speech-to-prompt`. Habilitar **Managed Identity** del App Service y crear el usuario contenido: `CREATE USER [speech-to-prompt-xenix] FROM EXTERNAL PROVIDER;` + `db_datareader`/`db_datawriter` (runtime; las migraciones las aplica un admin). App Settings: `SQL_SERVER`, `SQL_DATABASE` (**sin secretos**). Cierre por **Private Endpoints** en el flujo 6.

---

## 11. Verificación (criterios de aceptación del flujo)

- `npm run migrate` crea el esquema en `db-speech-to-prompt` (limpia) y es idempotente al re-ejecutarse.
- Con la app sobre SQL y el usuario dev sembrado: **crear** una sesión nueva, **grabar/añadir** un segmento (se recalcula `transcription_raw`), **revisar/editar**, **destilar** (4 modos) y **reprocesar** (audio de disco) funcionan de extremo a extremo.
- El **historial** arranca vacío y va listando las sesiones nuevas; **abrir/reanudar** una funciona; los ids numéricos no rompen el front.
- Sin variables SQL no hay fallback a ficheros: SQL es requisito (decisión "SQL local"); el error es claro.

---

## 12. Riesgos del flujo

- **Managed Identity en local:** no aplica; en local se usa SQL auth (`.env`). Documentado.
- **Cold-start de Serverless:** mitigado por `withRetry`; si molesta, desactivar auto-pausa (D13).
- **Modo de autenticación del SQL local:** si el servidor está en "Windows Authentication only", el login `stp_app` no conecta → pasar a modo mixto (ver script).
- **Ids numéricos en el front:** revisar que se traten como opacos (riesgo bajo).
- **Dependencia nueva (`mssql`):** crece la superficie; es la elegida en D14, sin alternativa razonable sin ORM.
