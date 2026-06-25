# Azure SQL + Multiusuario — Bitácora de implementación (Parte 1)

**Fecha:** 2026-06-23
**Rama:** `feat/azure-sql-multiusuario` · **Commit:** `4d394c6` (push a `origin` hecho)
**Alcance de esta parte:** diseño + implementación y verificación **en local** de los flujos **1, 2, 3 y 5** del cambio. Quedan para la Parte 2 los flujos **4** (procesadores Azure) y **6** (provisión + red).

> **Nota de seguridad.** Este documento no contiene secretos. Las claves (SQL, API) viven en `.env`/`.env.dev` (gitignored) o en App Settings de Azure; el script de creación de usuario usa el placeholder `<PASSWORD_HERE>`.

---

## 0. Resumen

Se partió de una app **monousuario con almacén en ficheros JSON** (ya desplegada en Azure App Service tras Easy Auth) y se llevó a una **arquitectura profesional**: **Azure SQL Database** como repositorio, **audio en Blob Storage**, **multiusuario real** (cada usuario ve solo lo suyo) y **registro de coste por sesión**. El criterio rector: **todo en Azure** (mejora la relación con Microsoft / créditos, y el horizonte de Azure Marketplace), hecho **incremental y sin hipotecar** el futuro SaaS.

Trabajo realizado por fases del método "diseño en pareja":
1. **Orientación** sobre el código existente (superficie de regresión).
2. **Entrevista socrática** → decisiones de alcance y estructura.
3. **DESIGN.md** + un **SPEC por flujo**, construyendo y verificando flujo a flujo en local.

Estado al cierre: **flujos 1/2/3/5 construidos y validados de extremo a extremo por navegador** (sesión de prueba `id=7`). Commit y push hechos en rama propia.

---

## 1. Método y documentos generados

| Documento | Contenido |
|---|---|
| `DESIGN.md` | Objetivo, alcance/fuera de alcance, **16 decisiones** (estructurales vs reversibles), modelo de datos lógico, superficie de regresión, riesgos y preguntas abiertas. |
| `SPEC-01_capa-datos-sql.md` | Flujo 1: esquema físico (id surrogate), reescritura de `session-store` a SQL preservando el contrato, runner de migraciones, arranque en blanco. |
| `SPEC-02_identidad-aislamiento.md` | Flujo 2: middleware de identidad (Easy Auth / dev), JIT de usuarios, aislamiento por propietario en la capa de datos. |
| `SPEC-03_audio-blob-storage.md` | Flujo 3: abstracción `BlobStore` (ficheros local / Azure Blob nube), endpoint de servir audio, reprocess desde el store. |
| `SPEC-05_usage-coste.md` | Flujo 5: `usage_events` (append-only), `model_prices`, coste estimado por sesión. |

(El índice de `docs/` se mantuvo en `docs/README.md`.)

---

## 2. Decisiones clave de esta sesión

Incluye las **correcciones del usuario** sobre las propuestas iniciales.

| # | Decisión | Notas |
|---|----------|-------|
| Alcance | Uso interno en Xenix con **dato de cliente real** → SQL + multiusuario + seguridad profesional **ya**; SaaS después. | — |
| Compartición | **Solo esquema** (`session_shares`); comportamiento = aislamiento estricto. | Gancho para opción C (compartir) sin función aún. |
| Sesiones existentes | **No se migran**: arranque en blanco. | Reset de confidencialidad; los JSON viejos quedan intactos en disco. |
| **`sessions.id`** | **`INT IDENTITY` (surrogate)**, no el id-timestamp. | *Corrección del usuario*: consistencia, evita colisiones del timestamp truncado al segundo, FKs limpias. |
| Audio | **Azure Blob Storage** privado (servido por la app); abstracción con **backend de ficheros en local** (no Azurite). | *Decisión del usuario* sobre dev local. |
| App → SQL | **Managed Identity** (sin secretos) en Azure; SQL auth en local. | — |
| Identidad de persona | **Delegada en Entra/Easy Auth**; tabla `users` con clave externa estable (oid)+email, agnóstica de proveedor. | JIT en el primer login; no hipoteca External ID/CIAM futuro. |
| Procesadores | STT → **Azure OpenAI Whisper**; LLM → **Claude vía Azure AI Foundry**. | Se implementan/terminan en el flujo 4. |
| **Precios** | En **tabla `model_prices`** (editables por SQL), no en fichero. Cantidades crudas en `usage_events`, coste derivado. | *Corrección del usuario*. Futuro: backoffice para editarlos por UI (anotado en DESIGN §12). |
| Histórico | **Registro de llamadas/coste activo**; versionado de texto preparado pero **no** activo. | — |
| Red | **Private Endpoints + VNet**; acceso admin (SSMS/Storage Explorer) por **lista blanca de IPs** + Entra/MFA (VPN diferida). | Se materializa en el flujo 6. |
| SQL (infra) | **Serverless con auto-pausa** + reintento de conexión (cold-start). | Reversible. |
| Driver | **`mssql` + migraciones SQL a mano** (sin ORM). | Reversible. |

