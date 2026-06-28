-- 005_diagnostics.sql — telemetría de captura (append-only) para diagnosticar el
-- corte espontáneo de grabación (cambio grabacion-stop-espontaneo, fase de diagnóstico).
-- Independiente del ciclo de vida de la sesión: session_id es referencia BLANDA (sin FK).

CREATE TABLE dbo.diagnostic_events (
  id             INT IDENTITY(1,1) CONSTRAINT PK_diagnostic_events PRIMARY KEY,
  owner_id       INT NOT NULL,
  session_id     INT NULL,              -- referencia blanda (sin FK): la captura puede no
                                        -- tener sesión aún, y la telemetría sobrevive a la sesión
  capture_run_id NVARCHAR(64) NOT NULL, -- agrupa los eventos de un mismo intento de grabación
  seq            INT NOT NULL,          -- orden por-run, fijado en cliente (orden determinista)
  event_type     VARCHAR(40) NOT NULL,
  payload        NVARCHAR(MAX) NULL,    -- JSON serializado (truncado a ~8 KB en la ruta)
  client_ts      DATETIME2(3) NULL,     -- reloj del cliente (puede no ser fiable)
  server_ts      DATETIME2(3) NOT NULL CONSTRAINT DF_diag_server_ts DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_diag_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id)
);

CREATE INDEX IX_diag_owner_ts ON dbo.diagnostic_events(owner_id, server_ts DESC);
CREATE INDEX IX_diag_run_seq  ON dbo.diagnostic_events(capture_run_id, seq);
