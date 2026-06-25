import { ensureUser } from '../services/user-store.js';

// Middleware de identidad para /api/sessions. Resuelve el principal autenticado
// y deja `req.user = { id, oid, email, name }` (id = users.id interno, vía JIT).
//
//  - Azure (Easy Auth) inyecta cabeceras X-MS-CLIENT-PRINCIPAL-*.
//  - En local, si no hay cabeceras, se usa un usuario dev de entorno (DEV_USER_*),
//    lo que también permite simular usuarios distintos enviando las cabeceras.

const isAzure = !!process.env.WEBSITE_HOSTNAME;

function decodePrincipal(b64) {
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// Busca un claim por cualquiera de los `types` dados en el JSON de Easy Auth.
function findClaim(principal, types) {
  const claims = principal?.claims || [];
  const hit = claims.find((c) => types.includes(c.typ));
  return hit?.val ?? null;
}

function resolvePrincipal(req) {
  const oid = req.headers['x-ms-client-principal-id'];
  const upn = req.headers['x-ms-client-principal-name'];

  if (oid) {
    let name = upn || null;
    const raw = req.headers['x-ms-client-principal'];
    if (raw) {
      const principal = decodePrincipal(raw);
      name =
        findClaim(principal, ['name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']) || name;
    }
    return { oid: String(oid), email: upn ? String(upn) : null, name: name ? String(name) : null };
  }

  if (!isAzure) {
    return {
      oid: process.env.DEV_USER_OID || 'dev-oid',
      email: process.env.DEV_USER_EMAIL || 'dev@speech-to-prompt.local',
      name: process.env.DEV_USER_NAME || 'Dev local',
    };
  }

  return null; // En Azure con "require auth" no debería ocurrir.
}

export async function identity(req, res, next) {
  try {
    const principal = resolvePrincipal(req);
    if (!principal) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'No autenticado' } });
    }
    // email es NOT NULL en el esquema: si el claim no lo trae, caer a UPN/oid.
    const email = principal.email || principal.name || `${principal.oid}@no-email.local`;
    const id = await ensureUser({ oid: principal.oid, email, name: principal.name });
    req.user = { id, oid: principal.oid, email, name: principal.name };
    next();
  } catch (err) {
    console.error('Identity middleware error:', err);
    res.status(500).json({ error: { code: 'IDENTITY_FAILED', message: err.message } });
  }
}
