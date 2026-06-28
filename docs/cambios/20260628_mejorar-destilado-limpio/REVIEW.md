# REVIEW — Mejorar destilado limpio (Fase 4 JCC)

**Fecha:** 2026-06-28
**Revisor:** subagente independiente (no escribió el código), postura adversarial.

## Alcance verificado
SPEC §4 (delta prompt), §5.3 (7 criterios de aceptación), §7 (regresión), §8 (fuera de alcance), §9 (verificación). Artefactos: prompt runtime, golden, transcripción cruda, salidas GPT v1–v3, script de eval.

## Resultado

**Regresión y cumplimiento estructural: LIMPIO.**
- Override `EVAL_OUT_DIR` backward-compatible (verificado ejecutando: sin la env → carpeta `20260626` + `completo.md`).
- No se tocó código runtime (`prompts.js`, `distill.js`, esquema, otros modos, familia `claude/`).
- `src/prompts/openai/limpio.md` byte-idéntico a la iteración versionada.
- Delta de voz + endurecimiento de límites GPT, todos presentes. Formato de salida intacto. Nada fuera de alcance.

**Correctitud de la salida del modelo (v3): hallazgos.**
- **S1 (MAYOR) — incumplimiento §4/punto 11 + criterio 3.** La sección de preguntas abiertas inflaba con una pregunta de diseño sintetizada que el usuario no formuló: *"¿Está correctamente implementada la funcionalidad de múltiples segmentos?"* (nacida de su suposición "supongo que se activa… espero que sea así"). Es justo el modo de fallo "GPT ayuda de más" que el afinado pretendía cerrar.
- **I1 (MAYOR, discutible) — desviación del golden en criterio 5.** v3 no marcaba `[inferido]` "base de datos de traducción" (el golden sí, como posible "transcripción"). Atenuante: v3 cumple el mínimo literal del SPEC (PROM/AUNE/Claudio). Se concluyó que **es más un exceso del golden** (preservar "traducción" cruda también es fiel) que un defecto de la salida.
- **V1 (MENOR) — punto 7.** Pasiva perifrástica introducida: "pueden ser cambiadas" donde el original era activo.

**Hueco del SPEC señalado:** §5.3 criterio 5 fija el mínimo (PROM/AUNE/Claudio) pero §9.2 pide "igualar el golden", que marca además "traducción" → una salida puede pasar el SPEC y no igualar el golden a la vez.

## Cierre del bucle 3↔4 (decisión del usuario: iterar a v4)

Se iteró el prompt a **v4** (Fase 3):
- **S1 resuelto:** regla 11 endurecida con el caso concreto — "NO conviertas en pregunta una esperanza/suposición/expectativa del hablante" (ejemplo literal de los segmentos). La salida v4 ya no escala a pregunta de implementación; replantea la duda en la voz del usuario ("…como supongo") y la mantiene como contenido en el cuerpo.
- **V1 resuelto:** regla 7 reforzada contra pasivas perifrásticas (ejemplo "ideas que han cambiado" → no "pueden ser cambiadas"). v4 escribe "pueden haber cambiado".
- **I1 aceptado** como exceso del golden; v4 lo esquiva omitiendo el calificativo "de traducción" (ruido).

**Salida v4 (`eval/out/session10__gpt-4.1.v4.md`):** pasa los 7 criterios; voz 1ª persona limpia sin pasivas; `[inferido]` en los 4 casos; sin síntesis/agenda; cobertura intacta; no colapsa con `completo`.

**Veredicto final:** v4 cumple el SPEC y no rompe nada. Adoptado como `src/prompts/openai/limpio.md` y sembrado en la DB local. Pendiente: despliegue a prod (decisión aparte).
