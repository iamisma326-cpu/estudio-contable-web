/**
 * Catálogo de recursos del área privada (solo admin).
 *
 * GET    /api/admin/resources           → todos, activos e inactivos
 * POST   /api/admin/resources {…}       → crea (slug generado del título)
 * PATCH  /api/admin/resources { id, … } → actualiza campos enviados
 * DELETE /api/admin/resources?id=…      → elimina
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../_auth/http.js';
import { requireAdmin } from '../_auth/guard.js';
import { deleteObject } from '../_storage/s3.js';

interface ResourceRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  href: string | null;
  is_active: boolean;
  sort_order: number;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
}

/** "Cronograma SUNAT 2026" → "cronograma-sunat-2026" */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
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
    const resources = await query<ResourceRow>(
      `SELECT id, slug, title, description, category, href, is_active, sort_order,
              file_key, file_name, file_size, created_at
         FROM public.resources
        ORDER BY sort_order, title`
    );
    res.status(200).json({ ok: true, resources });
    return;
  }

  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as Record<string, unknown> | null;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (title.length < 3) {
      res.status(400).json({ ok: false, error: 'validation', fields: { title: 'Título demasiado corto.' } });
      return;
    }

    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : 'herramienta';
    const href = typeof body?.href === 'string' && body.href.trim() ? body.href.trim() : null;
    const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body?.sort_order) : 0;

    // Slug único: si colisiona, agrega un sufijo numérico.
    const base = slugify(title) || 'recurso';
    let slug = base;
    for (let i = 2; i < 50; i++) {
      const taken = await queryOne('SELECT 1 FROM public.resources WHERE slug = $1', [slug]);
      if (!taken) break;
      slug = `${base}-${i}`;
    }

    const created = await queryOne<ResourceRow>(
      `INSERT INTO public.resources (slug, title, description, category, href, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, slug, title, description, category, href, is_active, sort_order,
                 file_key, file_name, file_size, created_at`,
      [slug, title, description, category, href, sortOrder]
    );
    res.status(201).json({ ok: true, resource: created });
    return;
  }

  if (req.method === 'PATCH') {
    const body = (await readJsonBody(req)) as Record<string, unknown> | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }

    const updated = await queryOne<ResourceRow>(
      `UPDATE public.resources
          SET title       = COALESCE($2, title),
              description = COALESCE($3, description),
              category    = COALESCE($4, category),
              href        = COALESCE($5, href),
              is_active   = COALESCE($6, is_active),
              sort_order  = COALESCE($7, sort_order),
              file_key    = COALESCE($8, file_key),
              file_name   = COALESCE($9, file_name),
              file_size   = COALESCE($10, file_size),
              updated_at  = now()
        WHERE id = $1
        RETURNING id, slug, title, description, category, href, is_active, sort_order,
                  file_key, file_name, file_size, created_at`,
      [
        id,
        typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : null,
        typeof body?.description === 'string' ? body.description.trim() : null,
        typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : null,
        typeof body?.href === 'string' ? body.href.trim() || null : null,
        typeof body?.is_active === 'boolean' ? body.is_active : null,
        Number.isFinite(Number(body?.sort_order)) ? Number(body?.sort_order) : null,
        typeof body?.file_key === 'string' && body.file_key.trim() ? body.file_key.trim() : null,
        typeof body?.file_name === 'string' && body.file_name.trim() ? body.file_name.trim() : null,
        Number.isFinite(Number(body?.file_size)) ? Number(body?.file_size) : null,
      ]
    );

    if (!updated) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    res.status(200).json({ ok: true, resource: updated });
    return;
  }

  if (req.method === 'DELETE') {
    const id = queryParam(req, 'id') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }
    // Recuperamos file_key antes de borrar: si no se limpia el objeto, queda
    // huérfano en el bucket y ya no hay forma de alcanzarlo desde la UI.
    const target = await queryOne<{ file_key: string | null }>(
      'SELECT file_key FROM public.resources WHERE id = $1 LIMIT 1',
      [id]
    );

    if (!target) {
      res.status(200).json({ ok: true, deleted: false });
      return;
    }

    const deleted = await query('DELETE FROM public.resources WHERE id = $1 RETURNING id', [id]);

    if (target.file_key) {
      let fileRemoved = true;
      try {
        await deleteObject(target.file_key);
      } catch {
        // La fila ya no existe; si el objeto tampoco, no hay nada que limpiar.
        // Si falló por otra razón, se lo decimos al admin en vez de callarlo.
        fileRemoved = false;
      }
      res.status(200).json({ ok: true, deleted: deleted.length > 0, fileRemoved });
      return;
    }

    res.status(200).json({ ok: true, deleted: deleted.length > 0 });
    return;
  }

  methodNotAllowed(res);
}
