// Runner de migraciones de esquema (forward-only, SQL a mano — D14).
//
// Aplica los ficheros migrations/NNN_*.sql que aún no estén registrados en la
// tabla de control dbo.schema_migrations. Idempotente: re-ejecutarlo no repite.
//
// Uso (local):   npm run migrate            (carga .env vía --env-file)
// Uso (Azure):   node scripts/migrate-db.js (env desde App Settings; paso de despliegue)

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPool, sql } from '../src/services/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function ensureControlTable(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
      CREATE TABLE dbo.schema_migrations (
        name       NVARCHAR(260) NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY,
        applied_at DATETIME2(3)  NOT NULL CONSTRAINT DF_schema_migrations_applied DEFAULT SYSUTCDATETIME()
      );
  `);
}

async function appliedSet(pool) {
  const r = await pool.request().query(`SELECT name FROM dbo.schema_migrations`);
  return new Set(r.recordset.map((x) => x.name));
}

// Divide en lotes por líneas que contengan solo GO (separador de cliente, no T-SQL).
function splitBatches(text) {
  return text
    .split(/^[\t ]*GO[\t ]*;?[\t ]*$/gim)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function run() {
  const pool = await getPool();
  await ensureControlTable(pool);
  const done = await appliedSet(pool);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;

    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const batch of splitBatches(text)) {
        await new sql.Request(tx).batch(batch);
      }
      await new sql.Request(tx)
        .input('name', sql.NVarChar(260), file)
        .query(`INSERT INTO dbo.schema_migrations (name) VALUES (@name)`);
      await tx.commit();
      console.log(`✔ aplicada ${file}`);
      applied++;
    } catch (err) {
      try { await tx.rollback(); } catch { /* noop */ }
      throw new Error(`Fallo aplicando ${file}: ${err.message}`);
    }
  }

  console.log(applied ? `${applied} migración(es) aplicada(s).` : 'Sin migraciones pendientes.');
  await pool.close();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
