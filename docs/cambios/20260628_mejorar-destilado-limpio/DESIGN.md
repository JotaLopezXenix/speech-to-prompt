# DESIGN — Mejorar destilado GPT (modo `limpio`)

**Fecha:** 2026-06-28
**Carpeta:** `docs/cambios/20260628_mejorar-destilado-limpio/`
**Estado:** Análisis (Fase 1 JCC) — pendiente de `/jcc-spec`.
**Antecedente directo:** `docs/cambios/20260626_mejorar-destilado-gpt/` (mismo método, aplicado a `completo`).

---

## Objetivo y problema

El destilador usa `azure-openai / gpt-4.1`. El modo `completo` ya se afinó para GPT en el
cambio anterior. Ahora se hace **lo mismo con el modo `limpio`**: asegurar que su
comportamiento se sostiene ejecutado por GPT y afinar el prompt donde GPT se desvíe.

**Importante — alcance deliberadamente ligero.** El usuario considera que `limpio` **funciona
bien tal y como está hoy**. Esto NO es un rediseño del modo: es un pase de afinado para GPT
más **un único cambio de comportamiento** (la voz, ver decisión 1). No se replantea qué hace
`limpio` ni se añaden capacidades.

### Qué es `limpio` hoy (lo que se PRESERVA)

`limpio` es un **limpiador y estructurador fiel**, no un consultor. Sobre la transcripción
bruta:

- Limpia muletillas, arranques en falso, repeticiones y autocorrecciones verbales.
- Reestructura por temas afines y densifica (quita paja, no contenido).
- Preserva **todas** las ideas sustantivas.
- **NO resuelve ambigüedades ni contradicciones** (preserva ambas versiones).
- **NO sintetiza** preguntas, objetivos ni agenda.
- Marca las inferencias y los nombres dudosos con `[inferido]` y los recoge en una sección
  final **"❓ Preguntas abiertas / supuestos a confirmar"**.
- **NO corrige en silencio** los nombres mal transcritos (eso es de `completo`): los marca
  `[inferido]`.

Destino del resultado: un `brief-crudo.md` que sirve de material de partida para una
entrevista de diseño socrática posterior (o para pegarlo en Claude Code). Todo esto se
**mantiene sin cambios**.

## Decisiones acordadas

### 1. (ESTRUCTURAL — decidida juntos) Preservar la voz/persona del hablante

**Cambio:** `limpio` debe **respetar la persona y el tono del speech** en lugar de
neutralizarlo a impersonal.

- Hoy `limpio` convierte la 1ª persona del dictado ("quiero", "necesito") en impersonal
  burocrático ("se quiere", "hay interés en revisar"). Eso es una **transformación editorial**
  que contradice el carácter fiel del modo.
- Regla nueva: si el hablante habla en 1ª persona, el destilado queda en 1ª persona; si algo
  es neutro, queda neutro; si hay varias voces o citas a terceros, se **atribuyen** (esto ya lo
  cubría la regla 12 actual).
- En la práctica, como los dictados son casi siempre el usuario pensando en voz alta, el
  resultado quedará mayoritariamente en 1ª persona — **pero por fidelidad, no por imposición**.

**Por qué no degrada la calidad:** la diferencia entre `limpio` y `completo` **no es la
persona**, es que `limpio` no resuelve, no cierra, no sintetiza y marca `[inferido]`. Todo eso
sigue intacto, así que preservar la voz no acerca `limpio` a `completo`.

Es reversible (vive solo en el prompt), pero se marca como estructural porque redefine
sutilmente el carácter del modo. **Aprobada por el usuario.**

### 2. Afinar el prompt para GPT (endurecer límites)

El riesgo específico de GPT en este modo **no es compactar** (ese era el de `completo`), sino
el contrario: GPT tiende a "ayudar" y a saltarse los límites duros —resolver ambigüedades,
sintetizar, opinar, o inflar la sección de preguntas— pese a la prohibición. El afinado
codifica esos límites de forma **explícita y literal** (GPT sigue las instrucciones al pie de
la letra), igual que se hizo con `completo`.

### 3. Golden = Session 10

- El golden es la destilación `limpio` de referencia sobre la transcripción cruda de la
  **Session 10** de producción (el dictado más largo registrado en la BD; transcripción
  guardada en esta carpeta como material de eval).
