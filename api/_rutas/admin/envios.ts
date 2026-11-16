/**
 * GET /api/admin/envios?noticia_id=&estado=
 *
 * Estado de la cola por noticia y por destinatario, con el error legible
 * cuando lo hubo. Solo lectura y solo admin.
 */

import { query } from '../../_db/db.js';
import type { ReqLike, ResLike } from '../../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam } from '../../_auth/http.js';
import { requireAdmin } from '../../_auth/guard.js';

interface EnvioRow {
  id: string;
  noticia_id: string;
  noticia: string;
  user_id: string;
  nombre: string | null;
  email: string | null;
  canal: 'email' | 'whatsapp';
  destino: string;
  estado: string;
  intentos: number;
  proveedor_id: string | null;
  error: string | null;
  enviado_en: string | null;
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

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const noticiaId = queryParam(req, 'noticia_id');
  const estado = queryParam(req, 'estado');
  const filtros: string[] = [];
  const params: unknown[] = [];

  if (noticiaId && /^[0-9a-f-]{36}$/i.test(noticiaId)) {
    params.push(noticiaId);
    filtros.push(`e.noticia_id = $${params.length}::uuid`);
  }
  if (estado && ['pendiente', 'enviado', 'fallido', 'omitido'].includes(estado)) {
    params.push(estado);
    filtros.push(`e.estado = $${params.length}`);
  }

  const envios = await query<EnvioRow>(
    `SELECT e.id::text, e.noticia_id, n.titulo AS noticia,
            e.user_id, u.name AS nombre, u.email,
            e.canal, e.destino, e.estado, e.intentos, e.proveedor_id,
            e.error, e.enviado_en, e.created_at
       FROM public.envios e
       JOIN public.noticias n ON n.id = e.noticia_id
       LEFT JOIN neon_auth."user" u ON u.id = e.user_id
       ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
      ORDER BY e.created_at DESC, n.publicada_en DESC NULLS LAST
      LIMIT 500`,
    params
  );

  const resumen = await query<{
    noticia_id: string;
    titulo: string;
    enviados: number;
    pendientes: number;
    fallidos: number;
  }>(
    `SELECT n.id AS noticia_id, n.titulo,
            count(e.id) FILTER (WHERE e.estado = 'enviado')::int   AS enviados,
            count(e.id) FILTER (WHERE e.estado = 'pendiente')::int AS pendientes,
            count(e.id) FILTER (WHERE e.estado = 'fallido')::int   AS fallidos
       FROM public.noticias n
       LEFT JOIN public.envios e ON e.noticia_id = n.id
      GROUP BY n.id, n.titulo
      HAVING count(e.id) > 0
      ORDER BY max(e.created_at) DESC
      LIMIT 50`
  );

  res.status(200).json({ ok: true, envios, resumen });
}
