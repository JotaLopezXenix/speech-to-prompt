/* ============================================================================
   Speech-to-Prompt — creación del usuario de la aplicación (SQL Server LOCAL)
   ----------------------------------------------------------------------------
   Ejecuta este script en tu servidor local (localhost) con una cuenta
   administradora (p. ej. tu cuenta Windows, miembro de sysadmin), desde SSMS o
   sqlcmd.

   Crea:
     - LOGIN  [stp_app]  a nivel de servidor (autenticación SQL)
     - USER   [stp_app]  dentro de la base [db-speech-to-prompt]
     - Permisos: lectura + escritura (runtime) + DDL (para `npm run migrate`)

   REQUISITOS / AVISOS:
   1) El servidor debe estar en modo "SQL Server and Windows Authentication"
      (modo mixto). Si está en "Windows Authentication only", el login SQL no
      podrá conectar: SSMS → clic derecho en el servidor → Properties → Security
      → "SQL Server and Windows Authentication mode" → Aceptar → reiniciar el
      servicio SQL Server.
   2) Sustituye <<<PON-AQUÍ-LA-PASSWORD>>> por una contraseña fuerte y ponla
      también en .env (SQL_PASSWORD). Si tu política de contraseñas se queja,
      usa una más fuerte o cambia CHECK_POLICY = OFF (solo en local).
   3) En AZURE este usuario NO se usa: allí la app entra con Managed Identity y
      el usuario contenido se crea con CREATE USER ... FROM EXTERNAL PROVIDER,
      con solo db_datareader + db_datawriter (las migraciones las aplica un
      administrador, no la identidad de runtime). Ver SPEC-01 §10.
   ============================================================================ */

-- 1) Login a nivel de servidor ------------------------------------------------
USE [master];
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'stp_app')
BEGIN
    CREATE LOGIN [stp_app]
        WITH PASSWORD = N'<PASSWORD_HERE>',
             CHECK_POLICY = ON,
             DEFAULT_DATABASE = [db-speech-to-prompt];
END
GO

-- 2) Usuario dentro de la base de datos de la app -----------------------------
USE [db-speech-to-prompt];
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'stp_app')
BEGIN
    CREATE USER [stp_app] FOR LOGIN [stp_app] WITH DEFAULT_SCHEMA = [dbo];
END
GO

-- 3) Permisos -----------------------------------------------------------------
--    db_datareader / db_datawriter  → runtime de la app (SELECT/INSERT/UPDATE/DELETE)
--    db_ddladmin                    → para que `npm run migrate` cree/altere tablas
ALTER ROLE [db_datareader] ADD MEMBER [stp_app];
ALTER ROLE [db_datawriter] ADD MEMBER [stp_app];
ALTER ROLE [db_ddladmin]   ADD MEMBER [stp_app];
GO

PRINT 'Usuario [stp_app] creado y con permisos en [db-speech-to-prompt].';
GO