- Como **no existe** ningún golden `limpio` reutilizable (única sesión local en modo `limpio`:
  `data/sessions/2026-06-18T18-14-15.json`, ~478 chars, trivial; todos los dictados largos se
  destilaron en el `completo` antiguo, en 1ª persona, no sirven como referencia de `limpio`),
  el golden se **fabrica**: Claude genera la salida `limpio` de referencia **bajo el spec nuevo**
  (con la voz preservada). Se afina el prompt de GPT hasta igualar esa referencia.
- Se reutiliza el harness `scripts/eval-distill.mjs` (vía `EVAL_PROMPT=src/prompts/openai/limpio.md`
  + la transcripción de Session 10). Detalle mecánico → SPEC.
- **Opcional:** la sesión ID 9 como segundo chequeo de que GPT no sobre-sintetiza en otro
  dictado largo.

### 4. Modelo: se mantiene `gpt-4.1`

Ya elegido por el principio coste-primero en el cambio anterior. No se re-evalúan modelos
salvo que la eval de `limpio` demuestre que `gpt-4.1` no llega al listón.

## Alcance

**Dentro:**
- Reescribir `src/prompts/openai/limpio.md` afinado para GPT + cambio de voz (decisión 1).
- Generar el golden `limpio` (Session 10) y los artefactos de evaluación.
- Validar por eval que GPT iguala el golden.
- Seed del prompt nuevo (`npm run seed-prompts`) y, si procede, despliegue a producción
  (decisión aparte al cerrar).

**Fuera:**
- Modos `completo` / `ligero` / `literal` (no se tocan).
- Familia `claude` del prompt `limpio` (deshabilitada; se actualizará por paralelismo solo si
  se decide explícitamente).
- UI de ajustes; migración de sesiones históricas.
- **Bug de grabación que se detiene sola** (ver más abajo): aparcado; se decide al cerrar la
  sesión si entra aquí o va a un cambio propio.

## Superficie de regresión (qué se preserva)

El cambio es **solo de contenido del prompt** `src/prompts/openai/limpio.md`. No toca código
de runtime. Hay que preservar:

- El **contrato del modo** descrito arriba (fidelidad: no resolver, no sintetizar, `[inferido]`,
  sección de preguntas). El único delta intencionado es la voz.
- El **formato de salida** (documento + sección "❓ Preguntas abiertas", sin preámbulos), que
  consumen la UI de resultado y la persistencia (`distill_mode`, `distill_prompt_used`).
- La mecánica de carga de prompts por `(familia, modo)` y el seed a `dbo.model_prompts`: el
  fichero `openai/limpio.md` es el origen versionado; el runtime lee de la BD tras
  `seed-prompts`. No cambia esta tubería.

## Característica asumida (no es un defecto)

En speeches largos que **evolucionan** (repeticiones, contradicciones involuntarias, ideas que
cambian del principio al final), `limpio` reagrupa por temas y **preserva las contradicciones
lado a lado, sin ordenarlas temporalmente ni decidir cuál prevalece**. Es su contrato de
fidelidad. El usuario lo confirmó: no se añade preservación de cronología ni resolución de
"qué versión es la final". Eso se resuelve en la entrevista socrática posterior, no en el
destilado.

## Supuestos, riesgos y preguntas abiertas

- **Supuesto:** afinar para GPT basta; no hace falta cambiar de modelo. La eval lo confirma o
  lo refuta.
- **Riesgo:** el golden lo fabrica Claude; es un "bueno" definido por Claude bajo el spec
  nuevo, no un artefacto histórico real (como sí lo era el de `completo`). Mitigación: el
  usuario revisa y valida el golden antes de usarlo como listón.
- **Riesgo (GPT):** que GPT no respete "no resolver / no sintetizar" ni siquiera con
  instrucciones duras. Se verá en la eval; si persiste, es un límite conocido del modelo a
  documentar.
- **Pregunta abierta (diferida):** **bug de grabación que se detiene espontáneamente** y salta
  a revisar/destilar. Evidencia confirmada: ocurre en la propia transcripción de Session 10
  ("Algo ha pasado que la grabación se ha detenido sola… ha pasado a la fase… le he vuelto a
  dar a grabar y continúo"); el multi-segmento lo rescató. Inspección inicial de
  `public/js/audio-recorder.js`: **no hay** temporizador de silencio ni `maxDuration` (el único
  `setInterval` es el cronómetro), así que el `stop` viene de fuera (track del micro que
  termina, cambio de dispositivo, o límite del navegador en grabaciones largas). **No se
  diagnostica en este cambio**; se decide su tratamiento al cerrar la sesión.
