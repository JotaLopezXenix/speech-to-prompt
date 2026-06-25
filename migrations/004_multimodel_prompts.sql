-- 004_multimodel_prompts.sql — soporte multi-modelo de prompts (24-jun-2026).
-- Los prompts de destilación pasan a estar PARAMETRIZADOS POR FAMILIA de modelo
-- (openai/claude/gemini) × modo, y se guardan en BD (la BD es el hogar de la config
-- no-secreta; las API keys siguen en env/config.json). Antes había un solo juego de
-- .md afinado para Claude. Además, un registro de modelos con habilitado/por-defecto
-- para que la app seleccione el modelo activo y RECHACE los deshabilitados (Claude).
--
-- El TEXTO de los prompts NO se siembra aquí: lo carga `scripts/seed-prompts.js`
-- desde src/prompts/<familia>/<modo>.md (origen versionado en git; la BD es runtime).

CREATE TABLE dbo.model_prompts (
  family     VARCHAR(20)   NOT NULL,   -- 'openai' | 'claude' | 'gemini'
  mode       VARCHAR(20)   NOT NULL,   -- 'completo' | 'ligero' | 'literal' | 'limpio'
  text       NVARCHAR(MAX) NOT NULL,
  updated_at DATETIME2(3)  NOT NULL CONSTRAINT DF_model_prompts_updated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_model_prompts PRIMARY KEY (family, mode)
);

CREATE TABLE dbo.llm_models (
  provider   VARCHAR(40)  NOT NULL,
  model      VARCHAR(60)  NOT NULL,
  family     VARCHAR(20)  NOT NULL,    -- familia de prompts a la que mapea
  enabled    BIT          NOT NULL CONSTRAINT DF_llm_models_enabled DEFAULT 0,
  is_default BIT          NOT NULL CONSTRAINT DF_llm_models_default DEFAULT 0,
  label      NVARCHAR(80) NULL,
  CONSTRAINT PK_llm_models PRIMARY KEY (provider, model)
);

-- Registro inicial de modelos. gpt-4.1 = habilitado y por defecto; Claude se
-- CONSERVA (para sus prompts y para reactivarlo en el futuro) pero DESHABILITADO
-- (no facturable contra crédito → no ejecutable ahora).
INSERT INTO dbo.llm_models (provider, model, family, enabled, is_default, label) VALUES
  ('azure-openai', 'gpt-4.1',           'openai', 1, 1, 'GPT-4.1 (Azure OpenAI)'),
  ('azure-openai', 'gpt-4.1-mini',      'openai', 1, 0, 'GPT-4.1 mini (Azure OpenAI)'),
  ('anthropic',    'claude-sonnet-4-6', 'claude', 0, 0, 'Claude Sonnet 4.6 (deshabilitado)');
