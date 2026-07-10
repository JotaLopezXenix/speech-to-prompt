# SPEC — Robustez frente al cold-start de Azure SQL Serverless

- **Metodología:** JCC — Fase 2 (Especificación). Fecha: 2026-07-10.
- **Fuente de verdad del porqué:** `DESIGN.md` (mismo directorio). Si SPEC y DESIGN
  se contradicen, manda el SPEC.
- **Granularidad:** un único SPEC indivisible (DESIGN §D6): los cinco items se
  verifican juntos contra el criterio duro *"el escenario del incidente ya no
  pierde audio"*.

## 1. Resumen

Endurece el guardado de segmentos frente al arranque en frío de Azure SQL
Serverless (y del proceso del App Service): el pool espera a que la BD reanude en
vez de reventar, el reintento reconoce el timeout de `tarn`, un warm-up despierta
la BD mientras el usuario dicta, y si aun así falla la subida el front **retiene
el audio** y ofrece **Reintentar**. Objetivo: no volver a perder audio.

## 2. Stack y arquitectura (código existente)

Stack dado, sin cambios de dependencias: Node 24 + Express, `mssql` (driver
`tedious`, pool `tarn`) como única capa SQL (`src/services/db.js`), frontend ES
modules vanilla. El cambio encaja en las costuras existentes:

- **`db.js`** ya centraliza el acceso SQL y tiene `withRetry`/`isTransient` +
  pool memoizado. Se ajustan dos cosas: la config del pool y el clasificador de
  transitorios. No se amplía el *alcance* de `withRetry` (sigue envolviendo solo
  el `connect()` inicial) para no reintentar transacciones (riesgo de duplicado);
  el margen para el sub-caso 2 lo dan los timeouts del pool.
- **Warm-up:** endpoint nuevo y aditivo, montado fuera de `identity` (un
  `SELECT 1` no toca datos de usuario).
- **Front:** el "Reintentar" reutiliza el patrón de banner ya presente en
  `phase1-capture.js` (`confirmRecoveredAudio`) y el `warnBox` existente; no añade
  DOM nuevo a la plantilla.

## 3. Delta (ADDED / MODIFIED / REMOVED)

### MODIFIED — `src/services/db.js`

**(a) Timeouts del pool** — en `buildConfig()`, ampliar el objeto `pool` del
`base` (mssql pasa `config.pool` tal cual a `tarn`):

```js
pool: {
  max: 10,
  min: 0,
  idleTimeoutMillis: 30000,
  // Cold-start de Serverless: dar tiempo a que la BD reanude (~30-60s) en una
  // sola espera, en vez de que el pool aborte la adquisición y reviente.
  acquireTimeoutMillis: 120000,     // espera total por una conexión usable
  createTimeoutMillis: 60000,       // margen sobre connectionTimeout (30s)
  createRetryIntervalMillis: 500,   // reintenta crear conexión cada 0,5s
  // CLAVE (addendum A1): mssql cablea propagateCreateError:true, que hace que
  // tarn rechace el acquire al PRIMER create fallido sin esperar a
  // acquireTimeoutMillis (los timeouts serían inertes). false → el acquire
  // espera y reintenta el create durante toda la reanudación.
  propagateCreateError: false,
},
```

`connectionTimeout: 30000` y `requestTimeout: 30000` se mantienen.

**(b) `isTransient`** — ampliar la regex para reconocer el `TimeoutError` de
`tarn` ("operation timed **out** for an unknown reason"), que hoy escapa (busca
`timeout`, no `timed out`; y el error no trae `.code`/`.number`):

```js
return /timeout|timed out|failed to connect|ETIMEOUT|ESOCKET|ECONNCLOSED|ECONNRESET|currently unavailable|not currently available/i
  .test(err?.message || '');
```

**(c) Exports para test** — añadir `export` a `buildConfig` e `isTransient`
(hoy internas) para poder testearlas como funciones puras. No cambia su
comportamiento ni su uso interno.

### ADDED — `src/routes/health.js`

