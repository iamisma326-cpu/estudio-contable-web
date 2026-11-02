/**
 * Aplica db/schema.sql (perfiles, recursos, métricas).
 *
 * Uso: npm run db:migrate
 *
 * Va por DATABASE_URL_UNPOOLED (conexión directa): el pooler de Neon corre en
 * modo transacción y el DDL de una sentada no siempre sobrevive ahí. El
 * runtime de la app usa DATABASE_URL (pooled).
 *
 * La identidad NO se migra aquí: la administra Neon Auth sobre el esquema
 * `neon_auth`. La cuenta admin se siembra con `npm run db:seed-admin`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL_UNPOOLED o DATABASE_URL en el entorno.');
  process.exit(1);
}

/**
 * Parte el .sql en sentencias. Solo respeta comillas simples (no hay
 * dollar-quoting ni funciones en el esquema).
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let inSingle = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inSingle && sql[i + 1] === "'") {
        buf += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (ch === ';' && !inSingle) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) =>
    s
      .split('\n')
      .map((l) => l.trim())
      .some((l) => l && !l.startsWith('--'))
  );
}

const sql = neon(url);
const statements = splitStatements(readFileSync(resolve(root, 'db/schema.sql'), 'utf8'));

console.log(`Aplicando ${statements.length} sentencias de db/schema.sql…`);
for (const statement of statements) {
  await sql.query(statement);
}
console.log('Esquema aplicado.');

const [{ resources }] = await sql.query(
  'SELECT count(*)::int AS resources FROM public.resources'
);
const [{ profiles }] = await sql.query(
  'SELECT count(*)::int AS profiles FROM public.profiles'
);
console.log(`Recursos publicados: ${resources}. Perfiles: ${profiles}.`);
