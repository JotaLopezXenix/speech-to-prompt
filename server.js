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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure ~/.speech-to-prompt/ directories exist
ensureDirectories();

const app = express();

// Middleware
app.use(express.json());

// Serve static frontend
app.use(express.static(join(__dirname, 'public')));

// API routes
app.use('/api/config', configRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions', transcribeRouter);
app.use('/api/sessions', distillRouter);

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
      open(url);
      resolve(server);
    });
  });
}

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