```js
import { Router } from 'express';
import { withRetry, query } from '../services/db.js';

const router = Router();

// GET /api/health/db — warm-up ligero de la BD. SIN identity: un SELECT 1 no
// toca datos de usuario y solo pretende despertar la Serverless pausada. El
// front lo llama fire-and-forget al empezar a grabar para ocultar el cold-start.
router.get('/db', async (_req, res) => {
  try {
    await withRetry(() => query('SELECT 1 AS ok'));
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: { code: 'DB_UNAVAILABLE', message: err.message } });
  }
});

export default router;
```

### MODIFIED — `server.js`

Importar y montar el router de salud **antes** del fallback `app.get('*')` y
**sin** `identity`:

```js
import healthRouter from './src/routes/health.js';
// ...
app.use('/api/health', healthRouter);   // warm-up: sin identity (no toca datos)
```

### MODIFIED — `public/js/api-client.js`

Añadir al objeto `api`:

```js
// Warm-up de la BD (fire-and-forget). Nunca lanza: el llamador lo ignora.
warmup: () => request('GET', '/health/db').catch(() => {}),
```

### MODIFIED — `public/js/phases/phase1-capture.js`

**(a) Warm-up.** Disparar `api.warmup()` (sin `await`, ignorando el resultado):
1. una vez al montar, dentro de `renderPhase1` tras el setup de DOM/recorder;
2. en el handler de `btnRecord`, al **inicio de la rama "Empezar un nuevo
   segmento"** (el `else`, junto a `diag.startCaptureRun()`).

**(b) "Reintentar" (slot único).** Estado y helpers nuevos en el closure de
`renderPhase1`:

```js
let pendingRetry = null;   // { blob, opts } del último intento fallido

function showRetryBanner(message) {
  warnBox.hidden = false;
  warnBox.innerHTML = `
    <strong>No se pudo guardar el audio.</strong>
    <p>${message}</p>
    <p>Tu audio no se ha perdido. Puedes reintentarlo (p. ej. si la base de datos estaba despertando).</p>
    <div class="phase-actions">
      <button class="btn-primary" id="btn-retry-upload">Reintentar</button>
      <button class="btn-ghost" id="btn-discard-upload">Descartar</button>
    </div>`;
  warnBox.querySelector('#btn-retry-upload').addEventListener('click', retryUpload);
  warnBox.querySelector('#btn-discard-upload').addEventListener('click', discardRetry);
}

function clearRetry() { pendingRetry = null; warnBox.hidden = true; warnBox.innerHTML = ''; }

async function retryUpload() {
  if (!pendingRetry) return;
  const { blob, opts } = pendingRetry;
  warnBox.hidden = true;
  diag.logEvent('upload_retry', { totalBytes: blob?.size ?? 0 });
  await commitSegment(blob, { ...opts, skipGuard: true });
}

function discardRetry() { diag.logEvent('upload_retry_discarded', {}); clearRetry(); updateUI(); }
```

**(c) `commitSegment`** pasa a aceptar `opts` como objeto (para poder retenerlo)
y a integrar el slot:

```js
async function commitSegment(blob, opts = {}) {
  const { source = 'recorded', seconds = 0, filename = 'audio.webm', skipGuard = false } = opts;
  hideError();
  // ... (guard de audio sospechoso: idéntico) ...
  try {
    // ... (createSession lazy + addSegment + renderSession: idéntico) ...
    clearRetry();                       // éxito → limpia slot/banner de un intento previo
  } catch (err) {
    pendingRetry = { blob, opts };      // retener el audio
    showRetryBanner(`Error al guardar el segmento: ${err.message}`);
  } finally {
    // ... (busy=false, transcribingBox oculto, updateUI, startPreview: idéntico) ...
  }
}
```

> El `catch` **sustituye** al actual `showError(...)` (para no mostrar dos
> avisos). El `showError`/`errorBox` sigue usándose para el error de inicio de
> grabación (rama del `catch` de `recorder.start()`), que no cambia.

### REMOVED

Nada.

## 4. Interfaces y contratos

