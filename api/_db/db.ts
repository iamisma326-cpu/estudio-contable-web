/**
 * Cliente Postgres para los handlers serverless.
 *
 * Driver: @neondatabase/serverless (transporte HTTP). Cada invocación de
 * Vercel es efímera y puede abrir miles de instancias en paralelo; el
 * driver HTTP no mantiene sockets ni necesita pool, así que no agota las
 * conexiones de Postgres. Para consultas sueltas (que es todo lo que hace
 * esta app) es la opción más simple y barata.
 *
 * DATABASE_URL es la cadena *pooled*; las migraciones usan
 * DATABASE_URL_UNPOOLED (ver scripts/db-migrate.mjs).
 */

import { neon } from '@neondatabase/serverless';

type NeonClient = ReturnType<typeof neon>;

let client: NeonClient | null = null;

function getClient(): NeonClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está configurada');
  if (!client) client = neon(url);
  return client;
}

/** SELECT/INSERT/UPDATE/DELETE con parámetros posicionales ($1, $2 …). */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const rows = await getClient().query(text, params);
  return rows as unknown as T[];
}

/** Primera fila o null. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
