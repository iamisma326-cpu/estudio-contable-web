/**
 * GET /api/auth/me
 *   200 { ok: true, user: { id, email, name, role, banned, profile } }
 *   401 sin token válido · 403 cuenta suspendida
 *
 * El cliente lo usa para saber el ROL de aplicación (Better Auth no expone
 * un rol nuestro en el JWT) y para cargar los datos de perfil.
 */

import { queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed } from '../_auth/http.js';
import { requireUser } from '../_auth/guard.js';

export interface ProfileRow {
  empresa: string | null;
  ruc: string | null;
  telefono: string | null;
  notas: string | null;
  created_at: string;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const profile = await queryOne<ProfileRow>(
    `SELECT empresa, ruc, telefono, notas, created_at
       FROM public.profiles
      WHERE user_id = $1
      LIMIT 1`,
    [user.id]
  );

  res.status(200).json({ ok: true, user: { ...user, profile } });
}
