/**
 * CRUD de noticias (solo admin).
 *
 * GET    /api/admin/noticias?estado=&categoria=
 * POST   /api/admin/noticias
 * PATCH  /api/admin/noticias
 * DELETE /api/admin/noticias?id=
 *
 * Nada de aquí envía: publicar solo cambia el estado. El envío vive en
 * /api/admin/noticias/enviar y en el cron, que usan la misma cola.
 */

import { query, queryOne } from '../../_db/db.js';
import type { ReqLike, ResLike } from '../../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../../_auth/http.js';
import { requireAdmin } from '../../_auth/guard.js';
import { slugify, type Noticia } from '../../_lib/noticias/comun.js';

const CATEGORIAS = new Set(['sunat', 'tributario', 'laboral', 'estudio']);
const FUENTES = new Set(['manual', 'cronograma', 'renta-anual', 'noticias-sunat']);
const ESTADOS = new Set(['borrador', 'publicada', 'archivada']);

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, POST, PATCH, DELETE');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    const estado = queryParam(req, 'estado');
    const categoria = queryParam(req, 'categoria');
    const filtros: string[] = [];
    const params: unknown[] = [];

    if (estado && ESTADOS.has(estado)) {
      params.push(estado);
      filtros.push(`n.estado = $${params.length}`);
    }
    if (categoria && CATEGORIAS.has(categoria)) {
      params.push(categoria);
      filtros.push(`n.categoria = $${params.length}`);
    }

    const noticias = await query<Noticia>(
      `SELECT n.id, n.slug, n.titulo, n.resumen, n.cuerpo, n.categoria, n.fuente,
              n.fuente_url, n.estado, n.publicada_en, n.created_at, n.updated_at
         FROM public.noticias n
         ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        ORDER BY COALESCE(n.publicada_en, n.created_at) DESC, n.created_at DESC`,
      params
    );

    const conteos = await query<{ estado: string; total: number }>(
      `SELECT estado, count(*)::int AS total
         FROM public.noticias GROUP BY estado`
    );

    const resumenEnvios = await query<{
      noticia_id: string;
      enviados: number;
      pendientes: number;
      fallidos: number;
    }>(
      `SELECT noticia_id,
              count(*) FILTER (WHERE estado = 'enviado')::int   AS enviados,
              count(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
              count(*) FILTER (WHERE estado = 'fallido')::int   AS fallidos
         FROM public.envios
        GROUP BY noticia_id`
    );

    res.status(200).json({ ok: true, noticias, conteos, envios: resumenEnvios });
    return;
  }

  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as Record<string, unknown> | null;
    const titulo = texto(body?.titulo);
    if (titulo.length < 5) {
      res.status(400).json({
        ok: false,
        error: 'validation',
        fields: { titulo: 'El título debe tener al menos 5 caracteres.' },
      });
      return;
    }

    const categoria = texto(body?.categoria) || 'sunat';
    if (!CATEGORIAS.has(categoria)) {
      res.status(400).json({ ok: false, error: 'validation', fields: { categoria: 'Categoría inválida.' } });
      return;
    }

    const fuente = texto(body?.fuente) || 'manual';
    if (!FUENTES.has(fuente)) {
      res.status(400).json({ ok: false, error: 'validation', fields: { fuente: 'Fuente inválida.' } });
      return;
    }

    const estado = texto(body?.estado) || 'borrador';
    if (!ESTADOS.has(estado)) {
      res.status(400).json({ ok: false, error: 'validation', fields: { estado: 'Estado inválido.' } });
      return;
    }

    const base = slugify(titulo) || 'noticia';
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const taken = await queryOne('SELECT 1 FROM public.noticias WHERE slug = $1', [slug]);
      if (!taken) break;
      slug = `${base}-${i}`;
    }

    const creada = await queryOne<Noticia>(
      `INSERT INTO public.noticias
         (slug, titulo, resumen, cuerpo, categoria, fuente, fuente_url, estado,
          publicada_en, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $8 = 'publicada' THEN now() ELSE NULL END, $9)
       RETURNING id, slug, titulo, resumen, cuerpo, categoria, fuente, fuente_url,
                 estado, publicada_en, created_at, updated_at`,
      [
        slug,
        titulo,
        texto(body?.resumen),
        typeof body?.cuerpo === 'string' ? body.cuerpo : '',
        categoria,
        fuente,
        texto(body?.fuente_url) || null,
        estado,
        admin.id,
      ]
    );

    res.status(201).json({ ok: true, noticia: creada });
    return;
  }

  if (req.method === 'PATCH') {
    const body = (await readJsonBody(req)) as Record<string, unknown> | null;
    const id = texto(body?.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }

    const estado = texto(body?.estado) || null;
    const categoria = texto(body?.categoria) || null;
    if (estado && !ESTADOS.has(estado)) {
      res.status(400).json({ ok: false, error: 'validation', fields: { estado: 'Estado inválido.' } });
      return;
    }
    if (categoria && !CATEGORIAS.has(categoria)) {
      res.status(400).json({ ok: false, error: 'validation', fields: { categoria: 'Categoría inválida.' } });
      return;
    }

    const actualizada = await queryOne<Noticia>(
      `UPDATE public.noticias
          SET titulo       = COALESCE($2, titulo),
              resumen      = COALESCE($3, resumen),
              cuerpo       = COALESCE($4, cuerpo),
              categoria    = COALESCE($5, categoria),
              fuente       = COALESCE($6, fuente),
              fuente_url   = COALESCE($7, fuente_url),
              estado       = COALESCE($8, estado),
              publicada_en = CASE
                WHEN $8 = 'publicada' AND publicada_en IS NULL THEN now()
                WHEN $8 = 'borrador' THEN NULL
                ELSE publicada_en
              END,
              updated_at   = now()
        WHERE id = $1
        RETURNING id, slug, titulo, resumen, cuerpo, categoria, fuente, fuente_url,
                  estado, publicada_en, created_at, updated_at`,
      [
        id,
        texto(body?.titulo) || null,
        typeof body?.resumen === 'string' ? body.resumen : null,
        typeof body?.cuerpo === 'string' ? body.cuerpo : null,
        categoria,
        texto(body?.fuente) || null,
        typeof body?.fuente_url === 'string' ? body.fuente_url.trim() || null : null,
        estado,
      ]
    );

    if (!actualizada) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.status(200).json({ ok: true, noticia: actualizada });
    return;
  }

  if (req.method === 'DELETE') {
    const id = queryParam(req, 'id') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }
    const deleted = await query('DELETE FROM public.noticias WHERE id = $1 RETURNING id', [id]);
    res.status(200).json({ ok: true, deleted: deleted.length > 0 });
    return;
  }

  methodNotAllowed(res);
}
