/**
 * Siembra la cuenta admin en Neon Auth (Managed Better Auth).
 *
 * Credencial requerida:  usuario "admin"  /  contraseña "admin#1"
 *
 * Por qué se inserta a mano en lugar de usar /sign-up/email:
 *   Better Auth impone un mínimo de 8 caracteres y "admin#1" tiene 7, así que
 *   el endpoint público lo rechaza con PASSWORD_TOO_SHORT. La cuenta admin es
 *   un bootstrap del dueño del sistema, no un registro público: se escribe la
 *   fila de `neon_auth.user` + `neon_auth.account` con el mismo esquema de
 *   hash que usa Better Auth, de modo que `signIn.email` la valida normal
 *   (formato verificado contra un usuario creado por el propio proveedor:
 *   salt hex como ASCII + scrypt N=16384, r=16, p=1, dkLen=64).
 *
 * El login del panel acepta "admin" (sin @) y lo mapea al email de la cuenta.
 *
 * Uso: npm run db:seed-admin
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin#1';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@sanchezdelgado.pe').toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL_UNPOOLED o DATABASE_URL en el entorno.');
  process.exit(1);
}
const sql = neon(url);

/** Hash compatible con Better Auth: "<saltHex>:<scryptHex>". */
function betterAuthHash(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 512 * 1024 * 1024,
  });
  return `${salt}:${hash.toString('hex')}`;
}

const existing = await sql.query(
  'SELECT id FROM neon_auth.user WHERE lower(email) = lower($1) LIMIT 1',
  [ADMIN_EMAIL]
);

let userId = existing[0]?.id;

if (!userId) {
  const inserted = await sql.query(
    `INSERT INTO neon_auth."user" (name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
     VALUES ($1, $2, true, 'admin', false, now(), now())
     RETURNING id`,
    [ADMIN_NAME, ADMIN_EMAIL]
  );
  userId = inserted[0].id;
  console.log(`Usuario admin creado en Neon Auth (${ADMIN_EMAIL}).`);
} else {
  await sql.query(
    `UPDATE neon_auth."user"
        SET role = 'admin', banned = false, "banReason" = NULL, "banExpires" = NULL, "updatedAt" = now()
      WHERE id = $1`,
    [userId]
  );
  console.log(`Usuario admin existente actualizado (${ADMIN_EMAIL}).`);
}

const password = betterAuthHash(ADMIN_PASSWORD);
const account = await sql.query(
  `SELECT id FROM neon_auth.account
    WHERE "userId" = $1 AND "providerId" = 'credential'
    LIMIT 1`,
  [userId]
);

if (account.length === 0) {
  await sql.query(
    `INSERT INTO neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, now(), now())`,
    [userId, password]
  );
} else {
  await sql.query(
    `UPDATE neon_auth.account
        SET password = $2, "updatedAt" = now()
      WHERE id = $1`,
    [account[0].id, password]
  );
}

// Perfil de aplicación (datos que Better Auth no guarda).
await sql.query(
  `INSERT INTO public.profiles (user_id, notas)
   VALUES ($1, 'Cuenta administradora del panel')
   ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
  [userId]
);

// Sesiones viejas del admin: al cambiar la clave conviene cerrarlas.
await sql.query('DELETE FROM neon_auth.session WHERE "userId" = $1', [userId]);

console.log(`Listo. Entra con usuario "${ADMIN_USERNAME}" y la contraseña configurada.`);
