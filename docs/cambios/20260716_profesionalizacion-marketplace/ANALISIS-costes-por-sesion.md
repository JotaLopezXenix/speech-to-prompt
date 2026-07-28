# Análisis — coste variable por sesión (datos reales de producción)

**Fecha:** 27-jul-2026 · **Tipo:** análisis transversal del programa (spike, sin código).
**Por qué existe:** para configurar los modos de venta en Marketplace hace falta saber cuánto cuesta una sesión. Se planteó adelantar los ciclos 4 y 5 para averiguarlo; el DESIGN del programa ya decía que *"los datos ya existen en `usage_events`/`model_prices`; falta la superficie"*, así que se resolvió con una consulta de solo lectura a producción en lugar de dos ciclos.
**Alimenta:** el modelo de precio del ciclo 3 (SPEC-06 y decisión de negocio), la elección de modelo del **ciclo 4**, y la superficie de costes + fair-use del **ciclo 5**.

## 1. Método

Consulta **de solo lectura** a la BD de producción (`sql-speech-to-prompt` / `db-speech-to-prompt`, identidad Entra del desarrollador, sin cargar `.env` local), cruzando `usage_events` con `sessions` y derivando el coste con **el mismo `pricing.js` que usa la app**, para que la aritmética no divergiera de la del producto.

**Ventana:** 25-jun-2026 → 24-jul-2026 (un mes). **31 sesiones** en la BD, **28 con uso registrado**, **55 eventos**, **1 solo usuario** (Jesús; Agustín no había entrado aún). Modelos en uso: `azure-whisper:whisper-large-v3` (STT) y `azure-openai:gpt-4.1` (destilado).

## 2. Hallazgo que hay que leer primero: el coste de STT no se está midiendo

El cálculo directo da **STT = $0.00**, lo cual es imposible en un producto de dictado. La causa son **dos defectos independientes**, ambos confirmados contra la BD:

1. **`audio_seconds` es NULL en los 31 eventos STT** (100%), y `segments.duration_seconds` es NULL en los 31 segmentos. La duración la mide [`probeDuration`](../../../src/services/audio-normalize.js), que invoca **`ffprobe`** y devuelve `null` si falla: `ffmpeg`/`ffprobe` **no está instalado en el App Service**. Es coherente con el diseño (ffmpeg es opcional y degrada elegantemente), pero el efecto colateral es que **en producción no se registra ni un segundo de audio**.
2. **La clave de precio no coincide.** Se registra `azure-whisper:whisper-large-v3`; la tarifa sembrada es `azure-whisper:whisper`. `estimateCost` no encuentra tarifa → devuelve coste 0 con `priced:false`. Aunque hubiera duración, el coste seguiría saliendo 0.

**Consecuencia metodológica:** el supuesto del DESIGN del programa (*"los datos ya existen"*) es **cierto para el LLM y falso para el STT**. El ciclo 5 no puede limitarse a "poner la superficie": tiene que arreglar la medición primero, o mostrará costes sistemáticamente subestimados.

**Corrección recomendada (no se aplica en este análisis):** la duración **ya la mide el frontend** (`getElapsedSeconds` del grabador), así que enviarla con el upload es más robusto y más barato que instalar ffmpeg en el App Service — pero toca el contrato de la API y merece su spec. La clave de precio es una fila de SQL. Arreglar **solo** la clave no sirve de nada mientras la duración sea NULL.

## 3. Los números

### 3.1 LLM — dato real, precio verificable

| | mín | mediana | media | p90 | máx |
|---|---|---|---|---|---|
| Coste LLM / sesión | $0.0000 | $0.0053 | **$0.0073** | $0.0205 | $0.0242 |

Total del mes: **$0.2051**. Tokens reales: **53.193 entrada · 12.333 salida**. Mediana de 1 destilado por sesión (máx 2).

### 3.2 STT — estimado por proxy

Sin `audio_seconds`, se estima la duración desde los **caracteres transcritos** (74.620 en 28 sesiones), a una cadencia de dictado en español de **800–1.100 caracteres/minuto**:

| Cadencia supuesta | Minutos del mes | Coste STT (@ $0.006/min) |
|---|---|---|
| 800 chars/min (lento) | 93 min | $0.56 |
| **950 chars/min (central)** | **79 min** | **$0.47** |
| 1.100 chars/min (rápido) | 68 min | $0.41 |

### 3.3 Estructura de coste real (el titular)