---

## 3. Lo construido, por flujo (en local, contra SQL Server `db-speech-to-prompt`)

### Flujo 1 — Capa de datos SQL
- **Nuevos:** `src/services/db.js` (pool `mssql`, auth por entorno MI/SQL, `withRetry` para cold-start), `migrations/001_core_schema.sql` (`users`/`sessions`/`segments`/`session_shares`, id surrogate), `scripts/migrate-db.js` (runner forward-only + `schema_migrations`), `scripts/sql/create-app-user.sql` (login local `stp_app`).
- **Reescrito:** `src/services/session-store.js` a SQL **preservando el contrato y la forma del objeto** (async; `addSegment`/`replaceSegments` transaccionales con recompute de `transcription_raw`; `updateSession` solo escalares en lista blanca; `getSegments`/`recomputeTranscription`/`nextSegmentNumber` puros).
- **Tocado:** `sessions.js`/`transcribe.js`/`distill.js` (await), `package.json` (dep `mssql`), `.env` (gitignored).
- **Verificación:** migración idempotente + 21 aserciones de humo del contrato (id numérico, `segments[]`, vista materializada, espejo `audio_file`, `updateSession` ignora no-whitelisted, `listSessions`, `replaceSegments`, etc.). ✅

### Flujo 2 — Identidad real + aislamiento
- **Nuevos:** `src/middleware/identity.js` (lee `X-MS-CLIENT-PRINCIPAL-*` en Azure; usuario `DEV_USER_*` en local; permite simular usuarios por cabeceras), `src/services/user-store.js` (`ensureUser` JIT por oid, reconcilia por email).
- **Cambios:** `session-store` retira el bootstrap; `callerId` **efectivo** con `owner_id` en el `WHERE` de lectura **y** mutaciones (defensa en la capa de datos, D5; cruzado → 404). Rutas pasan `req.user.id`; `server.js` monta `identity` en `/api/sessions`.
- **Verificación:** 12 aserciones de aislamiento (B no ve/lee/actualiza/añade/reemplaza lo de A), JIT idempotente, reconciliación por email, y prueba del middleware (fallback dev + cabeceras Easy Auth). ✅

### Flujo 3 — Audio a Blob Storage
- **Nuevos:** `src/providers/storage/{base,file,azure,index}.js` (abstracción `BlobStore`; `FileBlobStore` raíz=AUDIO_DIR byte-compatible; `AzureBlobStore` con `@azure/storage-blob` + Managed Identity). Deps `@azure/storage-blob` + `@azure/identity`.
- **Cambios:** `transcribe.js` sube y reprocesa vía `getBlobStore()`; `segments.audio_file` pasa a ser la **clave** del store; nuevo `GET /api/sessions/:id/audio/:ordinal` (autorizado por dueño).
- **Verificación:** round-trip del backend de ficheros (put/exists/downloadToFile/openReadStream/delete + guarda anti-traversal). `azure.js` queda **escrito pero sin verificar** hasta provisionar Storage. ✅ (local)

### Flujo 5 — Registro de uso + coste por sesión
- **Nuevos:** `migrations/002_usage_and_prices.sql` (`usage_events` append-only — `segment_id` sin FK para sobrevivir al reprocess — + `model_prices` con seed aproximado), `src/services/pricing.js` (lee/cachea precios, calcula coste), `src/services/usage-store.js` (`recordUsage`, `getSessionUsage` con aislamiento).
- **Cambios:** registro **no bloqueante** de STT (`transcribe.js`) y LLM (`distill.js`); `GET /api/sessions/:id/usage`; UI: coste estimado (aprox.) en la fase 5; `api-client.getSessionUsage`.
- **Verificación:** 7 aserciones (eventos registrados, coste STT/LLM/total exacto vs cálculo manual, modelo sin tarifa marcado, aislamiento). ✅

---

## 4. Ergonomía de desarrollo y *gotchas* resueltos

- **Pestañas de navegador en cada reiningio de `--watch`:** se separó `.env` (credenciales compartidas: `SQL_*`, `DEV_USER_*`) de **`.env.dev`** (solo `npm run dev`, contiene `STP_NO_OPEN=1`). `server.js` salta el *single-instance guard* y `open()` si `STP_NO_OPEN`. El lanzador/`npm start` no cargan `.env.dev` → sí abren navegador.
- **`npm start` fallaba con "config.server required" (driver mssql):** `npm start` era `node server.js` **sin** cargar `.env`. Se cambió **todos** los arranques (`start`/`dev`/`migrate` + `launcher.bat`) a **`--env-file-if-exists=.env`** (no crashea en Azure, donde no hay `.env` y la config viene de App Settings). Además, `db.js` ahora da un error claro si faltan `SQL_SERVER`/`SQL_DATABASE`, y `server.js` avisa al arrancar en local.
- **Puerto 3000 ocupado por una instancia antigua:** quedaba vivo un `node` viejo (sin env) en 3000; se identificó (`Get-NetTCPConnection`) y se mató; tras relanzar, el dev tomó el 3000.
- **Método de arranque en dev (aclarado):** con `npm run dev` el navegador **no se abre solo** (por diseño); se abre **http://localhost:3000 a mano** una vez y se refresca. `launcher.vbs`/`npm start` sí abren navegador.
- **Seguridad:** la contraseña SQL que se había pegado en `create-app-user.sql` se sustituyó por placeholder; `.env`/`.env.dev` añadidos a `.gitignore`. Verificado antes del push que la contraseña **no aparece** en ningún fichero versionado.

