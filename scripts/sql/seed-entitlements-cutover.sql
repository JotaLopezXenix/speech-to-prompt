-- seed-entitlements-cutover.sql — paso de CUTOVER de SPEC-01 (ejecución ÚNICA, tras aplicar la 007).
--
-- Retira la lista blanca ALLOWED_EMAILS migrando los correos interinos a concesiones MANUALES,
-- ya vinculadas a su usuario (los usuarios existen: son dueños de sesiones), para que NO pierdan
-- acceso al activar el gate por suscripción. Idempotente: no duplica si ya hay una manual activa.
--
-- Ejecutar con las credenciales admin de siempre (SSMS / sqlcmd / `SQL_AUTH=entra-default`).
-- Orden seguro: migrar (007) + ESTE seed ANTES de desplegar el código nuevo del gate.

INSERT INTO dbo.entitlements (owner_id, email, source, status, granted_by, note)
SELECT u.id, LOWER(u.email), 'manual', 'active', 'cutover-spec01',
       'Acceso interino migrado de ALLOWED_EMAILS'
FROM dbo.users u
WHERE LOWER(u.email) IN ('jesus.lopez@xenix.es', 'agustin.hernandez@xenix.es')
  AND NOT EXISTS (
    SELECT 1 FROM dbo.entitlements e
    WHERE e.owner_id = u.id AND e.source = 'manual' AND e.status = 'active'
  );