- **`GET /api/health/db`** (nuevo). Sin auth. Respuestas: `200 {ok:true}` |
  `503 {ok:false, error:{code:"DB_UNAVAILABLE", message}}`. Idempotente, sin
  efectos secundarios (solo `SELECT 1`).
- **`api.warmup(): Promise<void>`** (front). Fire-and-forget; resuelve siempre
  (traga errores). No devuelve valor útil.
- **`isTransient(err): boolean`** y **`buildConfig(): object`** — ahora
  exportadas. Contrato: `isTransient` true para transitorios de Azure SQL
  (números `40613/4060/40197/49918/…`, códigos `ESOCKET/ETIMEOUT/…`) y para
  mensajes con `timeout`/`timed out`/`failed to connect`/`currently unavailable`.
- **`commitSegment(blob, opts)`** — firma reajustada: el segundo argumento es un
  objeto `{ source?, seconds?, filename?, skipGuard? }` (antes se desestructuraba
  en la firma). Comportamiento externo idéntico salvo el añadido del slot de
  reintento. Todas las llamadas internas ya pasan un objeto, así que no cambian.
- **Config del pool** — nuevos campos `tarn` (`acquireTimeoutMillis`,
  `createTimeoutMillis`, `createRetryIntervalMillis`); el resto del contrato de
  `db.js` (`getPool`, `getRequest`, `query`, `withTransaction`, `withRetry`,
  `sql`) no cambia.

## 5. Qué se PRESERVA (regresión)

- **Alcance de `withRetry`:** sigue envolviendo **solo** el `connect()` inicial
  (`getPool`). NO se envuelven `getRequest`/`query`/`withTransaction`: el margen
  para el sub-caso 2 lo dan los timeouts del pool, evitando el riesgo de
  reintentar (y duplicar) una transacción a medias.
- **Semántica transaccional** de `addSegment`/`replaceSegments` (`withTransaction`,
  ordinal calculado dentro de la tx, vista materializada `transcription_raw`):
  intacta. Dos segmentos → dos filas, sin duplicados.
- **Aislamiento por propietario** (owner-scoped) y **forma del objeto sesión**:
  intactos.
- **Happy path** (BD caliente): las nuevas opciones del pool no afectan cuando hay
  conexión disponible; `SELECT 1` de warm-up es trivial cuando la BD está despierta.
- **Front:** la **salvaguarda de corte externo** (`handleExternalStop` →
  `confirmRecoveredAudio` → `commitSegment(..., {skipGuard:true})`) sigue igual y
  no colisiona con el banner de reintento (aquélla resuelve su banner antes de
  llamar a `commitSegment`; el slot solo se activa si esa llamada falla). El
  **guard de audio sospechoso** (`confirmSuspectAudio`), el **contrato del
  recorder** (`stop()`→`Promise<blob>`, `chunks` hasta el próximo `start()`) y el
  **flush de diagnósticos** no se tocan.

