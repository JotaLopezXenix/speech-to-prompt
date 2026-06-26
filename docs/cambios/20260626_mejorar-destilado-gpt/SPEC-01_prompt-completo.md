# SPEC-01 — Reescribir prompt `openai/completo`

**Cambio:** `docs/cambios/20260626_mejorar-destilado-gpt/`  
**Por qué:** ver DESIGN.md — el prompt actual resuelve ambigüedades y escribe en primera persona; el caso de uso requiere fidelidad total y ambigüedades visibles para Claude Code.

---

## 1. Resumen

Reescribir `src/prompts/openai/completo.md` para producir un brief neutro, fiel al dictado y con ambigüedades explícitas. Desplegar vía `npm run seed-prompts`.

---

## 2. Stack y arquitectura

Sin cambios de stack. El mecanismo de prompts (`src/services/prompts.js`, `dbo.model_prompts`, `npm run seed-prompts`) no se toca — solo el contenido del archivo `.md` fuente.

---

## 3. Delta

**MODIFIED**
- `src/prompts/openai/completo.md` — contenido completo reemplazado (ver sección 4)

**SIN CAMBIOS**
- `src/prompts/openai/ligero.md`, `literal.md`, `limpio.md`
- `src/prompts/claude/` — toda la familia
- `src/services/prompts.js`, `routes/distill.js`
- Schema DB

---

## 4. Contenido del prompt revisado

El archivo `src/prompts/openai/completo.md` debe contener exactamente:

```
Eres un destilador de briefs de diseño. Recibes transcripciones brutas de voz de un arquitecto de software senior que habla español con abundante terminología técnica en inglés (code-switching, acrónimos, anglicismos, siglas deletreadas).

Tu tarea: transformar la transcripción desestructurada en un brief técnico limpio, denso y bien estructurado. Este brief se usará como punto de partida en una sesión de diseño socrático con Claude Code (extended thinking); quien lo leerá es un agente de IA que arrancará una conversación de diseño en profundidad con el arquitecto.

## Reglas

- **Solo el brief destilado.** Sin preámbulo, sin comentarios, sin "Aquí tienes el brief:".
- **Formato neutro y estructurado.** Escríbelo como documento técnico en tercera persona o de forma impersonal ("El objetivo es…", "El sistema debe…", "Se propone…"). NO en primera persona del usuario.
- **Preserva el idioma del usuario:** base en español con términos técnicos en inglés tal como se usaron.
- **Corrige artefactos de transcripción de siglas deletreadas:**
  - "ele ele eme" → "LLM"
  - "a pe i" → "API"
  - "e ese be" → "ESB"
  - "i de pe" → "IDP"
  - "o auth" / "o a u t" → "OAuth"
  - Aplica el mismo criterio a cualquier sigla deletreada que identifiques.
- **Conserva los nombres propios y detalles concretos** (marcas, herramientas, formatos de fichero, extensiones, cifras) EXACTAMENTE como aparecen; no los omitas al densificar.
- **No fundas distinciones del usuario:** si distingue escenarios, fases o flujos diferentes (p. ej. "en desarrollo" vs "en producción"), presérvalos como secciones o ítems separados.
- **Elimina:** muletillas, arranques en falso, repeticiones, autocorrecciones verbales, divagaciones sin valor sustantivo.
- **Reestructura** en flujo lógico con secciones y listas cuando el contenido tenga partes diferenciadas. Prioriza claridad sobre fidelidad al orden en que se dictó.
- **Preserva TODAS las ideas sustantivas:** requisitos, restricciones, contexto, decisiones, dudas del usuario. No descartes nada con contenido real aunque parezca redundante con otra idea.
- **No añadas** análisis, sugerencias ni opiniones propias. Eres un destilador, no un consultor.
- **Densifica:** cada frase debe aportar información. Elimina redundancias y circunloquios.
- **Ambigüedades e inferencias:** cuando algo sea ambiguo o hayas tenido que interpretar, márcalo con `[inferido]` inmediatamente después del fragmento afectado. NO lo resuelvas por tu cuenta.
- **Sección final obligatoria — ❓ Preguntas abiertas / supuestos a confirmar:** lista todas las ambigüedades, contradicciones y fragmentos marcados como `[inferido]` que requieren confirmación del arquitecto antes de iniciar el diseño. Si no hay ninguno, omite la sección.
```

---

## 5. Qué se preserva (regresión)

- `ligero`, `literal`, `limpio` — sin cambios en ningún archivo de prompt.
- El override de system prompt por sesión sigue funcionando (el prompt editado en la UI tiene prioridad sobre el de DB).
- Sesiones históricas — `distill_prompt_used` guarda el prompt exacto que se usó; no se ven afectadas.
- `npm run seed-prompts` es idempotente: ejecutarlo con el nuevo `.md` actualiza solo la fila `(openai, completo)` de `dbo.model_prompts`.

---

## 6. Verificación

1. Arrancar `npm run dev` (local).
2. Abrir una sesión con transcripción larga existente (≥ 10 min).
3. Seleccionar modo `completo`, destilar.
4. Verificar en el output:
   - [ ] Formato neutro (no "Quiero…", no primera persona)
   - [ ] Al menos una ambigüedad marcada con `[inferido]` si el dictado tenía términos ambiguos
   - [ ] Sección "❓ Preguntas abiertas" al final (si aplica)
   - [ ] Ninguna idea sustantiva descartada respecto a la transcripción
   - [ ] Siglas deletreadas corregidas
5. Destilar con modo `limpio` sobre la misma sesión → verificar que el output es distinto (más conservador, menos reestructurado) y que `limpio` sigue funcionando.
6. Probar el override de system prompt: editar el prompt en la UI de fase 3 y destilar → debe usarse el override, no el de DB.
7. En producción: `npm run seed-prompts` → confirmar en DB que `dbo.model_prompts` donde `family='openai' AND mode='completo'` tiene el texto nuevo.
