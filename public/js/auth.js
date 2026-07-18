// Envoltura mínima e INTERINA sobre MSAL (window.msal, vendorizado en /vendor).
// Ciclo identidad-entra: el ciclo 2 rehace el frontend con build → aquí solo lo
// funcional para obtener un access token y adjuntarlo. Sin UI elaborada.
//
// En local, /api/auth-config devuelve { devBypass: true }: no se monta MSAL ni se
// gatea, en espejo del bypass del middleware `identity`.

let msalApp = null;
let account = null;
let apiScope = null;
let devBypass = false;

export async function initAuth() {
  let cfg = {};
  try {
    cfg = await fetch('/api/auth-config').then((r) => r.json());
  } catch {
    cfg = {};
  }

  if (cfg.devBypass) {
    devBypass = true;
    return;
  }
  if (!window.msal) throw new Error('MSAL no cargado (public/vendor/msal-browser.min.js)');

  apiScope = cfg.apiScope;
  msalApp = new window.msal.PublicClientApplication({
    auth: { clientId: cfg.clientId, authority: cfg.authority, redirectUri: window.location.origin },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await msalApp.initialize();

  const resp = await msalApp.handleRedirectPromise();
  if (resp && resp.account) {
    account = resp.account;
  } else {
    const accts = msalApp.getAllAccounts();
    if (accts.length) account = accts[0];
  }
}

export function isDevBypass() {
  return devBypass;
}

export function getAccount() {
  return devBypass ? { username: 'dev' } : account;
}

export async function login() {
  if (devBypass) return;
  await msalApp.loginRedirect({ scopes: [apiScope] });
}

export function logout() {
  if (devBypass || !msalApp) return;
  msalApp.logoutRedirect();
}

// Access token para la API, o null si no se puede en silencio (el caller decide).
export async function getToken() {
  if (devBypass || !msalApp || !account) return null;
  try {
    const r = await msalApp.acquireTokenSilent({ scopes: [apiScope], account });
    return r.accessToken;
  } catch {
    return null;
  }
}

// Adquisición interactiva tras un 401 irrecuperable: redirige a login (navega fuera).
export function acquireInteractive() {
  if (devBypass || !msalApp) return;
  msalApp.acquireTokenRedirect({ scopes: [apiScope] });
}
