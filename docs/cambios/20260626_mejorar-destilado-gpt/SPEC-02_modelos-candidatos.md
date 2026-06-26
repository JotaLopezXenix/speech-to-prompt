# SPEC-02 — Añadir modelos candidatos al registro

**Cambio:** `docs/cambios/20260626_mejorar-destilado-gpt/`  
**Por qué:** ver DESIGN.md — experimentar con modelos más capaces (o3, gpt-5, etc.) desde la app sin tocar el default actual.

> **DESCARTADO (2026-06-26).** Tras la evaluación, **`gpt-4.1` (el de la migración 004) es suficiente** y es el modelo elegido. El enfoque de "registro de candidatos" de esta SPEC se **abandona**: la migración `005_llm_models_candidates.sql` se **elimina** (no se aplica a producción ni se conserva en el repo) y la lista de modelos del provider se recorta a los reales (`gpt-4.1`, `gpt-4.1-mini`). El cambio `max_tokens`→`max_completion_tokens` en el provider **sí se mantiene** (verificado con `gpt-4.1`; forward-compatible). Si en el futuro hace falta escalar a un modelo más capaz, se añade ese modelo concreto al registro en su momento, no un catálogo especulativo.
>
> Lo que sigue documenta el enfoque original (descartado), a efectos de registro.

---

## 1. Resumen

Añadir modelos candidatos a `dbo.llm_models` (deshabilitados, para habilitar uno a uno según se creen los deployments en Azure) y actualizar el provider para compatibilidad con modelos reasoning.

---

## 2. Stack y arquitectura

Sin cambios de stack. Delta mínimo:
- Nueva migración SQL (solo datos, sin cambios de schema)
- Ajuste en `azure-openai.js`: `max_tokens` → `max_completion_tokens` (compatible con todos los modelos Azure OpenAI actuales, obligatorio para reasoning models)

---

## 3. Delta

**ADDED**
- `migrations/005_llm_models_candidates.sql` — inserta modelos candidatos con `enabled=0`

**MODIFIED**
- `src/providers/llm/azure-openai.js`
  - `get models()`: ampliar la lista con los candidatos (UI)
  - `distill()`: `max_tokens` → `max_completion_tokens` en el body de la llamada REST

---

## 4. Interfaces y contratos

### `migrations/005_llm_models_candidates.sql`

```sql
-- Modelos candidatos para experimentación. enabled=0: disponibles para habilitar
-- por SQL a medida que se creen los deployments en Azure OpenAI.
-- Habilitar: UPDATE dbo.llm_models SET enabled=1 WHERE provider='azure-openai' AND model='<id>';
-- Cambiar default: UPDATE dbo.llm_models SET is_default=0 WHERE is_default=1;
--                  UPDATE dbo.llm_models SET is_default=1 WHERE provider='azure-openai' AND model='<id>';

INSERT INTO dbo.llm_models (provider, model, family, enabled, is_default, label)
SELECT * FROM (VALUES
  ('azure-openai', 'o3',       'openai', 0, 0, 'o3 (Azure OpenAI)'),
  ('azure-openai', 'o3-pro',   'openai', 0, 0, 'o3-pro (Azure OpenAI)'),
  ('azure-openai', 'o4-mini',  'openai', 0, 0, 'o4-mini (Azure OpenAI)'),
  ('azure-openai', 'gpt-5',    'openai', 0, 0, 'GPT-5 (Azure OpenAI)'),
  ('azure-openai', 'gpt-5.1',  'openai', 0, 0, 'GPT-5.1 (Azure OpenAI)'),
  ('azure-openai', 'gpt-5.4',  'openai', 0, 0, 'GPT-5.4 (Azure OpenAI)')
) AS v(provider, model, family, enabled, is_default, label)
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.llm_models m
  WHERE m.provider = v.provider AND m.model = v.model
);
```

### `azure-openai.js` — lista `models` ampliada

```js
get models() {
  return [
    { id: 'gpt-4.1',      label: 'GPT-4.1 (Azure OpenAI)' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini (Azure OpenAI)' },
    { id: 'gpt-5.1',      label: 'GPT-5.1 (Azure OpenAI)' },
    { id: 'o3',           label: 'o3 (Azure OpenAI)' },
    { id: 'o3-pro',       label: 'o3-pro (Azure OpenAI)' },
    { id: 'o4-mini',      label: 'o4-mini (Azure OpenAI)' },
    { id: 'gpt-5',        label: 'GPT-5 (Azure OpenAI)' },
    { id: 'gpt-5.4',      label: 'GPT-5.4 (Azure OpenAI)' },
  ];
}
```

### `azure-openai.js` — cambio en `distill()`

```js
// Antes:
max_tokens: 16000,

// Después:
max_completion_tokens: 16000,
```

Razón: `max_completion_tokens` es el parámetro unificado en Azure OpenAI. Los modelos reasoning (o3, o3-pro, o4-mini) rechazan `max_tokens`; los modelos chat (gpt-4.1, gpt-5.x) aceptan ambos — la migración es segura.

---

## 5. Qué se preserva (regresión)

- `gpt-4.1` sigue siendo el default (`is_default=1`); la migración no lo toca.
- `gpt-4.1-mini` y `gpt-5.1` ya en el registro — la migración usa `WHERE NOT EXISTS`, idempotente.
- El flujo de destilación completo (`routes/distill.js`, model gating, usage logging) sin cambios.
- `max_completion_tokens: 16000` produce el mismo comportamiento en `gpt-4.1` que `max_tokens: 16000`.

---

## 6. Migración de datos

`npm run migrate` aplica `005_llm_models_candidates.sql`. Es idempotente (guard `WHERE NOT EXISTS`).

Para habilitar un modelo tras crear su deployment en Azure:
```sql
UPDATE dbo.llm_models SET enabled=1
WHERE provider='azure-openai' AND model='o3';
```

Para cambiar el default:
```sql
UPDATE dbo.llm_models SET is_default=0 WHERE is_default=1 AND provider='azure-openai';
UPDATE dbo.llm_models SET is_default=1 WHERE provider='azure-openai' AND model='o3';
```

---

## 7. Fuera de alcance

- Crear los deployments en Azure OpenAI Studio — es operación de infraestructura manual.
- Cambiar el modelo default — se decide tras las pruebas de calidad/coste.
- Añadir columna `is_reasoning` u otras al schema — no necesario; `max_completion_tokens` aplica a todos.

---

## 8. Verificación

1. `npm run migrate` → confirmar que la migración termina sin error y que las 6 filas nuevas existen en `dbo.llm_models` con `enabled=0`.
2. En la app con `gpt-4.1` (enabled=1, is_default=1): destilar → verificar que el resultado es idéntico al anterior (regresión de `max_completion_tokens`).
3. Habilitar `o3` por SQL (`enabled=1`) → aparece como opción en la UI de ajustes → destilar → no error 400 `MODEL_DISABLED`.
4. Intentar destilar con modelo `enabled=0` → debe devolver `400 MODEL_DISABLED` (gating existente, sin cambios).
5. Ejecutar la migración una segunda vez → sin errores, sin filas duplicadas (idempotencia).