> **Nota (addendum A2, review 10-jul):** el "sin duplicados" se refiere a la **capa
> transaccional de backend** (`addSegment`/`replaceSegments`), intacta. El nuevo
> **"Reintentar" del front NO es idempotente**: en la ventana estrecha "el `POST`
> commiteó pero se perdió la respuesta", reintentar puede duplicar un segmento u
> orfanar una sesión vacía. **Trade-off aceptado** ("no perder audio" > "duplicado
> raro"); la idempotencia real se difiere al cambio futuro de robustez (DESIGN §8/A2).

## 6. Migración de datos

No aplica (no hay cambios de esquema).

## 7. Fuera de alcance

- UX de recuperación pulida: cola de más de un blob, persistencia local
  (IndexedDB) del audio no enviado, recuperación entre recargas de página.
- Desactivar la auto-pausa de la BD o subir `autoPauseDelay` (coste vs latencia).
- Prevención por causa del corte espontáneo de grabación (ciclo
  `grabacion-stop-espontaneo`, pendiente de cosechar `diagnostic_events`).
- Nada de prompts ni backend de destilado.

## 8. Verificación

### 8.1 Tests unitarios nuevos (la zona no tenía)

Crear `test/db.test.js` (Node built-in test runner; ejecutar con `node --test`).
Recomendado añadir `"test": "node --test"` a `package.json`.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SQL_SERVER ||= 'test.local';
process.env.SQL_DATABASE ||= 'testdb';
const { isTransient, buildConfig } = await import('../src/services/db.js');

test('isTransient reconoce el TimeoutError de tarn', () => {
  assert.equal(isTransient(new Error('operation timed out for an unknown reason')), true);
});
test('isTransient reconoce transitorios SQL por número y código', () => {
  assert.equal(isTransient({ number: 40613 }), true);
  assert.equal(isTransient({ code: 'ESOCKET' }), true);
});
test('isTransient descarta errores no transitorios', () => {
  assert.equal(isTransient(new Error("Invalid column name 'x'")), false);
});
test('buildConfig fija los timeouts del pool para absorber el cold-start', () => {
  const cfg = buildConfig();
  assert.equal(cfg.pool.acquireTimeoutMillis, 120000);
  assert.ok(cfg.pool.createTimeoutMillis >= 30000);
  assert.ok(cfg.pool.createRetryIntervalMillis > 0);
});
```

**Criterio:** los 4 tests en verde.

### 8.2 Warm-up endpoint (e2e, servidor vivo)

Con la app arrancada (`npm run dev`) y la BD despierta:
`GET http://localhost:3000/api/health/db` → `200 {"ok":true}`.
**Criterio:** responde 200 sin auth.

### 8.3 Integración del incidente (prueba de fuego, contra Azure)

En una ventana coordinada (ver nota operativa):
1. Pausar la BD: `az sql db pause -g rg-speech-to-prompt -s sql-speech-to-prompt -n db-speech-to-prompt`.
2. En el navegador logueado, empezar a grabar (dispara warm-up), hablar un tramo
   y pulsar **Detener**.

**Criterio de aceptación (el del incidente):** el guardado **espera y termina
con éxito** (aunque tarde ~decenas de segundos) — **sin** el error "operation
timed out for an unknown reason", **sin** perder audio, y la sesión **aparece en
el histórico**. Contraste: en `main` actual, este mismo escenario produce el
error y pierde el tramo.

### 8.4 "Reintentar" (front)

Forzar un fallo de subida (p. ej. detener el servidor a mitad del `POST`, o BD
pausada sin dar tiempo a reanudar): tras el fallo aparece el banner **Reintentar /
Descartar** y el error. Levantar el servidor / esperar a que reanude y pulsar
**Reintentar** → el mismo audio se guarda como segmento (sin re-grabar).
**Descartar** limpia el slot.
**Criterio:** el audio se recupera desde el banner sin recargar la página.

### 8.5 Regresión (debe seguir en verde)

- **Flujo normal** (BD caliente): grabar → transcribir → añadir segmento →
  Revisar y destilar, end-to-end, intacto.
- **Salvaguarda de corte externo:** repro determinista del cambio
  `grabacion-stop-espontaneo` (parar el track con
  `recorder.stream.getAudioTracks()[0].stop()` en consola) → sigue disparando el
  banner "La grabación se detuvo…" y guardando el tramo, **sin** falso positivo en
  el flujo intencional.
- **Sin duplicados:** grabar dos segmentos → exactamente dos filas en
  `dbo.segments`.

### Nota operativa

El `az sql db pause` de §8.3 es contra **producción**; la reanudación implica una
breve latencia para cualquier usuario activo. Coordinar ventana con Agustín. La BD
se auto-pausa igualmente a los 60 min de inactividad, así que es el escenario real,
no uno artificial.

## 9. Siguiente fase

Cerrada la Fase 2. Recordatorio metodológico: dejar la "Fase actual" de
`CLAUDE.md` en *especificación* hasta lanzar `/jcc-implement`. Cuando quieras,
`/jcc-implement` para construir el delta (Explorar→Planificar→Codificar→Commit),
incluido el paso de infra `az webapp config set … --always-on true` (D5).
