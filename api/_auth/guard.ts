/**
 * Verificación de identidad para los handlers serverless.
 *
 * Neon Auth (Managed Better Auth) emite JWT EdDSA de 15 min. El cliente los
 * pide con `authClient.token()` y los manda como `Authorization: Bearer …`.
 *
 * Aquí solo se valida la FIRMA contra el JWKS del branch y se resuelve el
 * usuario en `neon_auth.user`. El claim `role` del JWT no se usa como
 * autorización: la fuente de verdad es la fila de la base de datos, que es
 * también la que permite suspender una cuenta sin esperar a que expire el
 * token.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from './http.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  banned: boolean;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
}

// El JWKS se cachea por instancia: jose refresca solo cuando rota la clave.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const url = process.env.NEON_AUTH_JWKS_URL;
  if (!url) throw new Error('NEON_AUTH_JWKS_URL no está configurada');
  if (!jwks) jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

function bearerToken(req: ReqLike): string | null {
  const raw = req.headers?.['authorization'] ?? req.headers?.['Authorization'];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

/** Verifica el token y devuelve el usuario de la BD, o null. */
export async function getUser(req: ReqLike): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;

  let sub: string | undefined;
  try {
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const issuer = baseUrl ? new URL(baseUrl).origin : undefined;
    const { payload } = await jwtVerify(
      token,
      getJwks(),
      issuer ? { issuer, audience: issuer } : undefined
    );
    sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch {
    return null;
  }
  if (!sub) return null;

  const row = await queryOne<UserRow>(
    `SELECT id, email, name, role, banned FROM neon_auth."user" WHERE id = $1 LIMIT 1`,
    [sub]
  );
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === 'admin' ? 'admin' : 'user',
    banned: row.banned === true,
  };
}

/** Guard: sesión válida y no suspendida. Escribe 401/403 y devuelve null. */
export async function requireUser(req: ReqLike, res: ResLike): Promise<AuthUser | null> {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'not_authenticated' });
    return null;
  }
  if (user.banned) {
    res.status(403).json({ ok: false, error: 'account_suspended' });
    return null;
  }
  return user;
}

/** Guard: además exige role = 'admin'. */
export async function requireAdmin(req: ReqLike, res: ResLike): Promise<AuthUser | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return null;
  }
  return user;
}
