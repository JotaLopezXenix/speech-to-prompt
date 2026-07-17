import { getRequest, sql } from './db.js';

// Provisión JIT de usuarios a partir del principal autenticado.
// Identifica SOLO por `external_id` (la tupla `tid.oid` de Entra — clave canónica
// estable/única multi-tenant; ciclo identidad-entra) y captura `tenant_id`.
// Ya NO se reconcilia por email: el email es atributo mutable, no clave.
// Devuelve el `users.id` interno.
export async function ensureUser({ externalId, tenantId, email, name }) {
  if (!externalId) throw new Error('ensureUser requiere externalId');

  // 1) Por external_id: el caso normal en cada login.
  {
    const req = await getRequest();
    req.input('external_id', sql.NVarChar(200), externalId);
    req.input('tenant_id', sql.NVarChar(200), tenantId ?? null);
    req.input('email', sql.NVarChar(320), email ?? null);
    req.input('name', sql.NVarChar(200), name ?? null);
    const r = await req.query(`
      UPDATE dbo.users
        SET last_login_at = SYSUTCDATETIME(),
            email        = COALESCE(@email, email),
            display_name = COALESCE(@name, display_name),
            tenant_id    = COALESCE(@tenant_id, tenant_id)
      OUTPUT INSERTED.id
      WHERE external_id = @external_id
    `);
    if (r.recordset.length) return r.recordset[0].id;
  }

  // 2) Usuario nuevo.
  try {
    const req = await getRequest();
    req.input('external_id', sql.NVarChar(200), externalId);
    req.input('tenant_id', sql.NVarChar(200), tenantId ?? null);
    req.input('email', sql.NVarChar(320), email);
    req.input('name', sql.NVarChar(200), name ?? null);
    const r = await req.query(`
      INSERT INTO dbo.users (external_id, tenant_id, email, display_name, last_login_at)
      OUTPUT INSERTED.id
      VALUES (@external_id, @tenant_id, @email, @name, SYSUTCDATETIME())
    `);
    return r.recordset[0].id;
  } catch (err) {
    // Carrera (otro request insertó el mismo external_id): re-seleccionar.
    const req = await getRequest();
    req.input('external_id', sql.NVarChar(200), externalId);
    const r = await req.query(`SELECT id FROM dbo.users WHERE external_id = @external_id`);
    if (r.recordset.length) return r.recordset[0].id;
    throw err;
  }
}
