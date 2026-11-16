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

// ------------------------------------------------------------
// Suscripciones iniciales de los clientes que ya existen.
//
// El plan (docs/PLAN-NOTICIAS.md §8) marca el email como canal por defecto
// para quien ya es cliente del estudio. La fila solo se crea si la tabla
// existe y si el usuario no se ha dado de baja antes: ON CONFLICT DO NOTHING
// respeta cualquier preferencia guardada por /api/suscripcion.
//
// `neon_auth` lo administra Neon Auth y puede no existir en una base nueva;
// por eso se comprueba antes de consultar, en vez de asumir el esquema.
// ------------------------------------------------------------
const [{ auth_schema }] = await sql.query(
  `SELECT to_regclass('neon_auth."user"') IS NOT NULL AS auth_schema`
);

if (auth_schema) {
  const seeded = await sql.query(
    `INSERT INTO public.suscripciones (user_id, email, canal_email, consentimiento_en)
     SELECT u.id, u.email, true, now()
       FROM neon_auth."user" u
      WHERE u.email IS NOT NULL AND u.email <> '' AND u.banned IS NOT TRUE
     ON CONFLICT (user_id) DO NOTHING
     RETURNING user_id`
  );
  console.log(`Suscripciones de email sembradas: ${seeded.length}.`);
} else {
  console.log('neon_auth no existe todavía; se omite la semilla de suscripciones.');
}

const [{ resources }] = await sql.query(
  'SELECT count(*)::int AS resources FROM public.resources'
);
const [{ profiles }] = await sql.query(
  'SELECT count(*)::int AS profiles FROM public.profiles'
);
console.log(`Recursos publicados: ${resources}. Perfiles: ${profiles}.`);
