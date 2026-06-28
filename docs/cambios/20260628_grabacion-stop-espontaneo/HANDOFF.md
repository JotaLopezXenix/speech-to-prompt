# HANDOFF — bitácora de cierre · `grabacion-stop-espontaneo`

> Foto fechada con evidencia. Fecha: 2026-06-28. La fuente de verdad del estado vivo es la
> línea "Fase actual" del bloque JCC en `CLAUDE.md`; esta bitácora no debe contradecirla.

## Estado metodológico

- **Fase actual:** revisión — **cerrada con veredicto limpio**. Cambio **COMPLETO y desplegado
  a producción**.
- **Siguiente command que toca:** ninguno para este cambio (ciclo JCC terminado). Para el
  trabajo futuro relacionado → `/jcc-design` (ver "Trabajo futuro").
- **Restricciones activas** (lo que una próxima sesión debe respetar):
  - Este cambio fue **solo diagnóstico** por decisión de alcance del usuario. **NO** convertirlo
    retroactivamente en el fix: la UX de recuperación pulida, la prevención por causa, el
    `maxDuration`/rotación y el auto-reanudar son **cambio futuro**, no pendientes de éste.
  - "Qué se PRESERVA" (SPEC §5) sigue vigente: `stop()` debe seguir devolviendo
    `Promise<Blob|null>`; la salvaguarda solo actúa en stop **externo** (flag `_intentionalStop`
    evita falsos positivos); aislamiento por `owner_id`; flujo multi-segmento, pausa/reanudar,
    preview, guard de silencio/tamaño e import intactos.
  - Decisión estructural de la mesa: la telemetría vive en tabla append-only
    `dbo.diagnostic_events` (no logs) + `POST /api/diagnostics` en lote, owner-scoped.
  - Hueco **③** del SPEC dejado a propósito: "sospechoso" no incluye la activación por teclado
    (`viaKeyboard=true`); el código es fiel al SPEC. Si se reabre, enmendar el SPEC con ADDENDUM.
- **Evidencia del estado / artefactos:**
  - `docs/cambios/20260628_grabacion-stop-espontaneo/`: `DESIGN.md`, `SPEC.md`, `REVIEW.md`,
    este `HANDOFF.md`.
  - Código: `migrations/005_diagnostics.sql`, `src/services/diagnostics-store.js`,
    `src/routes/diagnostics.js`, `server.js` (router montado con `identity`),
    `public/js/diagnostics.js`, `public/js/api-client.js`, `public/js/audio-recorder.js`,
    `public/js/phases/phase1-capture.js`.
  - Commits en `main` (pusheados): `138bb7c` (implementación), `26e16ee` (correcciones de
    review), `46e6cd0` (doc de despliegue).

## Qué se hizo

Diagnóstico (NO fix) del bug "la grabación se detiene sola". Tres piezas:
1. **Instrumentación en dos capas** para distinguir H1 (activación accidental del botón:
   `record_button_activated` con `isTrusted`/teclado/foco + `mediasession_action`) de H2 (stop
   externo real: `recorder_stop_external`, `recorder_error`, `track_ended/muted/unmuted`,
   `visibility_change`).
2. **Persistencia backend**: tabla `dbo.diagnostic_events` (append-only, owner-scoped,
   `session_id` soft-ref sin FK, `capture_run_id`+`seq` para orden determinista) +
   `POST /api/diagnostics` (best-effort, ≤200 ev/lote, payload ≤8 KB) + store/route.
3. **Salvaguarda mínima**: ante stop externo, recupera el blob de `chunks`, descongela la UI
   (`updateUI`) y ofrece **Guardar/Descartar** el tramo (reutiliza `confirmRecoveredAudio` +
   `commitSegment` con `skipGuard`).

Correcciones del bucle de review (3↔4): ① `endCaptureRun()` en el catch del arranque (run
colgado); ② `flush()` troceado a ≤100/POST con guarda `flushing` (antes enviaba el buffer
entero y se atascaba en 413 si superaba 200).

## Qué se verificó — con evidencia real

**Local (sin coste STT):**
- Sintaxis OK de los 7 ficheros tocados (`node --check`).
- `npm run migrate` → `✔ aplicada 005_diagnostics.sql`.
- Esquema + store (script Node sobre BD local): 13/13 checks OK — `session_id` NULLABLE,
  `capture_run_id` NVARCHAR(64), `event_type` VARCHAR(40), índices `IX_diag_owner_ts` +
  `IX_diag_run_seq`, única FK `FK_diag_owner`, insert/relectura por `seq`, `client_ts` parsea
  ISO y cae a NULL si inválido, `session_id` soft-ref persistido, `server_ts` por defecto.
- Ruta HTTP e2e (server vivo): 200 (`inserted:1`), 400 (vacío/sin events/inválidos), 413 (>200),
  payload >8 KB → `_truncated:true` y len≈8 KB.
- Mecanismo del recorder con **MediaRecorder real** (Playwright + módulo real):
  parada **intencional** → blob 2639 B, **NO** dispara salvaguarda (sin falso positivo);
  parada **externa** (`track.stop()`) → `onExternalStop` con audio recuperado (2738 B) +
  `recorder_stop_external`; recorder queda `inactive`.
- Lazo cliente→BD: el auto-flush en evento sospechoso persistió los eventos (vía `api-client`).
- Re-verificación del fix ②: run con **250 eventos** (sobre el tope de 200) **drena en tandas**
  → 250 filas, 250 `seq` distintos (sin duplicados), `seq` contiguo 0..249 (sin pérdida).
- App arranca en navegador con **0 errores de consola**.

**Producción:**
- Push `main` → GitHub Actions run `28321567434` → **success**.
- Migración `005` aplicada en Azure SQL (`sql-speech-to-prompt`, `SQL_AUTH=entra-default`+`az
  login`); verificado en prod: `005_diagnostics.sql` en `schema_migrations`,
  `dbo.diagnostic_events` con **9 columnas** + índices `IX_diag_owner_ts`/`IX_diag_run_seq`.
- App Service `Running`, responde **HTTP 401** (Easy Auth activo).
- **Smoke funcional logueado (usuario, en prod):** provocado el corte externo → apareció el
  aviso "La grabación se detuvo de forma inesperada… ¿Guardar este tramo? [Guardar/Descartar]".
  Confirmado por el usuario con captura de pantalla.

## Cómo retomar / Trabajo futuro

- **Cosechar datos:** a partir de ahora cada corte espontáneo real deja filas en
  `dbo.diagnostic_events` (prod). Para clasificar H1 vs H2, consultar por `capture_run_id`
  ordenando por `seq` y mirar la secuencia de `event_type` alrededor del corte (¿hubo
  `record_button_activated` no fiable / `mediasession_action` → H1? ¿`track_ended` /
  `recorder_stop_external` / `visibility_change` → H2?).
- **Cambio futuro de robustez** (nuevo ciclo JCC, empezar por `/jcc-design`): con esos datos,
  diseñar el fix definitivo de la causa raíz confirmada (prevención específica, UX de
  recuperación pulida, continuación sin fricción, `maxDuration`/rotación).
- **Pendiente menor conocido:** `track_ended` solo se emite con muerte real del micro; el
  `stop()` programático no dispara `ended` (por spec). El `recorder_stop_external` cubre H2 igual.

## Decisiones "en caliente" al final de la sesión (releer en frío)

- Ninguna decisión estructural tomada apresuradamente. El despliegue siguió el procedimiento ya
  establecido (push a `main` + migración con env inline + `az login`). El commit de docs
  `46e6cd0` también disparó un redeploy (inocuo, solo documentación).
