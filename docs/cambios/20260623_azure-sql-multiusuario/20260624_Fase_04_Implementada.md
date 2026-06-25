# Fase 04 — Procesadores Azure + multi-modelo de prompts — IMPLEMENTADA

**Fecha:** 2026-06-24
**Tipo:** implementación sobre el DESIGN del 2026-06-23 (rama `feat/azure-sql-multiusuario`).
**Estado:** **implementado y verificado en local** contra SQL Server `db-speech-to-prompt` + el recurso Azure OpenAI `aoai-speech-to-prompt`.
**Trazabilidad:** continúa `DESIGN.md` (ver su *Addendum 2026-06-24*) y cierra el **flujo 4** de su §9. Queda solo el **flujo 6** (red + Managed Identity + provisión real de SQL/Storage).

> **Nota de seguridad.** Este documento no contiene ninguna API key. Las claves siguen en `data/config.json` / App Settings (entorno); la BD solo aloja config **no-secreta** (precios, prompts, registro de modelos).

---

## 1. Resumen ejecutivo

El flujo 4 buscaba mover los procesadores a Azure-nativo. Durante la sesión surgió una **restricción de facturación dura** del cliente que **cambió el diseño**:

> Los costes **deben** ir contra el **crédito de la suscripción**; **no** puede haber cargos a tarjeta.

Esto **descarta Claude como LLM** (es oferta de Azure Marketplace, no creditable) y obliga a usar **Azure OpenAI (GPT)**, que es first-party y sí se factura contra el crédito. A raíz de validar GPT, se decidió además un cambio estructural: **soportar prompts por familia de modelo, almacenados en BD**, con selección y gating de modelo.

Resultado de la sesión:

- **STT** — Azure OpenAI Whisper: verificado de extremo a extremo en local.
- **LLM** — **pivotado de Claude a Azure OpenAI `gpt-4.1`**; proveedor nuevo, verificado de extremo a extremo.
- **Multi-modelo de prompts** — prompts por **familia × modo en BD**, registro/gating de modelos, default `gpt-4.1`, **Claude conservado pero deshabilitado**.
- **Calidad** — gpt-4.1 validado en los modos `limpio` y `completo` (este último afinado para cerrar el gap con Claude).
- **Higiene + docs** — key personal de Anthropic vaciada en local; `CLAUDE.md` y `DESIGN.md` actualizados.

---

## 2. El pivote de facturación (Claude → Azure OpenAI)

### 2.1 El porqué (confirmado con documentación de Microsoft)

- El **crédito Azure NO cubre** productos de **Marketplace / partners**: *"you can't use Azure Prepayment credit to pay for third party products… in the Azure Marketplace"*. Las suscripciones credit-only tienen además **cuota 0** para esos modelos.
- **Azure OpenAI es first-party** (*"billed by Microsoft"*, consumo Azure nativo) → **se puede pagar con crédito**.
- **Claude en Foundry** es Marketplace (Anthropic) y, además, solo está en **East US 2 / Sweden Central** (no West Europe).

**Conclusión:** Claude queda fuera del LLM por facturación; el destilador pasa a **Azure OpenAI GPT**, que además permite **reutilizar el mismo recurso del STT** (`aoai-speech-to-prompt`, West Europe) → un solo recurso/región/billing/auth.

### 2.2 Camino descartado

Se llegó a escribir un proveedor `foundry.js` (Claude vía Microsoft Foundry, SDK `@anthropic-ai/foundry-sdk`, doble auth api-key/Managed Identity). Al confirmarse la restricción de facturación se **retiró por completo** (proveedor + script de prueba + dependencia).

---

## 3. Procesadores Azure implementados

### 3.1 STT — Azure OpenAI Whisper (verificado)

- El recurso de junio `aoai-speech-to-prompt` (West Europe, deployment `whisper`) **sigue vivo** y la clave local **sigue válida** — confirmado primero con un *probe* sin audio (HTTP 400 *"Missing audio file"* ⇒ DNS + deployment + auth OK) y luego transcribiendo un audio real de abril (test, no sensible): acentos y "LLM" perfectos, sin el bug de Groq.
- El código (`src/providers/stt/azure-whisper.js`) ya estaba escrito; esta fase lo **verifica** end-to-end.
- Para activar STT-Azure en local: `STT_PROVIDER=azure-whisper` + `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_STT_DEPLOYMENT=whisper`. (El default local sigue en `groq`.)

### 3.2 LLM — Azure OpenAI GPT (nuevo, verificado)

