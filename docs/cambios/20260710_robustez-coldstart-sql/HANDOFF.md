# HANDOFF — robustez-coldstart-sql (bitácora de cierre de sesión)

Foto fechada **2026-07-10**. El estado vivo (fuente de verdad) es la línea
"Fase actual" del bloque JCC en `CLAUDE.md`; esta bitácora es la instantánea con
evidencia. No deben contradecirse.

## Estado metodológico

- **Fase actual:** **revisión** (review adversarial independiente + bucle 3↔4
  cerrados con **veredicto LIMPIO**; cambio **desplegado a producción**). NO se
  marca "cerrado" porque el criterio de aceptación duro (§8.3, cold-start real)
  está verificado **por análisis, no empíricamente**.
- **Siguiente command que toca:** *condicional.*
  - Si la **prueba de fuego §8.3** pasa → no hay más fases; cierre definitivo
    (una bitácora final / actualización de estado).
  - Si §8.3 **falla** → reabrir **`/jcc-implement`** (bucle 3↔4) con lo observado.
- **Restricciones activas (no saltarse):**
  1. **`withRetry` NO amplía su alcance:** sigue envolviendo SOLO el `connect()`
     inicial en `getPool` (`src/services/db.js`). NO envolver `query`/`getRequest`/
     `withTransaction` (evita reintentar y **duplicar** transacciones). Decisión de
     mesa (D2).
  2. **`propagateCreateError:false` es la palanca EFECTIVA** de D2 (decidido en
     caliente durante la review — ver §"Decisiones en caliente"). Sin ella, los
     timeouts del pool son inertes (mssql cablea `true`, que hace a tarn rechazar
     el acquire al 1er create fallido).
  3. **Preservado (regresión):** semántica transaccional de `addSegment`/
     `replaceSegments`, aislamiento owner-scoped, forma del objeto sesión, la
     **salvaguarda de corte externo** (`handleExternalStop`/`confirmRecoveredAudio`),
     el guard de audio sospechoso, el contrato del recorder y el flush de
     diagnósticos. El nuevo banner "Reintentar" reutiliza el `warnBox` sin pisar
     esos flujos.
  4. **A2 (trade-off aceptado):** el "Reintentar" NO es idempotente; la
     idempotencia real (id de intento + dedup en `addSegment` con migración) está
     **fuera de alcance** y diferida al cambio futuro de robustez. No re-abrir aquí.
  5. **Pendiente que no se puede saltar antes de dar por cerrado:** la prueba de
     fuego §8.3 (abajo).
- **Evidencia del estado (para reconciliar al arrancar):**
  - `DESIGN.md` (con **Addendum §8** fechado: A1 corregido, A2 aceptado).
  - `SPEC.md` (único, indivisible; §3 pool con `propagateCreateError:false`; nota
    en §5 sobre la no-idempotencia del reintento).
  - **NO** existe `REVIEW.md` como fichero: la review fue de un subagente
    independiente; su resultado se recoge en esta bitácora (§"Qué se verificó").
  - Código en `main` (merge fast-forward): commits `1739d00` (feat), `9e1925a`
    (fix review), `1ecfb9e` (docs review), `714b326` (docs deploy).
  - Rama `robustez-coldstart-sql` existe en local y en `origin` (ya mergeada;
    borrado opcional).

## Qué se hizo

Cambio `robustez-coldstart-sql` (un solo SPEC): endurecer el guardado de segmentos
frente al arranque en frío de Azure SQL Serverless para que **no se pierda audio**.

- **`src/services/db.js`** (MOD): pool con `acquireTimeoutMillis:120000` /
  `createTimeoutMillis:60000` / `createRetryIntervalMillis:500` **+
  `propagateCreateError:false`**; `isTransient` reconoce `timed out` (timeout de
  tarn); `export` de `buildConfig`/`isTransient`. `withRetry` sin cambios de alcance.
- **`src/routes/health.js`** (NEW): `GET /api/health/db` (sin `identity`,
  `withRetry(SELECT 1)`) → warm-up.
- **`server.js`** (MOD): monta `/api/health` antes del fallback y sin identity.
- **`public/js/api-client.js`** (MOD): `api.warmup()` fire-and-forget.
- **`public/js/phases/phase1-capture.js`** (MOD): warm-up al montar y al pulsar
  Grabar; slot `pendingRetry` + banner **Reintentar/Descartar** en el `catch` de
  `commitSegment`; `commitSegment` recibe `opts` objeto.
- **`test/db.test.js`** (NEW) + `package.json` (`npm test` → `node --test`).
- **Infra:** `alwaysOn:true` en el App Service (D5).

## Qué se verificó — CON EVIDENCIA REAL

