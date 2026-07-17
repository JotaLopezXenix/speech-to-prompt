import { Router } from 'express';

const router = Router();

// Config PÚBLICA (no secreta) para inicializar MSAL en el frontend. No lleva
// `identity`: el front la necesita ANTES de autenticarse. Ciclo identidad-entra.
//
// En local (sin WEBSITE_HOSTNAME) devuelve { devBypass: true }: el front no monta
// MSAL ni gatea, en espejo del bypass del middleware `identity`.
router.get('/', (req, res) => {
  if (!process.env.WEBSITE_HOSTNAME) {
    return res.json({ devBypass: true });
  }
  res.json({
    clientId: process.env.ENTRA_CLIENT_ID || null,
    authority: process.env.ENTRA_AUTHORITY || 'https://login.microsoftonline.com/common',
    apiScope: process.env.ENTRA_API_SCOPE || null,
  });
});

export default router;
