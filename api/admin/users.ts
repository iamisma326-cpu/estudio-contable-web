/**
 * Gestión de usuarios (solo admin).
 *
 * GET /api/admin/users?q=&role=&status=&page=1&limit=20
 *   Lista paginada con perfil. `status` = active | suspended.
 *
 * PATCH /api/admin/users  { id, action }
 *   action: 'promote'  → role = 'admin'
 *           'demote'   → role = 'user'
 *           'suspend'  → banned = true (Better Auth y nuestros Guards lo respetan)
 *           'activate' → banned = false
 *           'delete'   → borra cuenta, sesiones y perfil
 *
 * Protecciones: el admin no puede degradarse, suspenderse ni borrarse a sí
 * mismo (dejaría el panel sin acceso).
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../_auth/http.js';
import { requireAdmin } from '../_auth/guard.js';

interface UserListRow {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
  last_session_at: string | null;
  empresa: string | null;
  telefono: string | null;
}

const ACTIONS = new Set(['promote', 'demote', 'suspend', 'activate', 'delete']);

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, PATCH');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    const q = (queryParam(req, 'q') ?? '').trim();
    const role = queryParam(req, 'role') ?? '';
    const status = queryParam(req, 'status') ?? '';
    const page = Math.max(1, Number(queryParam(req, 'page') ?? 1) || 1);
    const limit = Math.min(100, Math.max(5, Number(queryParam(req, 'limit') ?? 20) || 20));
    const offset = (page - 1) * limit;

    const filters = `
      WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
        AND ($2 = '' OR u.role = $2)
        AND ($3 = '' OR ($3 = 'suspended' AND u.banned) OR ($3 = 'active' AND NOT u.banned))
    `;

    const users = await query<UserListRow>(
      `SELECT u.id, u.name, u.email, u.role, u.banned, u."createdAt",
              (SELECT max(s."createdAt") FROM neon_auth.session s WHERE s."userId" = u.id) AS last_session_at,
              p.empresa, p.telefono
         FROM neon_auth."user" u
         LEFT JOIN public.profiles p ON p.user_id = u.id
         ${filters}
        ORDER BY u."createdAt" DESC
        LIMIT $4 OFFSET $5`,
      [q, role, status, limit, offset]
    );

    const total = await queryOne<{ count: number }>(
      `SELECT count(*)::int AS count FROM neon_auth."user" u ${filters}`,
      [q, role, status]
    );

    res.status(200).json({
      ok: true,
      users,
      page,
      limit,
      total: total?.count ?? 0,
      pages: Math.max(1, Math.ceil((total?.count ?? 0) / limit)),
    });
    return;
  }

  if (req.method === 'PATCH') {
    const body = (await readJsonBody(req)) as { id?: unknown; action?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const action = typeof body?.action === 'string' ? body.action : '';

    if (!/^[0-9a-f-]{36}$/i.test(id) || !ACTIONS.has(action)) {
      res.status(400).json({ ok: false, error: 'invalid_request' });
      return;
    }
    if (id === admin.id && action !== 'promote') {
      res.status(400).json({ ok: false, error: 'cannot_modify_self' });
      return;
    }

    const target = await queryOne<{ id: string }>(
      'SELECT id FROM neon_auth."user" WHERE id = $1 LIMIT 1',
      [id]
    );
    if (!target) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    switch (action) {
      case 'promote':
      case 'demote':
        await query(
          `UPDATE neon_auth."user" SET role = $2, "updatedAt" = now() WHERE id = $1`,
          [id, action === 'promote' ? 'admin' : 'user']
        );
        break;
      case 'suspend':
        await query(
          `UPDATE neon_auth."user"
              SET banned = true, "banReason" = 'Suspendido desde el panel', "banExpires" = NULL, "updatedAt" = now()
            WHERE id = $1`,
          [id]
        );
        // Cierra las sesiones abiertas: el ban aplica de inmediato.
        await query('DELETE FROM neon_auth.session WHERE "userId" = $1', [id]);
        break;
      case 'activate':
        await query(
          `UPDATE neon_auth."user"
              SET banned = false, "banReason" = NULL, "banExpires" = NULL, "updatedAt" = now()
            WHERE id = $1`,
          [id]
        );
        break;
      case 'delete':
        await query('DELETE FROM neon_auth.session WHERE "userId" = $1', [id]);
        await query('DELETE FROM neon_auth.account WHERE "userId" = $1', [id]);
        await query('DELETE FROM public.profiles WHERE user_id = $1', [id]);
        await query('DELETE FROM neon_auth."user" WHERE id = $1', [id]);
        break;
    }

    res.status(200).json({ ok: true, id, action });
    return;
  }

  methodNotAllowed(res);
}
