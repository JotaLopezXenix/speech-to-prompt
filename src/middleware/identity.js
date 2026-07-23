import { ensureUser } from '../services/user-store.js';
import { verifyAccessToken, buildExternalId } from '../services/token-verify.js';
import { hasActiveAccess, bindPendingEntitlements } from '../services/entitlement-store.js';

// Middleware de identidad para las rutas protegidas. Resuelve el principal
// autenticado y deja `req.user = { id, externalId, tenantId, oid, email, name }`
// (id = users.id interno, vía JIT). Ciclo identidad-entra: sustituye Easy Auth por
// validación stateless de token bearer (Entra multi-tenant + MSA).
//
//  - Azure: exige `Authorization: Bearer <access token>`; valida el token, aprovisiona/
//    actualiza el usuario (JIT) y aplica el gate por suscripción (¿acceso activo?).
//    (Ciclo marketplace-transactable SPEC-01: sustituye la lista blanca interina.)
//  - Local (sin WEBSITE_HOSTNAME y sin cabecera Authorization): usuario dev de
//    entorno (DEV_USER_*), sin tokens y sin gate, para no frenar el desarrollo.

const isAzure = !!process.env.WEBSITE_HOSTNAME;

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

    // Aprovisiona/actualiza el usuario (JIT) → necesitamos su id interno para el gate.
    const externalId = buildExternalId(claims.tid, claims.oid);
    const id = await ensureUser({ externalId, tenantId: claims.tid, email: claims.email, name: claims.name });

    // Gate por suscripción: vincula concesiones creadas por email (primer login) y exige acceso activo.
    await bindPendingEntitlements(id, claims.email);
    if (!(await hasActiveAccess(id))) {
      return res.status(403).json({ error: { code: 'NO_ACCESS', message: 'Tu cuenta no tiene una suscripción activa' } });
    }

    req.user = { id, externalId, tenantId: claims.tid, oid: claims.oid, email: claims.email, name: claims.name };
    next();
  } catch (err) {
    console.error('Identity middleware error:', err);
    res.status(500).json({ error: { code: 'IDENTITY_FAILED', message: err.message } });
  }
}
