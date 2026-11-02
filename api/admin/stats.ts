/**
 * GET /api/admin/stats
 *
 * Métricas del panel. Solo lectura y solo admin.
 *
 * Fuente de identidad: `neon_auth.user` / `neon_auth.session` (Neon Auth).
 * Fuente de negocio: `public.resources` / `public.resource_views`.
 *
 * Todo se resuelve en pocas consultas: el panel es la primera pantalla tras
 * login y no conviene encadenar round-trips al pooler.
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed } from '../_auth/http.js';
import { requireAdmin } from '../_auth/guard.js';

interface Overview {
  users_total: number;
  users_banned: number;
  users_verified: number;
  admins: number;
  new_24h: number;
  new_7d: number;
  new_30d: number;
  active_sessions: number;
  logins_24h: number;
  logins_7d: number;
  resources_active: number;
  views_7d: number;
  profiles: number;
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

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const overview = await queryOne<Overview>(`
    SELECT
      (SELECT count(*) FROM neon_auth."user")::int                                        AS users_total,
      (SELECT count(*) FROM neon_auth."user" WHERE banned)::int                            AS users_banned,
      (SELECT count(*) FROM neon_auth."user" WHERE "emailVerified")::int                   AS users_verified,
      (SELECT count(*) FROM neon_auth."user" WHERE role = 'admin')::int                    AS admins,
      (SELECT count(*) FROM neon_auth."user" WHERE "createdAt" >= now() - interval '1 day')::int   AS new_24h,
      (SELECT count(*) FROM neon_auth."user" WHERE "createdAt" >= now() - interval '7 days')::int  AS new_7d,
      (SELECT count(*) FROM neon_auth."user" WHERE "createdAt" >= now() - interval '30 days')::int AS new_30d,
      (SELECT count(*) FROM neon_auth.session WHERE "expiresAt" > now())::int              AS active_sessions,
      (SELECT count(*) FROM neon_auth.session WHERE "createdAt" >= now() - interval '1 day')::int  AS logins_24h,
      (SELECT count(*) FROM neon_auth.session WHERE "createdAt" >= now() - interval '7 days')::int AS logins_7d,
      (SELECT count(*) FROM public.resources WHERE is_active)::int                          AS resources_active,
      (SELECT count(*) FROM public.resource_views WHERE viewed_at >= now() - interval '7 days')::int AS views_7d,
      (SELECT count(*) FROM public.profiles)::int                                           AS profiles
  `);

  const signups = await query<{ date: string; count: number }>(`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS date, count(u.id)::int AS count
      FROM generate_series(now()::date - interval '13 days', now()::date, interval '1 day') AS d(day)
      LEFT JOIN neon_auth."user" u
        ON u."createdAt" >= d.day AND u."createdAt" < d.day + interval '1 day'
     GROUP BY d.day
     ORDER BY d.day
  `);

  const topResources = await query<{ id: string; title: string; views: number }>(`
    SELECT r.id, r.title, count(v.id)::int AS views
      FROM public.resources r
      LEFT JOIN public.resource_views v
        ON v.resource_id = r.id AND v.viewed_at >= now() - interval '30 days'
     GROUP BY r.id, r.title
     ORDER BY views DESC, r.title
     LIMIT 5
  `);

  const recentUsers = await query<{
    id: string;
    name: string;
    email: string;
    role: string;
    banned: boolean;
    createdAt: string;
  }>(`
    SELECT id, name, email, role, banned, "createdAt"
      FROM neon_auth."user"
     ORDER BY "createdAt" DESC
     LIMIT 6
  `);

  const recentActivity = await query<{
    viewed_at: string;
    title: string | null;
    email: string | null;
  }>(`
    SELECT v.viewed_at, r.title, u.email
      FROM public.resource_views v
      LEFT JOIN public.resources r ON r.id = v.resource_id
      LEFT JOIN neon_auth."user" u ON u.id = v.user_id
     ORDER BY v.viewed_at DESC
     LIMIT 8
  `);

  res.status(200).json({ ok: true, overview, signups, topResources, recentUsers, recentActivity });
}
