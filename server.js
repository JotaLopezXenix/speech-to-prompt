import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
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

// Serve static frontend
app.use(express.static(join(__dirname, 'public')));

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
// (Easy Auth en Azure; usuario dev en local) y deja req.user disponible.
app.use('/api/sessions', identity);
app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', transcribeRouter);
app.use('/api/sessions', distillRouter);
app.use('/api/prompts', promptsRouter);
// Telemetría de captura: owner-scoped (mismo principal que /api/sessions).
app.use('/api/diagnostics', identity);
app.use('/api/diagnostics', diagnosticsRouter);

// Fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

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
