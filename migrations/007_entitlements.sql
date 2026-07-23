-- 007_entitlements.sql — modelo de acceso unificado (ciclo profesionalizacion-marketplace/marketplace-transactable, SPEC-01).
-- Un "entitlement" = un acceso, con dos orígenes: 'marketplace' | 'manual'.
-- El gate de la app pasa de una lista blanca de correos (ALLOWED_EMAILS, interina) a
-- "¿el usuario tiene un acceso activo?". Las columnas marketplace/retención se crean ya
-- (latentes) para que SPEC-02/03/04/05 no tengan que re-migrar.
-- Idempotente (guardas IF) por si se re-aplica; el runner además no repite migraciones.

IF OBJECT_ID('dbo.entitlements', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.entitlements (
    id                INT IDENTITY(1,1) CONSTRAINT PK_entitlements PRIMARY KEY,
    owner_id          INT NULL,                 -- users.id; NULL hasta que el 1er login lo vincula
    email             NVARCHAR(320) NULL,       -- clave de vinculación pre-login (minúsculas); beneficiario en marketplace
    source            VARCHAR(20)  NOT NULL,    -- 'marketplace' | 'manual'
    status            VARCHAR(20)  NOT NULL CONSTRAINT DF_entitlements_status DEFAULT 'active', -- active|suspended|canceled|pending
    access_expires_at DATETIME2(3) NULL,        -- NULL = sin caducidad
    -- marketplace (latentes hasta SPEC-02/03/04)
    marketplace_subscription_id UNIQUEIDENTIFIER NULL,
    plan_id           NVARCHAR(100) NULL,
    offer_id          NVARCHAR(100) NULL,
    purchaser_email   NVARCHAR(320) NULL,
    purchaser_oid     NVARCHAR(200) NULL,
    purchaser_tid     NVARCHAR(200) NULL,
    beneficiary_oid   NVARCHAR(200) NULL,
    beneficiary_tid   NVARCHAR(200) NULL,
    raw               NVARCHAR(MAX) NULL,        -- último payload resolve/webhook (JSON)
    -- retención (latentes hasta SPEC-05)
    canceled_at       DATETIME2(3) NULL,
    data_purge_at     DATETIME2(3) NULL,
    -- auditoría
    granted_by        NVARCHAR(320) NULL,        -- quién concedió (manual)
    note              NVARCHAR(400) NULL,
    created_at        DATETIME2(3) NOT NULL CONSTRAINT DF_entitlements_created DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(3) NOT NULL CONSTRAINT DF_entitlements_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_entitlements_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id),
    CONSTRAINT CK_entitlements_source CHECK (source IN ('marketplace','manual')),
    CONSTRAINT CK_entitlements_status CHECK (status IN ('active','suspended','canceled','pending'))
  );
END
GO

-- Unicidad de la suscripción de Marketplace (filtrada: solo filas con subscriptionId)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_entitlements_mp_sub' AND object_id = OBJECT_ID('dbo.entitlements'))
  CREATE UNIQUE INDEX UX_entitlements_mp_sub ON dbo.entitlements(marketplace_subscription_id)
    WHERE marketplace_subscription_id IS NOT NULL;
GO

-- Gate por dueño (solo filas ya vinculadas)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_entitlements_owner' AND object_id = OBJECT_ID('dbo.entitlements'))
  CREATE INDEX IX_entitlements_owner ON dbo.entitlements(owner_id) WHERE owner_id IS NOT NULL;
GO

-- Vinculación pendiente por email (solo filas sin vincular)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_entitlements_email_unbound' AND object_id = OBJECT_ID('dbo.entitlements'))
  CREATE INDEX IX_entitlements_email_unbound ON dbo.entitlements(email) WHERE owner_id IS NULL;
GO

-- H6: el email del usuario deja de ser obligatorio (un token sin claim email no debe romper el JIT).
IF COLUMNPROPERTY(OBJECT_ID('dbo.users'), 'email', 'AllowsNull') = 0
  ALTER TABLE dbo.users ALTER COLUMN email NVARCHAR(320) NULL;
GO
