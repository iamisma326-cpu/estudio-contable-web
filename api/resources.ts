/**
 * Recursos del área privada.
 *
 * GET  /api/resources            → catálogo activo (requiere sesión)
 * POST /api/resources  { id }    → registra una apertura (métricas)
 *
 * El GET solo devuelve recursos activos: el catálogo se administra desde
 * /api/admin/resources y aquí se consume.
 */

import { query } from './_db/db.js';
import type { ReqLike, ResLike } from './_auth/http.js';
import { applyCors, methodNotAllowed, readJsonBody } from './_auth/http.js';
import { requireUser } from './_auth/guard.js';

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, POST');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const resources = await query(
      `SELECT id, slug, title, description, category, href, sort_order,
              (file_key IS NOT NULL) AS has_file, file_name
         FROM public.resources
        WHERE is_active = true
        ORDER BY sort_order, title`
    );
    res.status(200).json({ ok: true, resources });
    return;
  }

  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as { id?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id : '';

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }

    // Solo se registra si el recurso existe y está activo.
    const inserted = await query<{ id: number }>(
      `INSERT INTO public.resource_views (resource_id, user_id)
       SELECT r.id, $2 FROM public.resources r
        WHERE r.id = $1 AND r.is_active = true
       RETURNING id`,
      [id, user.id]
    );
    res.status(200).json({ ok: true, recorded: inserted.length > 0 });
    return;
  }

  methodNotAllowed(res);
}
