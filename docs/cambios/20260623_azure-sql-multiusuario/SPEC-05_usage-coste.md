# Flujo 5 — Registro de uso + coste por sesión — SPEC técnico

**Fecha:** 2026-06-23
**Tipo:** delta-spec de implementación del flujo 5 del cambio.
**Depende de:** [`DESIGN.md`](DESIGN.md) (D8, D9) y los flujos 1-3 ya construidos.

> **Trazabilidad.** Concreta el **flujo 5** de `DESIGN.md §9`: registrar el consumo de cada llamada a modelo (STT y LLM) en una tabla **append-only** y **derivar** el coste de un mapa de precios. Activa el "registro de llamadas/coste" (D9); el versionado de texto sigue fuera de alcance. **Totalmente verificable en local.**

---

## 1. Objetivo

Saber el **coste aproximado de cada sesión**. Para ello: por cada llamada a un modelo se inserta una fila en `usage_events` con las **cantidades crudas** (tokens in/out del LLM; segundos de audio del STT), nunca el coste "congelado". El coste se **calcula** a partir de un **mapa de precios por modelo** editable, de modo que sobrevive a cambios de tarifa y al cambio de procesadores (flujo 4).

---

## 2. Esquema (migración `002_usage_and_prices.sql`)

```sql
CREATE TABLE dbo.usage_events (
  id            INT IDENTITY(1,1) CONSTRAINT PK_usage_events PRIMARY KEY,
  session_id    INT NOT NULL,
  segment_id    INT NULL,              -- referencia BLANDA (sin FK): sobrevive al reprocess que recrea segmentos
  kind          VARCHAR(10) NOT NULL,  -- 'stt' | 'llm'
  provider      VARCHAR(40) NOT NULL,
  model         VARCHAR(60) NOT NULL,
  input_tokens  INT NULL,              -- LLM
  output_tokens INT NULL,              -- LLM
  audio_seconds INT NULL,              -- STT
  created_at    DATETIME2(3) NOT NULL CONSTRAINT DF_usage_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_usage_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(id) ON DELETE CASCADE
);
CREATE INDEX IX_usage_session ON dbo.usage_events(session_id);

CREATE TABLE dbo.model_prices (
  provider           VARCHAR(40) NOT NULL,
  model              VARCHAR(60) NOT NULL,
  kind               VARCHAR(10) NOT NULL,        -- 'stt' | 'llm'
  input_per_million  DECIMAL(12,6) NULL,          -- LLM: USD / millón de tokens entrada
  output_per_million DECIMAL(12,6) NULL,          -- LLM: USD / millón de tokens salida
  per_audio_minute   DECIMAL(12,6) NULL,          -- STT: USD / minuto de audio
  currency           CHAR(3) NOT NULL CONSTRAINT DF_prices_currency DEFAULT 'USD',
  updated_at         DATETIME2(3) NOT NULL CONSTRAINT DF_prices_updated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_model_prices PRIMARY KEY (provider, model)
);
-- + INSERTs de seed con valores APROXIMADOS (A VERIFICAR) para los modelos en uso.
```

- **`segment_id` sin FK** a propósito: el reprocess borra y recrea segmentos (ids nuevos); un FK con CASCADE borraría el histórico de coste. Es una referencia informativa.
- **`session_id` con CASCADE**: al borrar una sesión se borra su uso (coherente para una herramienta interna).
- **`model_prices` se siembra** en la migración con valores aproximados; a partir de ahí se **edita a mano por SQL/SSMS** (sin re-desplegar). Un **backoffice** futuro permitirá editarlos por UI (anotado en `DESIGN §12`).

---

## 3. Precios — tabla `model_prices` + `src/services/pricing.js` (nuevo)

Decisión (del usuario): los precios viven como **datos en la BD** (`model_prices`), no en un fichero. **LLM**: USD por millón de tokens (in/out). **STT**: USD por minuto de audio.

