# DESIGN — Robustez frente al cold-start de Azure SQL Serverless

- **Metodología:** JCC — Fase 1 (Análisis). Fecha: 2026-07-10.
- **Slug:** `robustez-coldstart-sql`
- **Estado:** DESIGN aprobado; pendiente `/jcc-spec`.

## 1. Objetivo y problema

**Objetivo (criterio duro): no volver a perder audio.** El escenario exacto del
incidente debe pasar a funcionar sin pérdida.

**El incidente (10-jul-2026).** Tras varios días sin usar la app, un dictado de
~5 min falló al pulsar **Detener** con:

> `Error al transcribir el segmento: operation timed out for an unknown reason`

La sesión **no** quedó en el histórico y el audio se perdió. Un segundo intento
corto, minutos después, funcionó.

**Causa raíz (confirmada por código + configuración de Azure).** Arranque en frío:

- La BD `db-speech-to-prompt` es **Serverless `GP_S_Gen5` con `autoPauseDelay: 60` min**
  → tras días idle estaba **auto-pausada** (reanudar tarda ~30-60 s).
- El App Service `speech-to-prompt-xenix` tiene **`alwaysOn: false`** (plan **B1**)
  → el proceso Node también estaba **descargado** (frío).
- El primer `POST` (al Detener) tuvo que resucitar ambos a la vez. El *pool* de
  conexiones (`tarn`, bajo `mssql`/`tedious`) agotó su espera al adquirir
  conexión y lanzó `TimeoutError('operation timed out for an unknown reason')`
  (`node_modules/tarn/dist/PendingOperation.js:17`). El servidor lo envolvió en
  un `500 STT_FAILED` (`src/routes/transcribe.js:115`) y el front lo mostró.

**Por qué la salvaguarda existente no lo cazó.** El proyecto ya tiene reintento
anti-cold-start (`withRetry`/`isTransient` en `src/services/db.js`), pero:

- **Sub-caso 1 — App Service frío** (`poolPromise=null`): sí corre
  `withRetry(connect())`, pero `isTransient` **no reconoce** el mensaje de tarn
  (su regex busca `timeout`; el mensaje dice "timed **out**"; y el error no trae
  `.code`/`.number`) → no reintenta → revienta.
- **Sub-caso 2 — App Service caliente, BD pausada** (`poolPromise` memoizado de
  días atrás; conexiones físicas cerradas por `idleTimeoutMillis:30s`): el
  timeout ocurre en el `pool.request()` de una `query`/`withTransaction` que **ni
  siquiera pasa por `withRetry`**.

Arreglar solo `isTransient` cubriría el sub-caso 1, no el 2. Por eso el diseño
combina varias palancas.

**Pistas falsas descartadas:** navegador (Chrome vs Edge; la grabación es 100 %
cliente) y la duración del dictado (~1,2 MB a 32 kbps: subida trivial). El
timeout fue al adquirir la conexión, en la *primera* llamada tras el parón.

## 2. Alcance

**Dentro:**

1. **Reconocer el timeout de tarn como transitorio** (`src/services/db.js`) →
   arregla el sub-caso 1.
2. **Absorber la reanudación en una sola espera** subiendo los timeouts del
   *pool* de `mssql` → arregla el sub-caso 2 sin reintentar transacciones.
3. **Warm-up proactivo de la BD**: el front dispara un ping ligero
   *fire-and-forget* al pulsar **Grabar** (y al montar la Fase 1) que despierta
   la BD mientras el usuario dicta → el guardado al Detener ya la encuentra
   caliente (ocultación de latencia).
4. **"Reintentar" mínimo en el front**: ante un fallo al subir el segmento,
   retener el blob y ofrecer **Reintentar / Descartar** → red de seguridad que
   materializa el objetivo "no perder audio".
5. **`alwaysOn: true`** en el App Service (config de infra, gratis en B1).

**Fuera de alcance (→ cambio futuro de robustez):**

- UX de recuperación pulida: más de un blob fallido en cola, persistencia local
  (IndexedDB) del audio no enviado, recuperación entre recargas de página.
- Prevención por causa del corte espontáneo de grabación (eso es el ciclo
  `grabacion-stop-espontaneo`, pendiente de cosechar `diagnostic_events`).
- Desactivar la auto-pausa de la BD o subir `autoPauseDelay` (ahorro de coste vs
  latencia; no se toca aquí).
- Nada de prompts ni backend de destilado.

## 3. Decisiones

Marcadas por tipo: **[Acordada]** en mesa común; **[Técnica]** reversible/local
que decido como responsable técnico y dejo anotada.

- **D1 [Técnica] — `isTransient` reconoce el timeout de tarn.** Tratar como
  transitorio el `TimeoutError` de tarn ("operation timed out for an unknown
  reason"), que hoy escapa al filtro. Cubre el sub-caso 1 (dentro del
  `withRetry(connect())` ya existente).

- **D2 [Acordada] — Subir los timeouts del *pool*** para que una sola espera
  absorba la reanudación (~60 s) en vez de reventar, **evitando reintentar
  transacciones** (que podrían duplicar inserciones). Cubre el sub-caso 2.
  Trade-off aceptado: si la BD estuviera de verdad caída (no solo pausada), un
  guardado podría esperar más antes de dar error, en vez de fallar rápido.

