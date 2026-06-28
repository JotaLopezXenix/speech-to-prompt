# REVIEW — `grabacion-stop-espontaneo` (fase de diagnóstico)

> JCC Fase 4 (Revisión adversarial INDEPENDIENTE). Fecha: 2026-06-28.
> Revisión hecha por un subagente independiente (no escribió el código) + escrutinio
> propio, contra el SPEC como contrato. Postura: refutar, no aprobar.

## Veredicto

**SÍ cumple el SPEC y no rompe nada.** Contrato de regresión (SPEC §5) íntegro:

- `stop()` conserva `Promise<Blob|null>` (inactivo→`null`; activo→blob vía `onstop`
  persistente). El flag `_intentionalStop` (puesto en `start()`=false y `stop()`=true antes
  del stop nativo, leído síncronamente en `onstop`) **evita falsos positivos** de la
  salvaguarda: un stop intencional nunca cae por la rama externa.
- Pausa/reanudar (`getElapsedSeconds`/`_elapsedBeforePause`), multi-segmento, preview, guard
  de silencio/tamaño e import: intactos (`commitSegment` mantiene el guard por defecto;
  `skipGuard` es opt-in de la salvaguarda).
- Aislamiento por owner: `POST /api/diagnostics` montado con `identity`, usa `req.user.id`.
- Taxonomía §4.8 **completa**: los 13 `event_type` se emiten desde el código.
- SQL `005` válido en un solo batch (sin `GO`), FK e índices correctos, fiel al patrón 001/002.

## Hallazgos (todos de gravedad baja; ninguno bloqueante)

| # | Tipo | Gravedad | Fichero | Resumen | Decisión |
|---|------|----------|---------|---------|----------|
| ① | bug | baja | `phase1-capture.js` (catch de `recorder.start()`) | `runActive` quedaba `true` si fallaba el arranque (sin `endCaptureRun()`) → un `visibility_change` huérfano se asociaría al run muerto hasta el próximo `startCaptureRun`. | **CORREGIDO** |
| ② | bug | baja→media | `diagnostics.js` (`flush()`) | `flush()` enviaba el buffer entero (hasta `BUFFER_CAP=500`) en un POST; el servidor rechaza `>200` con `413` → si el buffer superaba 200, se re-encolaba **todo** y se reintentaba el mismo lote irrompible **para siempre** (nunca drenaba). Pérdida permanente justo de la telemetría que el cambio existe para capturar. | **CORREGIDO** |
| ③ | hueco del SPEC | baja | (SPEC §4.4/§4.8) | "Sospechoso" no incluye la firma H1 por teclado (`viaKeyboard=true`, `isTrusted=true`); solo `isTrusted===false` fuerza flush. El código es **fiel al SPEC**; en la práctica se flushea igual al confirmar el segmento o en `pagehide`. | **No se toca** (el SPEC manda; discutible que convenga) |

## Bucle de cierre 3↔4

El usuario decidió corregir **① y ②** (③ se deja como está). Se volvió a Fase 3:

- **①** — `diag.endCaptureRun()` añadido en el `catch` del arranque
  ([phase1-capture.js](../../../public/js/phases/phase1-capture.js)).
- **②** — `flush()` reescrito para **trocear a ≤100 eventos por POST** (`MAX_BATCH`), reclamar
  cada tanda **antes** del `await` (así `flushBeacon` no la reenvía) y re-encolar por delante
  solo lo no enviado; guarda `flushing` anti-concurrencia (logEvent llama a flush sin await)
  ([diagnostics.js](../../../public/js/diagnostics.js)).

### Re-verificación (en verde)
- Sintaxis OK de ambos ficheros.
- **②** end-to-end contra server+BD vivos (Playwright + módulo real): un run con **250 eventos**
  (sobre el tope de 200) **drena en tandas** → 250 filas persistidas, 250 `seq` distintos
  (sin duplicados), `seq` contiguo 0..249 (sin pérdida). El estado atascado desaparece.
- **①** verificado por inspección + sintaxis (guarda de una línea; el fallo de `start()` no es
  reproducible con micro funcional).
- El resto de la verificación de Fase 3 (esquema, store, ruta HTTP 200/400/413/truncado,
  mecanismo del recorder intencional-sin-falso-positivo / externo-recupera-audio) sigue válida.

## Veredicto final tras el bucle

**Limpio.** Cumple el SPEC, no rompe regresión, y los dos endurecimientos acordados (① y ②)
están aplicados y re-verificados. Pendiente de despliegue: migración `005` en prod (Azure SQL)
+ smoke en navegador logueado.
