# DESIGN — Mejorar destilado GPT (modo `completo`)

**Fecha:** 2026-06-26
**Carpeta:** `docs/cambios/20260626_mejorar-destilado-gpt/`
**Estado:** Implementado y validado por evaluación (ver §Resultado).

> **Nota de corrección.** La primera iteración de este cambio (sesión anterior, ejecutada por error con Sonnet/esfuerzo bajo) reescribió `completo` en dirección **neutra + `[inferido]` + preguntas abiertas**, lo que lo colapsaba con `limpio` y se alejaba del objetivo real. Esa reescritura se **revirtió**. Este DESIGN refleja el enfoque corregido.

---

## Objetivo y problema

El destilador usa `azure-openai / gpt-4.1`. En modo `completo`, su salida quedaba por debajo de la que producía Claude Sonnet. Queremos un prompt `completo` (ejecutado por GPT) cuya salida sea **comparable en calidad a la de Sonnet** para este modo.

**Contexto del cambio Sonnet→GPT.** No fue una decisión de calidad: en el cambio `azure-sql-multiusuario` (despliegue Azure + multiusuario) se descubrió que **Claude/Anthropic (Marketplace) no es creditable** contra el crédito Azure de la suscripción —solo **Azure OpenAI (first-party)** lo es—. Por esa restricción de facturación se pasó a GPT y se eligió `gpt-4.1` "por parecido a Sonnet", **sin análisis real del modelo ni re-tuneo del prompt**. Este cambio aborda esa deuda ahora que se empieza a usar la app en serio.

## El golden (definición empírica de "bueno")

Se toma como referencia la destilación que hizo **Sonnet** sobre un dictado largo guardado en `data/sessions/2026-06-06T10-12-24.json` (modo `completo`). Sus rasgos —que definen el objetivo del modo `completo`— son:

- **Primera persona** ("Quiero…", "Mi método actual…"): es el mensaje del propio usuario, listo para pegar.
- **Brief cerrado:** resuelve ambigüedades manteniendo la interpretación más probable; **sin** `[inferido]` ni sección meta de "preguntas abiertas". Las dudas reales del usuario aparecen como contenido en 1ª persona.
- **Corrige en silencio** los nombres mal transcritos por la voz a texto (Cloud→Claude, Antropic→Anthropic, Cloud Code→Claude Code…).
- **Denso y reestructurado** por lógica; preserva todas las ideas sustantivas y los datos concretos.

Esto distingue claramente `completo` de `limpio` (neutro, preserva ambigüedades, `[inferido]`, sección de preguntas, sin sintetizar). Ambos modos se mantienen y son distintos.

## Destinatario del resultado

El brief `completo` se pega como **primer turno de una sesión de Claude Code** para arrancar un diseño/desarrollo profundo socrático. Por tanto: prompt destilador **afinado para GPT** (instrucciones explícitas y literales, porque GPT las sigue al pie de la letra), pero **artefacto de salida afinado para Claude Code**.

## Enfoque

1. **Afinar el prompt `src/prompts/openai/completo.md` para GPT**, codificando explícitamente lo que Sonnet hacía por criterio: corrección de nombres mal transcritos, objetivo de densidad proporcional al contenido (sin perder datos concretos), primera persona, brief cerrado.
2. **Evaluación empírica** modelo × prompt contra el golden, vía script `scripts/eval-distill.mjs` (re-destila transcripciones reales de `data/sessions/` y guarda artefactos en `eval/`). Principio de selección de modelo: **el más barato que supere el listón del golden; escalar solo si los baratos no llegan.**

## Alcance

**Dentro:** reescribir `openai/completo.md`; script y artefactos de evaluación; elegir modelo.
**Fuera:** modos `ligero`/`literal`/`limpio` (no se tocan); familia `claude` (deshabilitada); UI de ajustes; migración de sesiones históricas; despliegue a producción (decisión aparte).

## Resultado

- **Modelo elegido: `gpt-4.1`** (el más barato de los probados). Con el prompt afinado (v3) **iguala el golden** en una evaluación sobre **5 sesiones** largas y de dominios distintos. Cumple el principio coste-primero.
- `gpt-5.4` quedó **peor** para esta tarea pese a ser más caro: poco denso (transcript pulido en vez de brief) y con algún error factual. Los candidatos (`gpt-5`, `gpt-5.1`, `gpt-5.4`, `o3`, `o3-pro`, `o4-mini`) quedan en el registro con `enabled=0`.
- **Debilidades residuales conocidas** de `gpt-4.1`: en dictados extremadamente largos tiende a comprimir (mitigado en v3 instruyendo preservar datos concretos), y falla la corrección de nombres de nicho (Qwen, LLaMA…). Asumibles: el usuario revisa el brief antes de pegarlo.
- Detalle de la evaluación y artefactos: ver `SPEC-01`, `SPEC-02` y la carpeta `eval/`.
