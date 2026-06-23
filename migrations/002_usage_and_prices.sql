-- 002_usage_and_prices.sql — flujo 5: registro de uso (append-only) + precios.

CREATE TABLE dbo.usage_events (
  id            INT IDENTITY(1,1) CONSTRAINT PK_usage_events PRIMARY KEY,
  session_id    INT NOT NULL,
  segment_id    INT NULL,              -- referencia blanda (sin FK): sobrevive al reprocess
  kind          VARCHAR(10) NOT NULL,  -- 'stt' | 'llm'
  provider      VARCHAR(40) NOT NULL,
  model         VARCHAR(60) NOT NULL,
  input_tokens  INT NULL,              -- LLM
  output_tokens INT NULL,              -- LLM
  audio_seconds INT NULL,              -- STT
  created_at    DATETIME2(3) NOT NULL CONSTRAINT DF_usage_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_usage_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(id) ON DELETE CASCADE
);

CREATE INDEX IX_usage_session ON dbo.usage_events(session_id);

CREATE TABLE dbo.model_prices (
  provider           VARCHAR(40) NOT NULL,
  model              VARCHAR(60) NOT NULL,
  kind               VARCHAR(10) NOT NULL,        -- 'stt' | 'llm'
  input_per_million  DECIMAL(12,6) NULL,          -- LLM: USD / millón de tokens entrada
  output_per_million DECIMAL(12,6) NULL,          -- LLM: USD / millón de tokens salida
  per_audio_minute   DECIMAL(12,6) NULL,          -- STT: USD / minuto de audio
  currency           CHAR(3) NOT NULL CONSTRAINT DF_prices_currency DEFAULT 'USD',
  updated_at         DATETIME2(3) NOT NULL CONSTRAINT DF_prices_updated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_model_prices PRIMARY KEY (provider, model)
);

-- Seed de precios: valores APROXIMADOS — VERIFICAR Y ACTUALIZAR con las tarifas
-- reales (y al fijar los procesadores Azure del flujo 4). El coste es una estimación.
INSERT INTO dbo.model_prices (provider, model, kind, input_per_million, output_per_million, per_audio_minute) VALUES
  ('anthropic',     'claude-sonnet-4-6',       'llm', 3.000000, 15.000000, NULL),
  ('anthropic',     'claude-opus-4-7',         'llm', 15.000000, 75.000000, NULL),
  ('anthropic',     'claude-haiku-4-5',        'llm', 0.800000, 4.000000, NULL),
  ('groq',          'whisper-large-v3',        'stt', NULL, NULL, 0.001850),
  ('groq',          'whisper-large-v3-turbo',  'stt', NULL, NULL, 0.000670),
  ('azure-whisper', 'whisper',                 'stt', NULL, NULL, 0.006000);
