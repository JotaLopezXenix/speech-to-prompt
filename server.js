import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { existsSync } from 'fs';
import open from 'open';
import { ensureDirectories } from './src/utils/paths.js';
import configRouter from './src/routes/config.js';
import sessionsRouter from './src/routes/sessions.js';
import transcribeRouter from './src/routes/transcribe.js';
import distillRouter from './src/routes/distill.js';
import promptsRouter from './src/routes/prompts.js';
import diagnosticsRouter from './src/routes/diagnostics.js';
import healthRouter from './src/routes/health.js';
import authConfigRouter from './src/routes/auth-config.js';
import { identity } from './src/middleware/identity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure ~/.speech-to-prompt/ directories exist
ensureDirectories();

// Aviso temprano en local si no se cargó el .env (las llamadas a SQL fallarían).
if (!process.env.WEBSITE_HOSTNAME && !process.env.SQL_SERVER) {
  console.warn('⚠  Falta SQL_SERVER. Arranca con `npm start` o `npm run dev` (cargan .env); las llamadas a la BD fallarán.');
}

const app = express();

// Middleware
app.use(express.json());

// API routes
// Warm-up de la BD: sin identity (no toca datos), para despertar la Serverless.
app.use('/api/health', healthRouter);
// Config pública de MSAL para el front (sin identity: se necesita antes de autenticar).
app.use('/api/auth-config', authConfigRouter);
// /api/config gestiona API keys/proveedores: ahora EXIGE auth (antes lo tapaba
// Easy Auth a nivel plataforma; ciclo identidad-entra lo protege en la app).
app.use('/api/config', identity);
app.use('/api/config', configRouter);
// Identidad + aislamiento: todo /api/sessions exige principal autenticado
// (token bearer en Azure; usuario dev en local) y deja req.user disponible.
app.use('/api/sessions', identity);
app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', transcribeRouter);
app.use('/api/sessions', distillRouter);
// Prompts de destilado: IP del producto → también protegido (SPEC §2). Antes lo
// tapaba Easy Auth a nivel plataforma; al retirarlo, se protege en la app.
app.use('/api/prompts', identity);
app.use('/api/prompts', promptsRouter);
// Telemetría de captura: owner-scoped (mismo principal que /api/sessions).
app.use('/api/diagnostics', identity);
app.use('/api/diagnostics', diagnosticsRouter);

// --- Alias de versión /api/v1 (SPEC-02, ciclo 2b) ----------------------------
// Espejo ADITIVO del contrato actual: remonta los MISMOS routers con idéntico
// orden de `identity`. /api/* (sin versión) queda byte-idéntico para el frontend
// viejo; el frontend nuevo consume /api/v1 vía su cliente tipado. La fuente de
// verdad del contrato es openapi/speech-to-prompt.yaml.
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth-config', authConfigRouter);
app.use('/api/v1/config', identity);
app.use('/api/v1/config', configRouter);
app.use('/api/v1/sessions', identity);
app.use('/api/v1/sessions', sessionsRouter);
app.use('/api/v1/sessions', transcribeRouter);
app.use('/api/v1/sessions', distillRouter);
app.use('/api/v1/prompts', identity);
app.use('/api/v1/prompts', promptsRouter);
app.use('/api/v1/diagnostics', identity);
app.use('/api/v1/diagnostics', diagnosticsRouter);

// Frontend nuevo (web/) servido en la RAÍZ (cutover SPEC-07, cierre del ciclo 2b).
const webDist = join(__dirname, 'web', 'dist');

// Redirect transitorio: el /app del sub-ciclo 2b ya no existe → raíz (302, no
// permanente para poder retirarlo en una limpieza posterior). Preserva la query.
app.get(['/app', '/app/*'], (req, res) => {
  // req.path excluye la query; el prefijo /app se sustituye sobre el path y se
  // re-adjunta la query. Así /app?x=1 → /?x=1 (evita el bucle 302: el destino
  // siempre arranca con '/', no vuelve a casar la ruta /app).
  const qs = req.originalUrl.slice(req.path.length);
  res.redirect(302, (req.path.replace(/^\/app/, '') || '/') + qs);
});

// Estáticos del build + fallback SPA (cualquier ruta no-API → index del SPA). La
// guarda existsSync evita 500 en local si aún no hay build (solo /api responde;
// el desarrollo usa Vite en :5173).
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res) => res.sendFile(join(webDist, 'index.html')));
}

// Start server with port fallback
async function startServer(port = 3000) {
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < 3010) {
        console.log(`Puerto ${port} ocupado, probando ${port + 1}...`);
        resolve(startServer(port + 1));
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${port}`;
      console.log(`\n🎙  Speech-to-Prompt`);
      console.log(`   Servidor: ${url}`);
      console.log(`   Presiona Ctrl+C para detener\n`);
      // STP_NO_OPEN (lo pone el script `dev` vía .env): no abrir navegador.
      // Evita que cada reinicio de --watch abra una pestaña nueva.
      if (!process.env.STP_NO_OPEN) open(url);
      resolve(server);
    });
  });
}

// In Azure App Service (WEBSITE_HOSTNAME is injected by the platform) run as a
// plain service: listen on the injected PORT and 0.0.0.0, no browser auto-open,
// no single-instance guard, no port fallback. Locally, behaviour is unchanged.
if (process.env.WEBSITE_HOSTNAME) {
  const port = process.env.PORT || 3000;
  createServer(app).listen(port, '0.0.0.0', () => {
    console.log(`🎙  Speech-to-Prompt escuchando en el puerto ${port} (Azure App Service)`);
  });
} else if (process.env.STP_NO_OPEN) {
  // Modo desarrollo (`npm run dev` con --watch): sin single-instance guard ni
  // apertura de navegador. --watch gestiona el proceso único, y así sus reinicios
  // no abren pestañas nuevas. Abre tú http://localhost:3000 una vez.
  startServer().catch(err => {
    console.error('Error al iniciar el servidor:', err);
    process.exit(1);
  });
} else {
  (async () => {
    // Si ya hay una instancia corriendo, solo abrir el navegador y salir
    try {
      const res = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        console.log('Instancia ya en ejecución. Abriendo navegador...');
        open('http://localhost:3000');
        process.exit(0);
      }
    } catch {
      // No hay instancia corriendo, arrancar normalmente
    }

    startServer().catch(err => {
      console.error('Error al iniciar el servidor:', err);
      process.exit(1);
    });
  })();
}
