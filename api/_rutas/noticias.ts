/**
 * GET /api/noticias
 *
 * Feed de noticias publicadas para /panel (pestaña Guía). Requiere sesión:
 * no es contenido secreto, pero tampoco hay razón para servirlo en abierto.
 */

import { query } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed } from '../_auth/http.js';
import { requireUser } from '../_auth/guard.js';
import type { Noticia } from '../_lib/noticias/comun.js';

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

  const noticias = await query<Pick<Noticia, 'id' | 'slug' | 'titulo' | 'resumen' | 'categoria' | 'fuente' | 'fuente_url' | 'publicada_en'>>(
    `SELECT id, slug, titulo, resumen, categoria, fuente, fuente_url, publicada_en
       FROM public.noticias
      WHERE estado = 'publicada' AND publicada_en IS NOT NULL
      ORDER BY publicada_en DESC
      LIMIT 50`
  );

  res.status(200).json({ ok: true, noticias });
}