---

## 5. Validación end-to-end (sesión `id=7`)

Prueba real por navegador (grabar → transcribir → revisar → destilar → ver coste). Inspección de solo lectura de la BD:

```
SESSION 7  owner=1 (dev@speech-to-prompt.local)  modo=ligero
  stt=groq/whisper-large-v3   llm=anthropic/claude-sonnet-4-6
SEGMENT #1  recorded  dur=51s  audio="7__seg-1.webm"  en store=SÍ
USAGE   stt groq 51s   ·   llm anthropic in=782 out=184
COSTE   total $0.006678  (stt $0.001573 · llm $0.005106)
```

Valida: persistencia SQL + `transcription_raw` materializada (flujo 1), dueño asignado por identidad (flujo 2), audio en el store (flujo 3), `usage_events` y coste (flujo 5) — **todo por la interfaz real, no solo por scripts**. (Los procesadores siguen siendo Groq/Anthropic: el cambio a Azure es el flujo 4.)

---

## 6. Estado de git

- Rama **`feat/azure-sql-multiusuario`** creada desde `main` y **pusheada** a `origin`.
- Commit **`4d394c6`**: *feat(arquitectura): Azure SQL + multiusuario + audio en Blob Storage + coste por sesión*.
- Sin secretos en el commit (verificado). PR opcional pendiente de abrir por el usuario.

---

## 7. Estado al cierre y pendiente (Parte 2)

**Hecho y verificado en local:** flujos **1, 2, 3, 5**.

**Pendiente:**
- **Flujo 4 — procesadores Azure:** terminar `azure-whisper.js` (STT) + proveedor **Claude vía Foundry** (LLM). *Dato pendiente del usuario:* confirmar si el recurso **Azure OpenAI Whisper** de junio (`aoai-speech-to-prompt`, West Europe) sigue vivo (endpoint + clave) para verificar el STT en local.
- **Flujo 6 — provisión + red:** Azure SQL (Serverless), Storage, Foundry, **Managed Identity**, **Private Endpoints + VNet**, lista blanca de IPs admin. Aquí se verifican las mitades **escritas pero sin probar**: `azure.js` (storage), proveedor Foundry, MI para SQL/Storage.
- **Doc:** actualizar `CLAUDE.md` (la sección *Commands* no menciona `.env`, el SQL local ni `npm run migrate`) cuando cierren 4/6.

---

## 8. Cómo retomar / comandos útiles

- **Arrancar dev:** `npm run dev` → abrir **http://localhost:3000** a mano. (BD local `db-speech-to-prompt` en `localhost`.)
- **Aplicar migraciones:** `npm run migrate`.
- **Crear el usuario SQL local (una vez):** ejecutar `scripts/sql/create-app-user.sql` en SSMS (sustituyendo `<PASSWORD_HERE>` y poniéndola en `.env`).
- **Config local:** `.env` (SQL_*, DEV_USER_*) y `.env.dev` (STP_NO_OPEN) — ambos gitignored.
- Para continuar: en sesión nueva, "seguimos con el flujo 4" (+ confirmar el recurso Whisper). El contexto está en `DESIGN.md`, los `SPEC-0x` y la memoria del proyecto.

---

## Anexo — Inventario de ficheros

**Nuevos (código):** `src/services/db.js`, `src/services/user-store.js`, `src/services/pricing.js`, `src/services/usage-store.js`, `src/middleware/identity.js`, `src/providers/storage/{base,file,azure,index}.js`, `migrations/001_core_schema.sql`, `migrations/002_usage_and_prices.sql`, `scripts/migrate-db.js`, `scripts/sql/create-app-user.sql`.

**Modificados (código):** `server.js`, `src/services/session-store.js`, `src/routes/{sessions,transcribe,distill}.js`, `public/js/api-client.js`, `public/js/phases/phase5-result.js`, `package.json`, `launcher.bat`, `.gitignore`.

**Docs:** `docs/cambios/20260623_azure-sql-multiusuario/` (`DESIGN.md`, `SPEC-01/02/03/05`, esta bitácora), `docs/README.md`.

**No versionados (local):** `.env`, `.env.dev`.
