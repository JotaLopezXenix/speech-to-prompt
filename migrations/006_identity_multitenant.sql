-- 006_identity_multitenant.sql — identidad multi-tenant (ciclo profesionalizacion-marketplace/identidad-entra).
-- Prepara users para el login OIDC propio (Entra multi-tenant + MSA):
--   · tenant_id: se captura el `tid` del token (futuro: ofertas por tenant/empresa).
--   · external_id pasa a ser la tupla `tid.oid` (clave canónica estable multi-tenant);
--     el email deja de ser clave única (pasa a atributo mutable) → se quita UQ_users_email.
-- El BACKFILL de las filas existentes (external_id oid-desnudo → {XENIX_TID}.oid) es un paso
-- de CUTOVER separado y verificado (SPEC §6), NO va aquí.
-- Idempotente (guardas IF) por si se re-aplica; el runner además no repite migraciones.

IF COL_LENGTH('dbo.users', 'tenant_id') IS NULL
  ALTER TABLE dbo.users ADD tenant_id NVARCHAR(200) NULL;
GO

IF EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE name = 'UQ_users_email' AND parent_object_id = OBJECT_ID('dbo.users')
)
  ALTER TABLE dbo.users DROP CONSTRAINT UQ_users_email;
GO
