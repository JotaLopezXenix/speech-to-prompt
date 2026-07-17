import { createRemoteJWKSet, jwtVerify } from 'jose';

// Validación stateless del access token emitido por la plataforma de identidad de
// Microsoft (Entra multi-tenant + cuentas personales MSA). Ciclo identidad-entra.
//
// Seguridad (SPEC §8 / R1): se restringe a RS256 (evita el ataque alg=none), se
// valida firma contra las claves públicas de Microsoft (JWKS), la audiencia
// (nuestra API) y la expiración; el issuer se valida MANUALMENTE contra el `tid`
// del propio token porque en multi-tenant no hay un issuer fijo.

const JWKS_URL = new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys');

let _jwks = null;
function getJwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(JWKS_URL); // cachea claves + rotación
  return _jwks;
}

// tid.oid — clave canónica estable/única multi-tenant (SPEC §4). Pura, testeable.
export function buildExternalId(tid, oid) {
  return `${tid}.${oid}`;
}

// Email del principal por precedencia de claims. Pura, testeable.
export function extractEmail(payload) {
  return payload.preferred_username || payload.email || payload.upn || null;
}

// El issuer debe ser exactamente el del tenant del token, en formato v2.0. Pura, testeable.
// REQUISITO DE CONFIGURACIÓN (H2 de la review): el registro de app debe emitir tokens
// v2.0 (`requestedAccessTokenVersion: 2` en el manifiesto / "Expose an API"); en v1.0 el
// issuer es `https://sts.windows.net/{tid}/` y aquí se rechazaría (falla cerrado). Ver la
// guía del registro de app Entra.
export function assertIssuer(payload) {
  const expected = `https://login.microsoftonline.com/${payload.tid}/v2.0`;
  if (payload.iss !== expected) {
    throw new Error(`issuer inesperado: ${payload.iss}`);
  }
}

// Defensa en profundidad (H4 de la review): el token debe portar el scope delegado
// esperado (`scp` es una cadena separada por espacios). Desactivable con
// ENTRA_REQUIRED_SCOPE='' si el registro nombra el scope de otra forma. Pura, testeable.
export function assertScope(payload, requiredScope) {
  if (!requiredScope) return;
  const scopes = typeof payload.scp === 'string' ? payload.scp.split(' ') : [];
  if (!scopes.includes(requiredScope)) {
    throw new Error(`falta el scope requerido: ${requiredScope}`);
  }
}

// Verifica el token y devuelve { tid, oid, email, name }. Lanza si algo no cuadra
// (el middleware traduce a 401). ENTRA_API_AUDIENCE admite varias audiencias
// separadas por coma (p. ej. el client id y `api://{clientid}`).
export async function verifyAccessToken(token) {
  const audience = (process.env.ENTRA_API_AUDIENCE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!audience.length) throw new Error('ENTRA_API_AUDIENCE no configurada');

  const { payload } = await jwtVerify(token, getJwks(), {
    audience,
    algorithms: ['RS256'],
    // issuer NO se fija aquí (multi-tenant): se valida abajo contra el tid.
  });
  assertIssuer(payload);
  assertScope(payload, process.env.ENTRA_REQUIRED_SCOPE ?? 'access_as_user');

  const { tid, oid } = payload;
  if (!tid || !oid) throw new Error('token sin tid/oid');
  return { tid, oid, email: extractEmail(payload), name: payload.name || null };
}