- **`npm test` → 4/4 verde** (ejecutado): `isTransient` caza el `TimeoutError` de
  tarn + transitorios SQL + descarta no-transitorios; `buildConfig().pool` trae los
  timeouts **y** `propagateCreateError:false`. El runner (`node --test
  "test/**/*.test.js"`) NO barre los `scripts/test-*.js`.
- **Warm-up e2e (local)**: `GET /api/health/db → 200 {"ok":true}` en ~0,3 s contra
  SQL local, sin auth.
- **Front (navegador real, local)**: la app carga con **0 errores de consola** y el
  **warm-up dispara al montar** (`GET /api/health/db → 200`). Los 5 call-sites de
  `commitSegment` pasan objeto (firma segura).
- **Review adversarial independiente (subagente) + re-review 3↔4 → LIMPIO**:
  - A1 (timeouts inertes) **corregido**: verificado contra `node_modules/tarn/dist/
    Pool.js` (con `propagateCreateError:false` no se rechaza el acquire al 1er
    create fallido; el acquire espera/reintenta hasta `acquireTimeoutMillis`) y
    `node_modules/mssql/lib/base/connection-pool.js` (nuestro `config.pool` gana en
    el `Object.assign`). D2 queda operativo para el sub-caso 2.
  - A2 (reintento no idempotente) **aceptado y documentado** con fidelidad (DESIGN
    §8 + SPEC §5).
  - **Sin regresión nueva**: happy path idéntico; el `connect()` inicial usa
    `_poolCreate()` directo antes del pool tarn, así que `propagateCreateError` no
    lo toca.
- **Despliegue a prod (real)**: merge ff a `main` → **GitHub Actions run
  29107329269 = success** (4m21s); `alwaysOn:true` aplicado; App Service `Running`;
  raíz y `/api/health/db` responden **HTTP 401** (Easy Auth gatea en el borde, como
  debe). **Sin migración** (el cambio no toca esquema).

### Actualización 10-jul (tarde)
- **Smoke funcional logueado en prod con la BD caliente**: OK — grabar/guardar/
  destilar sin fallos. Confirma **empíricamente que no hay regresión** en el flujo
  normal. NO reproduce el cold-start (la BD estaba despierta), así que **§8.3 sigue
  pendiente**.
- Rama `robustez-coldstart-sql` **borrada** (local + `origin`), ya mergeada a `main`.

### Lo que NO se ha verificado (honesto)
- **§8.3 — prueba de fuego del cold-start real**: NO ejecutada. Requiere pausar la
  BD de **producción** y una **sesión de navegador logueada**. El criterio duro del
  incidente (dictado largo tras parón → Detener guarda sin pérdida) queda por
  confirmar **empíricamente**. Agendado con Agustín.
- El **drive completo del banner Reintentar** (fallo inducido → banner → reintento
  con éxito) tampoco se ejecutó en navegador; va en el mismo smoke logueado.

## Cómo retomar

1. **Coordinar ventana corta con Agustín** (el smoke pausa la BD de prod → breve
   latencia de reanudación para cualquier usuario activo; la BD se auto-pausa igual
   a los 60 min, así que es el escenario real).
2. **Pausar la BD:**
   `az sql db pause -g rg-speech-to-prompt -s sql-speech-to-prompt -n db-speech-to-prompt`
   (requiere `az login`; identidad Entra del admin).
3. **En el navegador logueado** (prod): grabar un tramo (~1-2 min basta), pulsar
   **Detener**. **Éxito =** el guardado **espera unos segundos y termina bien, sin el
   error "operation timed out…" y sin perder audio**; la sesión aparece en el
   histórico. (Opcional: forzar un fallo de subida para ver el banner **Reintentar**
   y comprobar que recupera el audio.)
4. **Si pasa** → cerrar definitivamente (actualizar CLAUDE.md a "completo y en prod,
   smoke confirmado"). **Si falla** → `/jcc-implement` con lo observado (bucle 3↔4).
5. **Limpieza opcional:** borrar la rama `robustez-coldstart-sql` (local + `origin`)
   una vez cerrado.

## Decisiones tomadas "en caliente" al final — releer en frío

- **`propagateCreateError:false`** (fix de A1): decidida durante la review al
  descubrir que los timeouts del pool eran inertes. Confirmada contra las fuentes de
  mssql/tarn y por el test. Releer con calma que el trade-off (una BD realmente
  caída hace esperar ~120 s el acquire antes de fallar, en vez de fallar rápido) es
  el aceptado en Q3 — sí lo es.
- **Aceptar A2 (no-idempotencia del reintento)** como trade-off en vez de arreglarlo:
  decisión de mesa común en la review. Revalidar en frío que "duplicar > perder
  audio" sigue siendo la prioridad y que la idempotencia real encaja en el cambio
  futuro de robustez.
