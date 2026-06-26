# SPEC-01 — Prompt `openai/completo` afinado para GPT

**Cambio:** `docs/cambios/20260626_mejorar-destilado-gpt/`
**Por qué:** ver DESIGN.md — `completo` debe producir un brief en 1ª persona, cerrado y denso, comparable al golden de Sonnet, pero ejecutado por GPT (instrucciones explícitas) y destinado a Claude Code.

> Sustituye al SPEC-01 original (que prescribía una reescritura **neutra** con `[inferido]` + preguntas abiertas). Esa dirección era errónea —colapsaba `completo` con `limpio`— y se revirtió.

---

## 1. Resumen

Reescribir `src/prompts/openai/completo.md` con un prompt afinado para GPT que reproduzca los rasgos del golden (1ª persona, brief cerrado, corrección de nombres mal transcritos, densidad sin pérdida de datos). Desplegar vía `npm run seed-prompts`.

## 2. Delta

**MODIFIED**
- `src/prompts/openai/completo.md` — contenido reemplazado por la versión afinada (origen: `eval/prompts/completo-gpt-v3.md`).

**SIN CAMBIOS**
- `openai/ligero.md`, `literal.md`, `limpio.md`; familia `claude/`; `src/services/prompts.js`; `src/routes/distill.js`; esquema DB.

## 3. Contenido del prompt

El texto final vive en `src/prompts/openai/completo.md` (idéntico a `eval/prompts/completo-gpt-v3.md`). Puntos clave frente al original:

- **Destino explícito:** primer turno de una sesión de Claude Code (diseño socrático). 1ª persona.
- **Densidad y fidelidad:** densificar el lenguaje, no el contenido; longitud **proporcional al contenido sustantivo** (no fija); **no sacrificar datos concretos** (cifras, conteos, nombres, síntomas) por brevedad en dictados largos.
- **Modo cerrado:** resolver ambigüedades; **sin** `[inferido]` ni sección meta de preguntas abiertas (las dudas reales van como contenido en 1ª persona).
- **Corrección de transcripción ampliada:** además de siglas deletreadas, **corregir nombres propios/marcas/modelos/librerías mal transcritos** (Cloud→Claude, Antropic→Anthropic, Claude Code…), incluidos nombres de nicho. Guardarraíl: ante duda con un nombre poco común, conservar el oído, **nunca** sustituirlo por otro distinto.

## 4. Evaluación (cómo se validó)

- Script: `scripts/eval-distill.mjs` (re-destila una sesión de `data/sessions/` con N modelos/prompt; artefactos en `eval/out/`, golden por sesión en `eval/golden__*.md`). No toca BD ni gating.
- Iteraciones del prompt: v2 (corrige nombres + densidad) → v3 (añade preservación de datos concretos en dictados largos + guardarraíl de nombres). Ver `eval/prompts/`.
- Cobertura: 5 sesiones Sonnet largas y de dominios distintos. `gpt-4.1` + v3 quedó comparable al golden; ver DESIGN §Resultado.

## 5. Verificación

1. `npm run seed-prompts` → confirmar que `dbo.model_prompts (family='openai', mode='completo')` contiene el texto v3.
2. Destilar una sesión larga en modo `completo` → brief en 1ª persona, cerrado, denso, con nombres corregidos y sin sección de preguntas-meta.
3. Modo `limpio` sobre la misma sesión → salida distinta (neutra, con `[inferido]` + preguntas abiertas): confirma que `completo` y `limpio` NO se solapan.
4. Override de system prompt por sesión → sigue teniendo prioridad sobre el de BD.