- Nuevo proveedor **`src/providers/llm/azure-openai.js`**: Chat Completions por `fetch` (sin SDK, como el resto de proveedores); auth por cabecera `api-key` **o**, sin clave, **Managed Identity** (`DefaultAzureCredential`, scope `https://cognitiveservices.azure.com/.default`); api-version `2024-10-21`. Reutiliza `AZURE_OPENAI_ENDPOINT` y `AZURE_OPENAI_API_KEY` del mismo recurso que Whisper. Mapea `prompt_tokens`/`completion_tokens` → input/output; `finish_reason='length'` → `truncated`.
- **Deployment `gpt-4.1`** creado en `aoai-speech-to-prompt` (modelo real `gpt-4.1-2025-04-14`, Global Standard, **sold-by-Azure → crédito**). Verificado con `scripts/test-azure-openai.js`.
- `.env` local preparado: `AZURE_OPENAI_ENDPOINT`, `LLM_PROVIDER=azure-openai`, `LLM_MODEL=gpt-4.1`; clave copiada a `api_keys['azure-openai']` en `config.json` (misma del recurso).

---

## 4. Rediseño: prompts multi-modelo en BD

Cambio **nuevo, más allá del DESIGN original**, acordado en entrevista socrática.

### 4.1 Decisiones

| # | Decisión |
|---|----------|
| 1 | **Granularidad por FAMILIA** de modelo (`openai`/`claude`/`gemini`), no por modelo exacto. Se re-afina una familia solo cuando evoluciona drásticamente (precedente: Opus 4.6→4.7). |
| 2 | **Plantillas en BD**, no en `.md`. La BD es el hogar de toda la config (no-secreta); habrá backoffice para editarla. Los `.md` quedan como **origen versionado** (semilla). |
| 3 | **Claude se conserva (sus prompts) pero DESHABILITADO**: no ejecutable. La key de Anthropic era personal y se elimina. |
| 4 | **Selección de modelo GLOBAL** ahora (config/env); por usuario/cliente en el futuro SaaS. Default `gpt-4.1`; intentar un modelo deshabilitado → rechazado. |

### 4.2 Modelo de datos (migración `004_multimodel_prompts.sql`)

```
model_prompts(family, mode, text, updated_at)              PK(family, mode)
   family: 'openai' | 'claude' | 'gemini'   mode: completo|ligero|literal|limpio

llm_models(provider, model, family, enabled, is_default, label)  PK(provider, model)
   seed: azure-openai/gpt-4.1      → openai, enabled=1, is_default=1
         azure-openai/gpt-4.1-mini → openai, enabled=1
         anthropic/claude-sonnet-4-6 → claude, enabled=0   (conservado, deshabilitado)
```

El **texto** de los prompts NO se siembra en la migración: lo carga `scripts/seed-prompts.js` desde `src/prompts/<familia>/<modo>.md` (upsert `MERGE`). La BD es la fuente en runtime; los ficheros son el origen git.

### 4.3 Flujo en runtime

1. El modelo activo sale de `config.defaults.llm_provider/llm_model` (override por env `LLM_PROVIDER`/`LLM_MODEL`).
2. `services/models.js` busca su fila en `llm_models`: si `enabled=0` → **`400 MODEL_DISABLED`** (así se rechaza Claude); si no, obtiene su `family`.
3. `services/prompts.js` devuelve el prompt de `(family, mode)` desde BD (con caché). El override inline del front (fase 3) sigue mandando si viene no vacío.
4. `routes/prompts.js` (`GET /api/prompts`) sirve los prompts de la familia activa al editor del front.

### 4.4 Servicios y recableado

- **Nuevos:** `src/services/prompts.js` (getPrompt/getFamilyPrompts + caché), `src/services/models.js` (getModel/getDefaultModel/familyForProvider + caché).
- **`src/prompts/index.js`**: ya no carga `.md`; solo expone `DISTILL_MODES`, `resolveMode()`, `FALLBACK_PROMPTS`.
- **`routes/distill.js`**: gating + prompt por (familia, modo) desde BD.
- **`routes/prompts.js`**: lee de BD por familia activa (async).
- **`config-store.js`**: `DEFAULTS.defaults` → `azure-openai` / `gpt-4.1`. Nuevas claves de API `azure-openai` (comparte `AZURE_OPENAI_API_KEY` con `azure-whisper`, mismo recurso).

---

## 5. Validación de calidad (gpt-4.1 vs Claude Sonnet)

Comparación real (`scripts/compare-distill.js`) sobre un dictado de diseño no sensible (sesión `2026-05-19`, 2.309 palabras), cada modelo con el prompt de **su** familia.

- **Modo `limpio`:** gpt-4.1 **equiparable** a Sonnet (fiel, estructura, `[inferido]`, sección ❓). Se corrigieron 2 fallos de prompt en `distill-clean.md` → familia `claude`/`openai`:
  1. artefacto "Ninguna detectada." colado en lista no vacía;
  2. infra-uso de `[inferido]` en nombres mal transcritos (p. ej. "Cloud Code" → "Claude Code").
