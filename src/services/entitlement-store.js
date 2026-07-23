import { getRequest, sql } from './db.js';

// Modelo de acceso unificado (ciclo marketplace-transactable, SPEC-01).
// Un "entitlement" concede acceso a la app; su origen es 'marketplace' (poblado por
// SPEC-02/03/04) o 'manual' (concesiones que Xenix crea sin pasar por el Marketplace).
// El gate (src/middleware/identity.js) pregunta "¿tiene acceso activo?" — ver hasActiveAccess.

// Helper PURO (testable sin BD): ¿esta fila da acceso ahora?
// Acceso = status 'active' y (sin caducidad o caducidad en el futuro).
export function isEntitlementActive(row, now = new Date()) {
  if (!row || row.status !== 'active') return false;
  if (row.access_expires_at == null) return true;
  return new Date(row.access_expires_at) > now;
}

// ¿El usuario tiene algún acceso activo? (gate)
export async function hasActiveAccess(userId) {
  if (!userId) return false;
  const req = await getRequest();
  req.input('owner_id', sql.Int, userId);
  const r = await req.query(`
    SELECT TOP 1 1 AS ok FROM dbo.entitlements
    WHERE owner_id = @owner_id AND status = 'active'
      AND (access_expires_at IS NULL OR access_expires_at > SYSUTCDATETIME())
  `);
  return r.recordset.length > 0;
}

// Vincula al usuario las concesiones creadas por email antes de su primer login
// (owner_id NULL → userId). Devuelve el nº de filas vinculadas. Sin email → no-op.
export async function bindPendingEntitlements(userId, email) {
  if (!userId || !email) return 0;
  const req = await getRequest();
  req.input('owner_id', sql.Int, userId);
  req.input('email', sql.NVarChar(320), String(email).trim().toLowerCase());
  const r = await req.query(`
    UPDATE dbo.entitlements
      SET owner_id = @owner_id, updated_at = SYSUTCDATETIME()
      WHERE owner_id IS NULL AND email = @email
  `);
  return r.rowsAffected[0] ?? 0;
}

// Concesión manual (uso operativo; backoffice en el ciclo 6). En v1 se crea por SQL o por aquí.
// expiresAt: Date|null (null = indefinida). Devuelve el id creado.
export async function grantManual({ email, expiresAt = null, grantedBy = null, note = null }) {
  if (!email) throw new Error('grantManual requiere email');
  const req = await getRequest();
  req.input('email', sql.NVarChar(320), String(email).trim().toLowerCase());
  req.input('expires', sql.DateTime2, expiresAt);
  req.input('granted_by', sql.NVarChar(320), grantedBy);
  req.input('note', sql.NVarChar(400), note);
  const r = await req.query(`
    INSERT INTO dbo.entitlements (email, source, status, access_expires_at, granted_by, note)
    OUTPUT INSERTED.id
    VALUES (@email, 'manual', 'active', @expires, @granted_by, @note)
  `);
  return r.recordset[0].id;
}
