import { ensureUser } from '../services/user-store.js';
import { verifyAccessToken, buildExternalId } from '../services/token-verify.js';
import { parseAllowlist, isAllowed } from '../utils/allowlist.js';

// Middleware de identidad para las rutas protegidas. Resuelve el principal
// autenticado y deja `req.user = { id, externalId, tenantId, oid, email, name }`
// (id = users.id interno, vía JIT). Ciclo identidad-entra: sustituye Easy Auth por
// validación stateless de token bearer (Entra multi-tenant + MSA).
//
//  - Azure: exige `Authorization: Bearer <access token>`; valida el token, aplica la
//    lista blanca interina y aprovisiona/actualiza el usuario (JIT).
//  - Local (sin WEBSITE_HOSTNAME y sin cabecera Authorization): usuario dev de
//    entorno (DEV_USER_*), sin tokens, para no frenar el desarrollo.

const isAzure = !!process.env.WEBSITE_HOSTNAME;

// Lista blanca leída una vez del entorno (interina; se retira con el gate de suscripción).
const allowlist = parseAllowlist(process.env.ALLOWED_EMAILS);

function devPrincipal() {
  return {
    tid: process.env.DEV_USER_TID || 'dev-tenant',
    oid: process.env.DEV_USER_OID || 'dev-oid',
    email: process.env.DEV_USER_EMAIL || 'dev@speech-to-prompt.local',
    name: process.env.DEV_USER_NAME || 'Dev local',
  };
}

export async function identity(req, res, next) {
  try {
    const authz = req.headers['authorization'];

    // Bypass local: sin Azure y sin cabecera Authorization → usuario dev de entorno.
    if (!isAzure && !authz) {
      const p = devPrincipal();
      const externalId = buildExternalId(p.tid, p.oid);
      const id = await ensureUser({ externalId, tenantId: p.tid, email: p.email, name: p.name });
      req.user = { id, externalId, tenantId: p.tid, oid: p.oid, email: p.email, name: p.name };
      return next();
    }

    if (!authz || !authz.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Falta el token de acceso' } });
    }
    const token = authz.slice('Bearer '.length).trim();

    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Token inválido o expirado' } });
    }

    // Gate interino: solo correos en lista blanca (fail-closed).
    if (!isAllowed(claims.email, allowlist)) {
      return res.status(403).json({ error: { code: 'NOT_ALLOWLISTED', message: 'Cuenta no autorizada (acceso restringido)' } });
    }

    const externalId = buildExternalId(claims.tid, claims.oid);
    const id = await ensureUser({ externalId, tenantId: claims.tid, email: claims.email, name: claims.name });
    req.user = { id, externalId, tenantId: claims.tid, oid: claims.oid, email: claims.email, name: claims.name };
    next();
  } catch (err) {
    console.error('Identity middleware error:', err);
    res.status(500).json({ error: { code: 'IDENTITY_FAILED', message: err.message } });
  }
}