- **Modo `completo`** (el más afinado para Claude, "prueba de fuego"): inicialmente gpt-4.1 desviaba (metía sección de dudas, cierre con preguntas, perdía detalles, redactaba en 3ª persona). Se aplicaron **3 retoques** a `src/prompts/openai/completo.md`:
  1. **brief en 1ª persona** (no resumen en 3ª);
  2. **prohibir** sección de "dudas abiertas" y cierre interrogativo (eso es de `limpio`);
  3. **conservar nombres propios/detalles** y no fundir distinciones.
  Tras el afinado, gpt-4.1 produce un brief en 1ª persona, sin sección de preguntas, con detalles preservados ("Sony", `.ARW`) — de hecho **más on-contract que Sonnet**. Diferencia residual: Sonnet es más exhaustivo/largo (depende de gusto, no de fidelidad).

**Conclusión:** **gpt-4.1 es apto para los 4 modos.** Coste por destilado ~$0.02 (contra crédito) vs ~$0.04 de Sonnet (tarjeta).

---

## 6. Cambios concretos (ficheros)

**Nuevos:**
- `src/providers/llm/azure-openai.js`
- `src/services/prompts.js`, `src/services/models.js`
- `migrations/003_azure_openai_prices.sql` (precios gpt-4.1 / gpt-4.1-mini, aprox.)
- `migrations/004_multimodel_prompts.sql` (`model_prompts` + `llm_models`)
- `scripts/seed-prompts.js`, `scripts/test-azure-openai.js`, `scripts/compare-distill.js`
- `src/prompts/claude/{completo,ligero,literal,limpio}.md` y `src/prompts/openai/{…}.md`

**Modificados:**
- `src/providers/llm/index.js` (registra `azure-openai`)
- `src/services/config-store.js` (defaults gpt-4.1; clave `azure-openai`; `isConfigured` admite MI)
- `src/routes/distill.js` (gating + prompt por familia desde BD)
- `src/routes/prompts.js` (lee de BD por familia activa)
- `src/prompts/index.js` (ya no carga `.md`)
- `scripts/test-distill-mode.js` (usa gpt-4.1 + familia openai)
- `package.json` (script `seed-prompts`; sin `@anthropic-ai/foundry-sdk`)
- `CLAUDE.md` (reescrito), `DESIGN.md` (addendum)

**Eliminados:**
- `src/providers/llm/foundry.js`, `scripts/test-foundry.js`, dependencia `@anthropic-ai/foundry-sdk`
- `src/prompts/distill-{system,light,literal,clean}.md` (reorganizados en `claude/` + `openai/`)

---

## 7. Higiene y documentación

- **Key personal de Anthropic vaciada** en `data/config.json` (`api_keys.anthropic=''`). El gating ya rechazaba Claude igualmente. Pendiente: quitar `ANTHROPIC_API_KEY` de las App Settings de Azure al redesplegar.
- **`CLAUDE.md`** reescrito: persistencia SQL+Blob, procesadores Azure OpenAI, prompts multi-modelo en BD, sección *Commands* con `migrate`/`seed-prompts` y arranque sin auto-open.
- **`DESIGN.md`**: *Addendum 2026-06-24* (D10 corregida + multi-modelo).

---

## 8. Cómo correr / verificar (local)

```bash
npm run migrate        # aplica migraciones pendientes (incluye 003 y 004)
npm run seed-prompts   # carga src/prompts/<familia>/<modo>.md → dbo.model_prompts
npm run dev            # arranca; abrir http://localhost:3000 a mano

# Pruebas puntuales (cargan .env):
node --env-file-if-exists=.env scripts/test-azure-openai.js
node --env-file-if-exists=.env scripts/test-distill-mode.js limpio
node --env-file-if-exists=.env scripts/compare-distill.js <sessionId> [modo]   # requiere key de Anthropic (ya vaciada)
```

**GOTCHAs anotados:**
- `npm run migrate`/`seed-prompts` son operaciones **locales** sobre `db-speech-to-prompt`; no tocan Azure. No son necesarias para que el LLM funcione, sí para el coste por sesión y para los prompts.
- Un `node -e` directo **hereda el CWD del último shell**; usar `Set-Location` a la raíz o `npm run` (npm fuerza la raíz del proyecto).
- Tunear un prompt = editar `src/prompts/<familia>/<modo>.md` → `npm run seed-prompts` → re-probar.

---

## 9. Estado y pendientes

- **Flujos 1, 2, 3, 4, 5: completos y verificados en local.**
- **Pendiente — flujo 6:**
  - Provisionar **Azure SQL + Storage** (hoy solo existe el Azure OpenAI `aoai-speech-to-prompt`).
  - **Red:** Private Endpoints + VNet; **Managed Identity** en el App Service (el código ya está escrito para MI; se *verifica* al provisionar — `storage/azure.js`, `db.js`, `azure-openai.js`/`azure-whisper.js` por MI).
  - Lista blanca de IPs para acceso admin (SSMS / Storage Explorer).
  - Quitar `ANTHROPIC_API_KEY` de las App Settings al redesplegar.