| Componente | Coste del mes | Peso |
|---|---|---|
| STT (Whisper) | ~$0.47 | **~70%** |
| LLM (gpt-4.1) | $0.21 | ~30% |
| **Total** | **~$0.68** | |

**El coste está dominado por la transcripción, no por el destilado** — exactamente el componente que hoy no se mide. Con el cálculo tal cual está, la app subestima su coste variable en un factor de ~3.

**Coste medio por sesión: ~$0.024.** La sesión más cara del mes (id 23, 15.941 caracteres ≈ 15–20 min de dictado): **~$0.13**.

## 4. Proyección por cliente y mes

Ratios derivados de los datos reales (0,713 tokens de entrada y 0,165 de salida por carácter transcrito; la entrada incluye el system prompt repetido en cada llamada, así que sobreestima en sesiones largas):

| Perfil de cliente | Volumen | STT | LLM (gpt-4.1) | **Total/mes** |
|---|---|---|---|---|
| Ligero | 10 sesiones × 3 min | $0.18 | $0.07 | **~$0.25** |
| Medio | 30 sesiones × 5 min | $0.90 | $0.39 | **~$1.30** |
| Intenso | 1 h/día laborable (1.200 min) | $7.20 | $3.14 | **~$10.30** |

**Y el mismo cliente intenso, cambiando solo el destilador** (lo que decide el ciclo 4):

| Destilador | Total/mes del cliente intenso |
|---|---|
| gpt-4.1-mini | ~$7.8 |
| **gpt-4.1 (actual)** | **~$10.3** |
| claude-sonnet-4-6 | ~$12.9 |
| claude-opus-4-7 | **~$33.6** |

## 5. Conclusiones para el modelo de venta

1. **El coste variable es marginal frente a cualquier precio de venta plausible.** Un cliente medio cuesta ~$1,30/mes; el más intenso imaginable, ~$10/mes con el destilador actual. Una tarifa plana de dos dígitos en euros los absorbe con holgura.
2. **Por tanto, el *metered billing* no está justificado por la estructura de costes.** Montar dimensiones de consumo, la Metering API y su reconciliación para repercutir céntimos añade complejidad y superficie de error sin proteger márgenes. La lectura de los datos apunta a **tarifa plana + tope fair-use** (que es justamente el ciclo 5), no a pay-as-you-go.
3. **La palanca de coste real es la elección del modelo en el ciclo 4, no el volumen de sesiones.** Pasar el destilador a Opus multiplica el coste del LLM por ~8 y triplica el total del cliente intenso. Esa decisión mueve el coste diez veces más que el número de sesiones.
4. **Riesgo a acotar:** el usuario patológico. Nada impide hoy dictar 8 h al día. El tope fair-use del ciclo 5 es la mitigación adecuada, y ahora hay datos para calibrarlo.

## 6. Límites de este análisis (leer antes de fijar un precio)

- **Un solo usuario y 28 sesiones**, en buena medida pruebas de desarrollo (la mediana de transcripción son ~2.100 caracteres, unos 2 minutos). Da **coste por sesión** con solidez razonable; **no** da el volumen que hará un cliente real: ese supuesto es juicio de negocio, no dato.
- **El coste de STT es una estimación por proxy**, no una medición. Su exactitud depende de la cadencia de dictado supuesta. Se convierte en dato real en cuanto se arregle §2.
- **Los precios sembrados están marcados como aproximados** en las migraciones 002/003. Los de `gpt-4.1` (2/8 USD por millón) y Azure Whisper (0,006 USD/min) cuadran con la tarifa pública de Azure, pero conviene confirmarlos antes de publicar un precio.
- **No incluye coste fijo de infraestructura** (App Service B1, SQL Serverless, Storage, red privada), que es el que realmente marca el suelo del precio y no depende del uso.

## 7. Siguientes pasos que sugiere el análisis

1. Llevar estos números a la **reunión del 29-jul** (preguntas A1–A4 del [brief](ciclo-3-marketplace-transactable/BRIEF-reunion-isv-success-2026-07-29.md)): con coste variable de céntimos, la pregunta a Microsoft se afila — *¿podemos publicar con tarifa plana y añadir metering después sin recertificar?*
2. **Decisión de negocio** (Agustín + Jesús): tarifa plana vs. pay-as-you-go, informada por §5.
3. **Arreglar la medición del STT** (§2) — pertenece al ciclo 5, y conviene antes de que el ciclo 5 construya su superficie sobre un cálculo que subestima el 70% del coste.
4. **Calcular el coste fijo de infraestructura** para fijar el suelo del precio (fuera del alcance de este spike).
