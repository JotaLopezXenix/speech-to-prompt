# Bitácora de cierre — Mejorar destilado GPT

**Fecha:** 2026-06-26
**Cambio:** `docs/cambios/20260626_mejorar-destilado-gpt/`

---

## Estado metodológico

- **Fase actual:** `revisión` → **COMPLETO y desplegado a producción**. La revisión/verificación se hizo de forma empírica (evaluación contra golden sobre 5 sesiones) + smoke test funcional en producción. No queda fase pendiente para este cambio.
- **Siguiente command:** ninguno para este cambio (cerrado). La próxima sesión, si hay trabajo nuevo, arranca con **`/jcc-design`**.
- **Restricciones activas (a respetar siempre):**
  - **Destilador = Azure OpenAI (first-party), creditable.** Claude/Anthropic NO es creditable → prohibido como destilador.
  - **`completo` ≠ `limpio`.** `completo` = brief **1ª persona, cerrado, denso**, resuelve ambigüedades, **sin** `[inferido]` ni sección de "preguntas abiertas". `limpio` = neutro, preserva ambigüedades, `[inferido]` + preguntas. No volver a colapsarlos.
  - **Principio de modelo:** el más barato que supere el listón; escalar solo si no llega. Hoy: `gpt-4.1`.
  - **Principio de diseño del prompt:** afinar el prompt para el modelo que lo EJECUTA (GPT, instrucciones explícitas); el artefacto de salida se afina para quien lo CONSUME (Claude Code).
  - **Secretless / red privada** (heredado de `azure-sql-multiusuario`): nada de api-keys en App Settings ni en la BD; SQL/Storage/AOAI por Managed Identity en Azure.
  - **PROHIBIDO `dbgo.database.windows.net`** (BD de producción de un cliente ajeno; ver memoria).
- **Evidencia del estado (artefactos):**
  - `DESIGN.md` (reescrito a la decisión real), `SPEC-01` (prompt afinado), `SPEC-02` (candidatos DESCARTADO).
  - `src/prompts/openai/completo.md` = prompt v3 (4 183 chars), idéntico a `eval/prompts/completo-gpt-v3.md`.
  - `scripts/eval-distill.mjs` + `eval/` (prompts v2/v3, `golden__*.md` de 5 sesiones, `out/*.md`).
  - Migración `005_llm_models_candidates.sql` **eliminada** (no existe ya en el repo).
  - 5 commits del cambio pusheados a `main` (último `18997f7`).

---

## Qué se hizo

1. **Reconciliación + saneamiento de la sesión anterior** (que se ejecutó por error con Sonnet/esfuerzo bajo): se revirtió la reescritura **neutra** de `completo` (colapsaba con `limpio`) y se confirmó que el golden objetivo es un `completo` **1ª persona, cerrado**.
2. **Incidente de seguridad resuelto:** se verificó que `dbgo` no estaba en config ni alcanzable en la sesión; regla dura registrada en memoria.
3. **Arnés de evaluación** (`scripts/eval-distill.mjs`): re-destila sesiones reales de `data/` con N modelos/prompt contra el golden Sonnet; llama al provider directo (no toca BD ni gating; `model` = nombre de deployment).
4. **Iteración del prompt para GPT:** v2 (corrige nombres mal transcritos + objetivo de densidad) → v3 (preservar datos concretos en dictados largos + guardarraíl de nombres de nicho).
5. **Selección de modelo:** `gpt-4.1` elegido (el más barato que iguala el golden); `gpt-5.4` descartado (verboso, error factual) pese a ser más caro.
6. **Descarte del catálogo de candidatos:** migración 005 eliminada; lista de modelos del provider recortada a los reales (`gpt-4.1`, `gpt-4.1-mini`); `max_completion_tokens` se mantiene.
7. **Despliegue a producción.**

---

## Qué se verificó (con evidencia real)

- **Evaluación (5 sesiones Sonnet, dominios distintos):** `gpt-4.1` + v3 comparable al golden. El caso largo (source 21 840) pasó de v2 4 228 (sobre-comprimía) a **v3 6 368** (golden 6 210), recuperando el detalle perdido; el medio creció sano (4 497→5 009) sin paja. Artefactos en `eval/out/`.
- **Fase 1 (prompt original):** gpt-4.1 y gpt-4.1-mini NO corregían nombres (Cloud→Claude…); gpt-5.4 los corregía pero no densificaba (11 627 chars). Diagnóstico que motivó el prompt afinado.
- **Coherencia del prompt:** `completo.md` == `completo-gpt-v3.md` (`diff` vacío, 4 183 chars ambos).
- **Deploy de código:** push `60cb813`→`main`; GitHub Actions run **28259051018 = success**.
- **Seed en producción:** `seed-prompts` (entra-default + `az login`) → 8 prompts; `dbo.model_prompts (openai, completo)` **len = 4 183**, head = texto v3. Coincide con el `completo.md` local.
- **`dbo.llm_models` en prod:** `gpt-4.1` (enabled, is_default), `gpt-4.1-mini` (enabled), `claude-sonnet-4-6` (disabled). Sin candidatos.
- **App Service:** reiniciado, `state = Running`.
- **Smoke test funcional (usuario):** OK. Sesión **id 6** en prod: `distill_mode=completo`, `llm_model=gpt-4.1`, `stt=azure-whisper`, `distill_prompt_used` len **4 183 == model_prompts** (usó exactamente el v3), `prompt_distilled` en **1ª persona** ("Quiero hacer una prueba en Azure…").

### Residuo conocido (no bloqueante)
- En la sesión id 6 quedó *"el PROM de destilación"* sin corregir ("prompt"). Es el residuo esperado de `gpt-4.1` con nombres/términos de nicho. Mitigable añadiendo "prompt" a los ejemplos del prompt si molesta; el usuario revisa el brief antes de pegarlo.

---

## Seguridad / infra (cómo se hizo, sin secretos)

- Seed/queries a prod con **identidad Entra del usuario** (`az login`; jesus.lopez es admin Entra del SQL `sql-speech-to-prompt`), env explícito de prod, **sin** cargar `.env` (evita arrastrar `localhost`).
- Firewall SQL: se usó la regla existente "Jota Casa" (IP del usuario). **No se añadió ni dejó abierto nada nuevo.**
- El firewall del AOAI (que se abrió temporalmente para la evaluación local) lo **cerró el usuario** al terminar.
- **Nunca** se tocó `dbgo`.

---

## Cómo retomar (próxima sesión)

- El cambio está cerrado; al arrancar, reconciliar con la línea "Fase actual" de CLAUDE.md.
- Si surge trabajo nuevo de destilado/prompt → `/jcc-design`.
- **Pendientes menores sueltos** (no núcleo): (a) opcional, añadir "prompt" a la corrección de nombres del prompt `completo`; (b) heredados de `azure-sql-multiusuario`: limpiar UI de Ajustes (proveedores legacy) y añadir IP de Agustín al firewall SQL/Storage.
- **Para destilar contra prod desde local** (futuro seed/migrate): `SQL_SERVER=sql-speech-to-prompt.database.windows.net SQL_DATABASE=db-speech-to-prompt SQL_AUTH=entra-default node scripts/<script>.js` con `az login` + IP en firewall.