- **D3 [Técnica] — Warm-up.** Endpoint ligero de solo lectura (p. ej.
  `GET /api/health/db`) que hace un `SELECT 1` a través del reintento. Sin auth:
  no toca datos de usuario, solo despierta la BD. El front lo llama
  *fire-and-forget* (ignora errores, como la telemetría) al **pulsar Grabar** y
  al montar la Fase 1.

- **D4 [Acordada] — "Reintentar" mínimo.** Ante un fallo de `commitSegment`,
  retener el blob + metadatos en estado de módulo y mostrar un banner
  **Reintentar / Descartar**, reutilizando el patrón de la salvaguarda de corte
  externo (`onExternalStop`) sin pisarla. Un único "slot" de blob fallido.

- **D5 [Acordada] — `alwaysOn: true`** en el App Service (gratis en B1: el plan
  se factura 24/7 igual). Elimina el cold-start del *proceso* (parte del
  sub-caso 1). No despausa la BD; es mejora complementaria sin coste.

- **D6 [Acordada] — Un solo SPEC indivisible.** Los cinco items se verifican
  juntos contra el criterio "el escenario del incidente ya no pierde audio";
  trocearlos fragmentaría la verificación.

Ninguna decisión introduce dependencias nuevas de peso, cambios de modelo de
datos ni contratos nuevos entre capas: el warm-up es un endpoint aditivo y el
resto son ajustes locales en `db.js` y en el front.

## 4. Qué se PRESERVA (superficie de regresión)

`src/services/db.js` es el **único** punto de acceso a SQL (sesiones, segmentos,
destilado, diagnostics, usage, y los scripts `migrate`/`seed-prompts`). Todo lo
que se toque ahí debe preservar:

- El **happy path** de todas las operaciones y el **reintento de `connect()`**
  que ya funciona para el cold-start (no romper `withRetry` ni el pool
  memoizado).
- La **semántica transaccional** de `addSegment`/`replaceSegments`
  (`withTransaction`): **no** se envuelve el cuerpo transaccional en reintento
  (riesgo de duplicar). El margen extra se logra por timeouts del pool (D2), no
  reintentando transacciones.
- El **aislamiento por propietario** (owner-scoped) y la forma del objeto sesión.

En el front (`public/js/phases/phase1-capture.js` + `audio-recorder.js`):

- La **salvaguarda de corte externo** existente (`onExternalStop` → banner
  guardar/descartar, `skipGuard` en `commitSegment`) debe seguir funcionando sin
  falsos positivos; el nuevo banner de "Reintentar" no debe colisionar con ella.
- El **contrato del recorder** (`stop()` → `Promise<blob>`, chunks retenidos
  hasta el próximo `start()`) se mantiene.
- Los **eventos de diagnóstico** (`diag.*`) y su flush best-effort no cambian.

## 5. Supuestos, riesgos y preguntas abiertas

- **Supuesto (warm-up):** el ping despierta la *BD* (que queda `resumed` ~60 s),
  no mantiene una conexión viva. En grabaciones >30 s el pool puede reciclar su
  conexión (`idleTimeoutMillis:30s`), pero como la BD ya está despierta,
  reconectar al Detener es rápido (sin cold-start). De aquí que el warm-up sirva
  para dictados largos.
- **Límite aceptado (Reintentar mínimo):** un solo "slot"; un segundo fallo
  consecutivo sobrescribe el blob retenido anterior.
- **Riesgo (D2):** timeouts altos = peor caso más lento ante BD realmente caída.
  Aceptado (mitigado por warm-up + feedback en pantalla).
- **Riesgo (regresión en `db.js`):** afecta a toda la app; la verificación debe
  cubrir el happy path además del escenario de cold-start.
- **Pregunta abierta (a resolver en SPEC/verificación):** valores concretos de
  los timeouts del pool (magnitud ~90-120 s, por afinar contra el tiempo real de
  reanudación) y forma exacta del endpoint de warm-up.

## 6. Criterio de aceptación (para el SPEC)

- **Escenario del incidente:** con la BD pausada y/o el proceso frío, un dictado
  seguido de **Detener** **acaba guardándose sin pérdida** (aunque tarde), y la
  sesión aparece en el histórico.
- **Sin falso rápido:** el error de tarn ya no rompe el flujo; se absorbe por
  reintento/timeout del pool.
- **Warm-up:** al pulsar Grabar se dispara el ping; el guardado posterior no ve
  cold-start si la grabación dio tiempo a reanudar.
- **Reintentar:** si algo falla al subir, el usuario puede recuperar ese audio
  desde el banner, sin recargar la página.
- **Regresión:** flujo normal (BD caliente) intacto; salvaguarda de corte externo
  intacta; transacciones sin duplicados.

## 7. Siguiente fase

Cerrada la Fase 1. Cuando quieras, `/jcc-spec` para redactar el `SPEC.md`
autocontenido (un único spec, D6). Recordatorio metodológico: dejar la "Fase
actual" de `CLAUDE.md` en *análisis* hasta lanzar la especificación.
