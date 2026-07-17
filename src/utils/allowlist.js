// Lista blanca de correos permitidos — gate INTERINO del ciclo identidad-entra:
// entre que se abre el login a cualquier cuenta Microsoft (este ciclo) y que llega
// la verja de suscripción (ciclo marketplace-transactable). Se retira entonces.
//
// Fail-closed a propósito (SPEC §4): email ausente o lista vacía → denegar.

// "a@x.com, B@Y.com ,," → Set { 'a@x.com', 'b@y.com' }
export function parseAllowlist(raw) {
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowed(email, allow) {
  if (!email) return false;                 // fail-closed
  if (!allow || allow.size === 0) return false; // fail-closed
  return allow.has(String(email).trim().toLowerCase());
}
