import sql from 'mssql';

// Única capa que habla con SQL Server / Azure SQL. El resto del repo usa
// session-store (y los scripts), nunca `mssql` directamente.
//
// Selección de autenticación por entorno (mismo patrón que server.js):
//  - Azure (WEBSITE_HOSTNAME presente) → Managed Identity, sin secretos.
//  - Local                             → SQL auth desde .env.

const isAzure = !!process.env.WEBSITE_HOSTNAME;

function buildConfig() {
  if (!process.env.SQL_SERVER || !process.env.SQL_DATABASE) {
    throw new Error(
      'Faltan las variables de conexión a SQL (SQL_SERVER/SQL_DATABASE). ' +
      'En local, arranca con `npm start` o `npm run dev` (cargan el .env). ' +
      'En Azure, defínelas en App Settings.'
    );
  }

  const base = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: process.env.SQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
    },
  };

  if (isAzure) {
    // Managed Identity del App Service: sin usuario/contraseña.
    return {
      ...base,
      authentication: { type: 'azure-active-directory-msi-app-service' },
      options: { ...base.options, encrypt: true },
    };
  }

  // Dev → Azure SQL con identidad Entra del desarrollador (vía `az login`).
  // Resuelve el riesgo del DESIGN §11 (la MI no existe fuera de Azure): permite
  // ejecutar migrate/seed-prompts y depurar contra el Azure SQL real (Entra-only)
  // desde la máquina del admin, sin secretos. Opt-in explícito con SQL_AUTH.
  if (process.env.SQL_AUTH === 'entra-default') {
    return {
      ...base,
      authentication: { type: 'azure-active-directory-default' },
      options: { ...base.options, encrypt: true },
    };
  }

  return {
    ...base,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: Number(process.env.SQL_PORT) || 1433,
  };
}

// Códigos de error transitorios de Azure SQL (incluido el "reanudando" de
// Serverless tras la auto-pausa). Ante ellos, reintentamos.
const TRANSIENT_NUMBERS = new Set([40613, 4060, 40197, 49918, 49919, 49920, 10928, 10929, 11001]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err) {
  const num = err?.number ?? err?.code;
  if (TRANSIENT_NUMBERS.has(num)) return true;
  return /timeout|ETIMEOUT|ESOCKET|ECONNCLOSED|ECONNRESET|currently unavailable|not currently available/i.test(
    err?.message || ''
  );
}

// Reintento con backoff exponencial (1s, 2s, 4s, 8s, 16s ≈ ~30s). Pensado sobre
// todo para el arranque en frío de Serverless: la primera conexión tras la
// pausa suele fallar mientras la BD se reanuda.
export async function withRetry(fn, { tries = 6, baseMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === tries - 1) throw err;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastErr;
}

let poolPromise = null;

// Pool único memoizado. El connect() inicial va con reintento (cold-start).
export function getPool() {
  if (!poolPromise) {
    poolPromise = withRetry(() => new sql.ConnectionPool(buildConfig()).connect()).catch((err) => {
      poolPromise = null; // permite reintentar en la próxima llamada
      throw err;
    });
  }
  return poolPromise;
}

// Crea un Request sobre el pool. Para enlazar parámetros con tipo explícito:
//   const req = await getRequest();
//   req.input('id', sql.Int, 5);
export async function getRequest() {
  const pool = await getPool();
  return pool.request();
}

// Atajo para consultas simples sin parámetros (o con tipos inferidos).
export async function query(text, params = {}) {
  const req = await getRequest();
  for (const [name, value] of Object.entries(params)) req.input(name, value);
  return req.query(text);
}

// Ejecuta `fn(tx)` dentro de una transacción; commit al terminar, rollback ante error.
export async function withTransaction(fn) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try { await tx.rollback(); } catch { /* la transacción pudo no haber empezado */ }
    throw err;
  }
}

export { sql };
