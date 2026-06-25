// Sincroniza los prompts por familia desde src/prompts/<familia>/<modo>.md a la BD
// (dbo.model_prompts). La BD es la fuente en runtime; estos ficheros son el ORIGEN
// versionado en git. Idempotente (upsert): editar un .md y re-ejecutar actualiza la
// fila. Cada familia = un subdirectorio de src/prompts/.
//
// Uso: npm run seed-prompts   (carga .env para la conexión SQL)
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getRequest, sql } from '../src/services/db.js';
import { DISTILL_MODES } from '../src/prompts/index.js';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'prompts');

const families = readdirSync(PROMPTS_DIR).filter((f) => {
  try { return statSync(join(PROMPTS_DIR, f)).isDirectory(); } catch { return false; }
});

let n = 0;
for (const family of families) {
  for (const mode of DISTILL_MODES) {
    const file = join(PROMPTS_DIR, family, `${mode}.md`);
    let text;
    try { text = readFileSync(file, 'utf-8'); } catch { continue; } // modo ausente en esa familia
    const req = await getRequest();
    req.input('family', sql.VarChar(20), family);
    req.input('mode', sql.VarChar(20), mode);
    req.input('text', sql.NVarChar(sql.MAX), text);
    await req.query(`
      MERGE dbo.model_prompts AS t
      USING (SELECT @family AS family, @mode AS mode) AS s
        ON (t.family = s.family AND t.mode = s.mode)
      WHEN MATCHED THEN UPDATE SET text = @text, updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (family, mode, text) VALUES (@family, @mode, @text);
    `);
    n++;
    console.log(`  ✔ ${family}/${mode}`);
  }
}
console.log(`${n} prompt(s) sincronizados a dbo.model_prompts.`);
process.exit(0);
