-- 001_core_schema.sql — esquema núcleo del flujo 1 (Azure SQL / SQL Server, esquema dbo).
-- users 1—N sessions 1—N segments  (+ session_shares: solo esquema, gancho de compartir).
-- usage_events y model_prices llegan en el flujo 5.

CREATE TABLE dbo.users (
  id            INT IDENTITY(1,1) CONSTRAINT PK_users PRIMARY KEY,
  external_id   NVARCHAR(200) NULL,         -- oid de Entra; lo rellena el JIT del flujo 2
  email         NVARCHAR(320) NOT NULL,
  display_name  NVARCHAR(200) NULL,
  created_at    DATETIME2(3) NOT NULL CONSTRAINT DF_users_created DEFAULT SYSUTCDATETIME(),
  last_login_at DATETIME2(3) NULL,
  CONSTRAINT UQ_users_email UNIQUE (email)
);

CREATE UNIQUE INDEX UX_users_external_id ON dbo.users(external_id) WHERE external_id IS NOT NULL;

CREATE TABLE dbo.sessions (
  id                   INT IDENTITY(1,1) CONSTRAINT PK_sessions PRIMARY KEY,
  owner_id             INT          NOT NULL,
  created_at           DATETIME2(3) NOT NULL CONSTRAINT DF_sessions_created DEFAULT SYSUTCDATETIME(),
  transcription_raw    NVARCHAR(MAX) NULL,    -- VISTA MATERIALIZADA (join de segmentos)
  transcription_edited NVARCHAR(MAX) NULL,
  prompt_distilled     NVARCHAR(MAX) NULL,
  distill_mode         VARCHAR(20)  NULL,
  distill_prompt_used  NVARCHAR(MAX) NULL,
  llm_provider         VARCHAR(40)  NULL,
  llm_model            VARCHAR(60)  NULL,
  stt_provider         VARCHAR(40)  NULL,
  stt_model            VARCHAR(60)  NULL,
  CONSTRAINT FK_sessions_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id)
);

CREATE INDEX IX_sessions_owner_created ON dbo.sessions(owner_id, created_at DESC);

CREATE TABLE dbo.segments (
  id                   INT IDENTITY(1,1) CONSTRAINT PK_segments PRIMARY KEY,
  session_id           INT          NOT NULL,
  ordinal              INT          NOT NULL,                 -- 1-based
  audio_file           NVARCHAR(260) NULL,                    -- nombre de fichero hoy; ruta de blob tras flujo 3
  transcription_raw    NVARCHAR(MAX) NULL,
  transcription_edited NVARCHAR(MAX) NULL,
  duration_seconds     INT          NULL,
  source               VARCHAR(20)  NOT NULL CONSTRAINT DF_segments_source DEFAULT 'recorded',
  created_at           DATETIME2(3) NOT NULL CONSTRAINT DF_segments_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_segments_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(id) ON DELETE CASCADE,
  CONSTRAINT UQ_segments_ordinal UNIQUE (session_id, ordinal)
);

CREATE TABLE dbo.session_shares (          -- SOLO ESQUEMA (gancho opción C; sin función aún)
  id                  INT IDENTITY(1,1) CONSTRAINT PK_session_shares PRIMARY KEY,
  session_id          INT NOT NULL,
  shared_with_user_id INT NOT NULL,
  permission          VARCHAR(20) NOT NULL CONSTRAINT DF_shares_perm DEFAULT 'read',
  created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_shares_created DEFAULT SYSUTCDATETIME(),
  created_by          INT NULL,
  CONSTRAINT FK_shares_session FOREIGN KEY (session_id) REFERENCES dbo.sessions(id) ON DELETE CASCADE,
  CONSTRAINT FK_shares_user    FOREIGN KEY (shared_with_user_id) REFERENCES dbo.users(id),
  CONSTRAINT UQ_shares UNIQUE (session_id, shared_with_user_id)
);
