/**
 * GET /api/noticias/notificaciones
 *
 * Bandeja del cliente: las noticias que el estudio ya le envió por email o
 * WhatsApp. Solo lectura y solo sus propias filas. No muestra los envíos de
 * prueba del admin ni las noticias que aún no salieron.
 */

import { query } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed } from '../_auth/http.js';
import { requireUser } from '../_auth/guard.js';

interface NotificacionRow {
  noticia_id: string;
  slug: string;
  titulo: string;
  resumen: string;
  categoria: string;
  fuente: string;
  fuente_url: string | null;
  estado: string;
  publicada_en: string | null;
  email: boolean;
  whatsapp: boolean;
  enviado_en: string | null;
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

  const notificaciones = await query<NotificacionRow>(
    `SELECT n.id AS noticia_id,
            n.slug, n.titulo, n.resumen, n.categoria, n.fuente, n.fuente_url,
            n.estado, n.publicada_en,
            bool_or(e.canal = 'email' AND e.estado = 'enviado')    AS email,
            bool_or(e.canal = 'whatsapp' AND e.estado = 'enviado') AS whatsapp,
            coalesce(max(e.enviado_en), max(e.created_at))         AS enviado_en
       FROM public.envios e
       JOIN public.noticias n ON n.id = e.noticia_id
      WHERE e.user_id = $1
        AND e.prueba = false
      GROUP BY n.id, n.slug, n.titulo, n.resumen, n.categoria, n.fuente,
               n.fuente_url, n.estado, n.publicada_en
     HAVING bool_or(e.estado = 'enviado')
      ORDER BY coalesce(max(e.enviado_en), max(e.created_at)) DESC
      LIMIT 100`,
    [user.id]
  );

  res.status(200).json({ ok: true, notificaciones });
}
