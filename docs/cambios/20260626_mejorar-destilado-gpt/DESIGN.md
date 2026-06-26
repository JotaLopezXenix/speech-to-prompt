# DESIGN — Mejorar destilado GPT (modo `completo`)

**Fecha:** 2026-06-26  
**Carpeta:** `docs/cambios/20260626_mejorar-destilado-gpt/`  
**Estado:** Análisis completado — pendiente especificación (`/jcc-spec`)

---

## Objetivo y problema

El destilador usa `azure-openai / gpt-4.1`. El modo `completo` produce resultados inferiores a los que producía Claude Sonnet: pierde ideas del dictado, resuelve ambigüedades por su cuenta (cuando deben preservarse explícitas) y escribe en primera persona (cuando el formato debe ser neutro).

El output de `completo` alimenta sesiones de desarrollo profundo en Claude Code — un brief de diseño que Claude usará como punto de partida socrático. Necesita fidelidad total al dictado y ambigüedades visibles, no un resumen ejecutivo resuelto.

### Causa raíz identificada

`src/prompts/openai/completo.md` fue adaptado en la dirección equivocada cuando se migró de Claude a GPT:

| Aspecto | Lo que hace hoy | Lo que necesita |
|---|---|---|
| Ambigüedades | Las resuelve decisivamente | Preservarlas con `[inferido]` + sección de preguntas abiertas |
| Formato | Primera persona ("Quiero montar…") | Neutro / estructurado (como era la versión Claude) |
| Ideas del dictado | Puede perderlas al "resolver" | Fidelidad total — ninguna idea se descarta |
| Destinatario del output | No especificado | Claude Code en sesión socrática de diseño |

---

## Usuarios y caso de uso

**Usuario único:** Jesus Lopez — arquitecto de software, español con code-switching técnico en inglés, dicta en largo (sesiones de 10–40 min) para iniciar diseños de aplicaciones nuevas o cambios profundos.

**Caso de uso central:** Dictado largo → transcripción → `completo` → brief neutro y fiel → pegado en Claude Code como arranque de sesión de diseño profundo.

---

## Alcance

### Dentro del alcance

1. **Reescribir `src/prompts/openai/completo.md`** — formato neutro, preservación de ambigüedades, sección de preguntas abiertas, instrucciones calibradas para GPT pero output diseñado para Claude Code.
2. **Añadir modelos al registro** (`dbo.llm_models`) para experimentar desde la app. Candidatos confirmados disponibles en `aoai-speech-to-prompt` (todo el catálogo Azure OpenAI): `o3`, `o3-pro`, `o4-mini`, `gpt-5`, `gpt-5.1`, `gpt-5.4`. La selección final (qué añadir, cuál dejar como default) se decide tras validar calidad + coste.
3. **Iterar mediante la app** — re-destilar transcripciones existentes con el prompt revisado y/o modelos alternativos, sin cambios en la UI ni en el flujo.

### Fuera de alcance

- Modos `ligero`, `literal`, `limpio` — no están rotos.
- Prompts de familia `claude` — Claude está deshabilitado como destilador.
- Cambios en UI de ajustes (proveedores legacy visibles) — deuda técnica separada.
- Habilitar Claude como destilador — restricción dura: Azure OpenAI únicamente.
- Migración de sesiones históricas.

---

## Decisiones acordadas

| Decisión | Valor | Tipo |
|---|---|---|
| Proveedor destilador | Azure OpenAI (sin cambio) | Restricción dura |
| Formato del output | Neutro / estructurado (no primera persona) | Acordada |
| Ambigüedades | Preservar con `[inferido]` + sección "❓ Preguntas abiertas" | Acordada |
| Destinatario explícito en el prompt | Claude Code, sesión socrática de diseño | Acordada |
| Experimentación de modelos | Añadir candidatos a `dbo.llm_models`; probar desde la app | Acordada |
| Iteración | Desde la app (re-destilar transcripciones existentes) | Acordada |

---

## Qué se preserva (superficie de regresión)

- **Flujo de destilación** (`routes/distill.js`, `src/services/prompts.js`) — sin cambios.
- **Esquema DB** (`dbo.model_prompts`, `dbo.llm_models`) — sin cambios estructurales; solo datos.
- **Modos `ligero`, `literal`, `limpio`** — sin cambios.
- **Override de system prompt por sesión** — sigue funcionando igual.
- **`npm run seed-prompts`** — el re-seed con el prompt revisado es el mecanismo de despliegue; idempotente.
- **Sesiones históricas** — no se tocan; `distill_prompt_used` guarda el prompt exacto de cada sesión.

---

## Supuestos

- El despliegue Azure OpenAI tiene o puede tener modelos `o3` / `o1` habilitados (a confirmar antes de añadirlos al registro).
- El problema de calidad es principalmente del prompt, no del modelo — pero se experimentará con ambos en paralelo.
- Re-destilar transcripciones largas existentes desde la app es suficiente para iterar sin necesidad de scripts adicionales.

## Riesgos

- GPT (incluso `o3`) puede tener un techo de calidad inferior a Claude Sonnet para este caso de uso — si tras iterar el resultado sigue siendo insuficiente, habrá que reconsiderar la restricción de proveedor.
- Un prompt demasiado parecido al de `limpio` puede hacer que `completo` y `limpio` se solapen — hay que mantener la distinción clara (propósito, densidad, profundidad).

## Preguntas abiertas

- ~~¿Qué modelos están disponibles en `aoai-speech-to-prompt`?~~ **Resuelto:** catálogo completo Azure OpenAI disponible (o3, o3-pro, o4-mini, gpt-5, gpt-5.1, gpt-5.4, entre otros).
- El modelo default se decide tras validar calidad + coste en pruebas iterativas desde la app.
