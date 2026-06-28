# SPEC — Prompt `openai/limpio` afinado para GPT (+ voz preservada)

**Cambio:** `docs/cambios/20260628_mejorar-destilado-limpio/`
**Por qué:** ver DESIGN.md — `limpio` funciona bien; este cambio lo afina para GPT-4.1 (endurecer
límites que GPT se salta) y aplica **un único cambio de comportamiento**: preservar la voz/persona
del hablante en vez de neutralizar a impersonal. Salida destinada a Claude Code.

---

## 1. Resumen

Reescribir `src/prompts/openai/limpio.md` afinado para GPT, preservando el contrato actual del
modo salvo la regla de voz (deja de neutralizar a impersonal; respeta la persona del hablante).
Validar por evaluación empírica contra un golden fabricado sobre la transcripción de Session 10,
reusando `scripts/eval-distill.mjs` (con un pequeño override de carpeta de salida). Desplegar vía
`npm run seed-prompts`.

## 2. Stack y arquitectura (encaje en lo existente)

Sin stack nuevo. El prompt `limpio` es un fichero Markdown versionado en
`src/prompts/openai/limpio.md` que `npm run seed-prompts` sube a `dbo.model_prompts`
(`family='openai', mode='limpio'`), que es la fuente en runtime. `src/routes/distill.js` carga
el prompt por `(familia del modelo activo, modo)`; el modelo activo es `gpt-4.1`. **No se toca
código de runtime** (ni `prompts.js`, ni `distill.js`, ni esquema DB). La única modificación de
código es de tooling de evaluación (`scripts/eval-distill.mjs`).

## 3. Delta

**MODIFIED**
- `src/prompts/openai/limpio.md` — contenido afinado (ver §4). Origen: `eval/prompts/limpio-gpt-vN.md`
  (la última iteración que iguale el golden).
- `scripts/eval-distill.mjs` — añadir override `EVAL_OUT_DIR` (env) para la carpeta de artefactos,
  con el valor actual como defecto (backward-compatible). Ver §5.

**ADDED**
- `docs/cambios/20260628_mejorar-destilado-limpio/eval/session10-transcription-raw.txt` — material
  de partida (ya creado en Fase 1).
- `docs/cambios/20260628_mejorar-destilado-limpio/eval/session10.json` — sesión de eval:
  `{ transcription_raw, prompt_distilled }` con el golden fabricado (ver §6).
- `docs/cambios/20260628_mejorar-destilado-limpio/eval/prompts/limpio-gpt-vN.md` — iteraciones del
  prompt.
- `docs/cambios/20260628_mejorar-destilado-limpio/eval/golden__session10.md` y `eval/out/…` —
  artefactos que genera el script.

**SIN CAMBIOS**
- `openai/completo.md`, `ligero.md`, `literal.md`; toda la familia `claude/`; `src/services/prompts.js`;
  `src/routes/distill.js`; esquema DB; `dbo.llm_models` (modelo `gpt-4.1` se mantiene).

## 4. Contenido del prompt (delta frente al actual)

El texto final vive en `src/prompts/openai/limpio.md`. Cambios frente al original:

- **Voz (cambio de comportamiento).** Sustituir la regla 11 actual ("NO IMPONGAS un marco
  narrativo… Como mucho, una línea de tema neutral") por:
  > **PRESERVA la voz y la persona del hablante.** Si habla en 1ª persona ("quiero", "necesito"),
  > el documento queda en 1ª persona. Si algo es neutro, queda neutro. **NO** conviertas la 1ª
  > persona del dictado a impersonal ("se quiere", "hay interés en…") ni a 3ª persona ("el usuario
  > quiere"): eso es una transformación editorial que falta a la fidelidad. El título/tema inicial
  > sigue siendo una línea descriptiva, sin objetivos ni intenciones inventadas.
  - La regla 12 (no fundir voces; atribuir interlocutores distintos) **se mantiene** y convive con
    esto: preservar la voz no significa forzar 1ª persona cuando hay varias voces o citas a terceros.
- **Afinado para GPT (endurecer límites).** Reforzar de forma explícita y literal, porque GPT
  tiende a "ayudar" y saltarse estos límites:
  - **NO resolver** ambigüedades ni contradicciones (preservar ambas versiones).
  - **NO sintetizar** objetivos, agenda, "próximos pasos" ni "preguntas a explorar"; la única lista
    de preguntas es la de ambigüedades/inferencias a confirmar.
  - **NO opinar** ni añadir análisis/sugerencias/conocimiento externo.
  - **NO inflar** la sección de preguntas: solo ambigüedades reales, contradicciones y
    reconstrucciones dudosas; una por línea.
- **Intacto:** limpiar (muletillas/arranques/repeticiones/autocorrecciones), corregir siglas
  deletreadas (rule 2), preservar idioma y todas las ideas sustantivas, reestructurar por temas
  afines, densificar, marcar `[inferido]` en inferencias y nombres dudosos, **no corregir nombres
  en silencio** (a diferencia de `completo`), formato de salida con sección final
  "❓ Preguntas abiertas / supuestos a confirmar".

## 5. Interfaces y contratos

### 5.1 `scripts/eval-distill.mjs` — override `EVAL_OUT_DIR`

- Nueva variable de entorno **`EVAL_OUT_DIR`** (ruta relativa a la raíz del repo o absoluta).
- Si está definida, `EVAL_DIR = EVAL_OUT_DIR`; si no, mantiene el valor actual
  (`docs/cambios/20260626_mejorar-destilado-gpt/eval`). `OUT_DIR = join(EVAL_DIR, 'out')` como hoy.
- Resto del contrato del script intacto: lee `SESSION_JSON` (default actual), `EVAL_PROMPT`
  (default `src/prompts/openai/completo.md`), `EVAL_TAG`; escribe `golden__<id>.md` y
  `out/<id>__<modelo>[.tag].md`; no toca BD ni gating.

### 5.2 Formato de salida del prompt `limpio` (contrato consumido por UI/persistencia)

Invariante (no cambia): documento Markdown sin preámbulo, con título de tema opcional, cuerpo
reestructurado, y al final:
```
---
## ❓ Preguntas abiertas / supuestos a confirmar
- …
```

### 5.3 Criterios de aceptación del golden (definición operativa de "bueno")

La salida `limpio` de GPT, comparada con el golden sobre Session 10, debe:

1. **Voz preservada:** 1ª persona (porque el dictado es en 1ª persona); **sin** "se quiere"/"el usuario".
2. **Fidelidad:** no resuelve ambigüedades ni contradicciones; preserva las dos posturas sobre
   "completo vs limpio" (al principio creía completo mejor → luego vio que omitía detalles).
3. **Sin síntesis ni opinión:** no inventa objetivos, agenda ni recomendaciones.
4. **Cobertura de ideas sustantivas:** evolución del pensamiento en speeches largos; repeticiones/
   contradicciones involuntarias; motivo de añadir `limpio`; objetivo de afinar para GPT con salida
   a Claude; mención del bug de grabación detenida; candidatura de este speech como golden; ID 9 como
   alternativa más corta; revisar los JSON locales.
5. **`[inferido]`:** marca al menos **PROM** (probable "Prompt") y **AUNE** (probable "Claude"), y
   "Claudio"→Claude; las recoge en preguntas abiertas. Las siglas/números claramente deletreados sí
   se normalizan (criterio rule 2; p. ej. "GPT 401"→"GPT-4.1" si se considera artefacto de número,
   o se marca `[inferido]` si hay duda — lo calibra la eval).
6. **Sección "❓ Preguntas abiertas"** presente y no vacía.
7. **No colapsa con `completo`:** no fuerza cierre ni 1ª-persona-reconstruida-resolviendo dudas.

Comparación a ojo (Claude de juez), igual que en `completo`. No hay scoring automático.

## 6. Migración de datos

No hay migración de esquema ni de sesiones. Se crea un artefacto de eval `eval/session10.json`
(solo `transcription_raw` + `prompt_distilled`=golden) para alimentar el script; no entra en la BD
ni en `data/sessions/`. El prompt nuevo se propaga a producción con `npm run seed-prompts` (decisión
de despliegue aparte, al cierre).

## 7. Qué se PRESERVA (regresión)

- **Contrato del modo `limpio`** salvo la voz: sigue siendo limpiador fiel que **no resuelve, no
  sintetiza, no opina**, marca `[inferido]`, lista preguntas abiertas y **no corrige nombres en
  silencio**. El único delta intencionado es la voz (impersonal → voz del hablante).
- **Distinción entre modos:** `completo` (1ª persona, cerrado, corrige nombres, sin preguntas-meta)
  y `limpio` (fiel, abierto, `[inferido]`, preguntas) **no deben solaparse**. Tras el cambio,
  ambos quedan en 1ª persona cuando el dictado lo es, pero siguen difiriendo en resolver/sintetizar.
- **Tubería de prompts:** carga por `(familia, modo)`, seed a `dbo.model_prompts`, override de system
  prompt por sesión con prioridad sobre el de BD. Formato de salida consumido por UI de resultado y
  persistencia (`distill_mode`, `distill_prompt_used`).
- **Backward-compat del script de eval:** sin `EVAL_OUT_DIR`, `eval-distill.mjs` se comporta
  exactamente igual que antes (artefactos en la carpeta del cambio `20260626`).

## 8. Fuera de alcance

- Modos `completo` / `ligero` / `literal` (no se tocan).
- Familia `claude` del prompt `limpio` (deshabilitada; se actualizaría por paralelismo solo si se
  decide explícitamente).
- Re-evaluación de modelos (`gpt-4.1` se mantiene salvo que la eval demuestre que no llega).
- UI de ajustes; migración de sesiones históricas.
- **Bug de grabación que se detiene sola** (aparcado; decisión al cierre de sesión).
- Despliegue a producción (decisión aparte al cerrar).

## 9. Verificación

1. **Override del script (regresión + nuevo):**
   - Sin `EVAL_OUT_DIR`: `node --env-file-if-exists=.env scripts/eval-distill.mjs gpt-4.1` se comporta
     como antes (artefactos en `20260626…/eval`).
   - Con `EVAL_OUT_DIR=docs/cambios/20260628_mejorar-destilado-limpio/eval`,
     `EVAL_PROMPT=src/prompts/openai/limpio.md`, `SESSION_JSON=docs/cambios/20260628_mejorar-destilado-limpio/eval/session10.json`:
     genera `eval/golden__session10.md` y `eval/out/session10__gpt-4.1.md` en la carpeta de este cambio.
2. **Calidad:** la salida GPT cumple los 7 criterios de §5.3 frente al golden. Iterar el prompt
   (`limpio-gpt-vN.md`) hasta lograrlo; copiar la versión ganadora a `src/prompts/openai/limpio.md`.
3. **Seed:** `npm run seed-prompts` → confirmar que `dbo.model_prompts (family='openai', mode='limpio')`
   contiene el texto nuevo.
4. **End-to-end en la app:** destilar una sesión larga en modo `limpio` → documento fiel, en la voz
   del hablante (1ª persona), con `[inferido]` + sección "❓ Preguntas abiertas", sin síntesis ni
   resolución de ambigüedades.
5. **No-solape (regresión de modos):** la misma sesión en modo `completo` → brief cerrado en 1ª
   persona, sin `[inferido]` ni preguntas-meta. Confirma que `limpio` y `completo` siguen siendo
   distintos pese a compartir ahora la 1ª persona.
6. **Override de system prompt por sesión** → sigue teniendo prioridad sobre el de BD.