- Valores **APROXIMADOS — A VERIFICAR** (y a actualizar al cambiar de procesador en el flujo 4). El coste resultante es una **estimación** y se etiqueta como tal en la UI.
- `pricing.js` lee la tabla (cacheada en memoria; `clearPriceCache()` para refrescar tras editar). `estimateCost(event, priceMap)` → `{ usd, priced }` (priced=false si el modelo no está en la tabla). `summarizeCost(events)` → `{ currency, stt, llm, total, unpriced }`.
- Ajustar precios = `UPDATE dbo.model_prices …` por SQL; sin tocar código ni desplegar.

---

## 4. Registro del uso — `src/services/usage-store.js` (nuevo)

- `recordUsage({ sessionId, segmentId?, kind, provider, model, inputTokens?, outputTokens?, audioSeconds? })` — INSERT append-only.
- `getSessionUsage(sessionId, callerId)` — devuelve `{ events, cost }`; **JOIN con `sessions` filtrando por `owner_id`** (aislamiento en la capa de datos, igual que el flujo 2).

**Dónde se registra (el registro NUNCA rompe el flujo del usuario — va en try/catch que solo loguea):**
- **STT** en `transcribe.js`: tras transcribir un segmento (alta) → un evento `stt` con `audio_seconds = duración`. En **reprocess**: un evento `stt` por segmento re-transcrito.
- **LLM** en `distill.js`: tras `provider.distill()` → un evento `llm` con `input_tokens`/`output_tokens` del `usage` que ya devuelve el proveedor.

---

## 5. Endpoint + UI

- **`GET /api/sessions/:id/usage`** (en `sessions.js`, bajo `identity`): `getSession(id, req.user.id)` → 404 si no es suya; luego `getSessionUsage(id, req.user.id)` → `{ events, cost }`.
- **UI mínima (fase 5, Resultado):** al mostrar el resultado, `api-client.getSessionUsage(id)` y se pinta **"Coste estimado (aprox.): $X.XXXX"** con desglose STT/LLM. Es la superficie que responde a "saber el coste de la sesión".
- **Vista de coste en el historial** (coste por fila en todas las sesiones): **diferida** — se haría con un endpoint de resumen por lotes; fuera de alcance de este flujo.

---

## 6. Qué se PRESERVA / qué cambia

**Preservado:** forma del objeto sesión y de `listSessions` (el coste va por un endpoint aparte, no se mete en el objeto sesión); las 4 fases (la 5 gana un dato, aditivo); aislamiento del flujo 2.

**Cambia:** nueva migración `002_usage_events.sql`; nuevos `src/services/pricing.js` y `src/services/usage-store.js`; `transcribe.js` y `distill.js` registran uso (try/catch, no bloqueante); nuevo `GET /:id/usage`; `api-client.js` + `phase5-result.js` muestran el coste. Sin nuevas dependencias.

---

## 7. Verificación (criterios de aceptación)

- `npm run migrate` aplica `002` (idempotente).
- **Humo** (sin HTTP): `recordUsage` de eventos stt+llm para una sesión; `getSessionUsage` los devuelve con `cost` correcto; `estimateCost` calcula bien stt (por minuto) y llm (por millón); modelo desconocido → `priced:false` y cuenta en `unpriced`; un `callerId` ajeno no ve los eventos (JOIN por dueño).
- **End-to-end** (tu navegador): grabar+destilar deja eventos; la fase 5 muestra el coste estimado.

---

## 8. Riesgos

- **Precios aproximados:** el coste es una estimación; depende de mantener `pricing.js` al día (sobre todo tras el flujo 4). Etiquetado "aprox." en la UI.
- **`segment_id` sin FK:** referencia blanda; aceptado para que el log sobreviva al reprocess.
- **Registro no transaccional con la llamada al modelo:** si la inserción de uso falla, se loguea y el flujo continúa (no se pierde la transcripción/destilación); se podría perder algún evento de coste en un fallo de BD puntual. Aceptable para una estimación.
