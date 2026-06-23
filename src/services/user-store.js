import { getRequest, sql } from './db.js';

// Provisión JIT de usuarios a partir del principal autenticado.
// Identifica por `external_id` (oid de Entra) — estable y agnóstico de proveedor
// (D4) — y reconcilia por email las filas sembradas con external_id NULL.
// Devuelve el `users.id` interno.
export async function ensureUser({ oid, email, name }) {
  // 1) Por external_id (oid): el caso normal en cada login.
  if (oid) {
    const req = await getRequest();
    req.input('oid', sql.NVarChar(200), oid);
    req.input('email', sql.NVarChar(320), email ?? null);
    req.input('name', sql.NVarChar(200), name ?? null);
    const r = await req.query(`
      UPDATE dbo.users
        SET last_login_at = SYSUTCDATETIME(),
            email        = COALESCE(@email, email),
            display_name = COALESCE(@name, display_name)
      OUTPUT INSERTED.id
      WHERE external_id = @oid
    `);
    if (r.recordset.length) return r.recordset[0].id;
  }

  // 2) Por email: reconcilia una fila preexistente con external_id NULL
  //    (p. ej. el usuario bootstrap dev del flujo 1).
  if (email) {
    const req = await getRequest();
    req.input('oid', sql.NVarChar(200), oid ?? null);
    req.input('email', sql.NVarChar(320), email);
    req.input('name', sql.NVarChar(200), name ?? null);
    const r = await req.query(`
      UPDATE dbo.users
        SET external_id  = COALESCE(external_id, @oid),
            display_name = COALESCE(display_name, @name),
            last_login_at = SYSUTCDATETIME()
      OUTPUT INSERTED.id
      WHERE email = @email
    `);
    if (r.recordset.length) return r.recordset[0].id;
  }

  // 3) Usuario nuevo.
  try {
    const req = await getRequest();
    req.input('oid', sql.NVarChar(200), oid ?? null);
    req.input('email', sql.NVarChar(320), email);
    req.input('name', sql.NVarChar(200), name ?? null);
    const r = await req.query(`
      INSERT INTO dbo.users (external_id, email, display_name, last_login_at)
      OUTPUT INSERTED.id
      VALUES (@oid, @email, @name, SYSUTCDATETIME())
    `);
    return r.recordset[0].id;
  } catch (err) {
    // Carrera (otro request insertó el mismo email/oid): re-seleccionar.
    const req = await getRequest();
    req.input('email', sql.NVarChar(320), email);
    const r = await req.query(`SELECT id FROM dbo.users WHERE email = @email`);
    if (r.recordset.length) return r.recordset[0].id;
    throw err;
  }
}
