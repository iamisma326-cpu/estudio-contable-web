/**
 * POST   /api/admin/resource-file  { id, fileName, contentType }
 *   Devuelve { uploadUrl, key } para subir el archivo directo al bucket
 *   privado (el binario no pasa por la función serverless).
 *
 * DELETE /api/admin/resource-file?id=…
 *   Borra el objeto del bucket y limpia las columnas del recurso.
 *
 * El vínculo definitivo (file_key/file_name/file_size) se guarda con el PATCH
 * de /api/admin/resources una vez completada la subida.
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../_auth/http.js';
import { requireAdmin } from '../_auth/guard.js';
import { deleteObject, safeFileName, signedUpload } from '../_storage/s3.js';

const MAX_BYTES = 25 * 1024 * 1024;

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'POST, DELETE');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as Record<string, unknown> | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
    const contentType = typeof body?.contentType === 'string' ? body.contentType : 'application/pdf';
    const size = Number(body?.size ?? 0);

    if (!/^[0-9a-f-]{36}$/i.test(id) || !fileName) {
      res.status(400).json({ ok: false, error: 'invalid_request' });
      return;
    }
    if (Number.isFinite(size) && size > MAX_BYTES) {
      res.status(413).json({ ok: false, error: 'file_too_large' });
      return;
    }

    const resource = await queryOne<{ id: string }>(
      'SELECT id FROM public.resources WHERE id = $1 LIMIT 1',
      [id]
    );
    if (!resource) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    // Clave única por subida: evita pisar un archivo anterior con el mismo nombre.
    const key = `resources/${id}/${Date.now()}-${safeFileName(fileName)}`;

    let uploadUrl: string;
    try {
      uploadUrl = await signedUpload(key, contentType);
    } catch {
      // Credenciales o endpoint de storage ausentes: 500 explícito en lugar
      // de tumbar la invocación.
      res.status(500).json({ ok: false, error: 'storage_unavailable' });
      return;
    }

    res.status(200).json({ ok: true, key, uploadUrl });
    return;
  }

  if (req.method === 'DELETE') {
    const id = queryParam(req, 'id') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(400).json({ ok: false, error: 'invalid_id' });
      return;
    }

    const row = await queryOne<{ file_key: string | null }>(
      'SELECT file_key FROM public.resources WHERE id = $1 LIMIT 1',
      [id]
    );
    if (!row) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }

    if (row.file_key) {
      try {
        await deleteObject(row.file_key);
      } catch {
        // Si el objeto ya no existe igual limpiamos la referencia.
      }
    }

    await query(
      `UPDATE public.resources
          SET file_key = NULL, file_name = NULL, file_size = NULL, updated_at = now()
        WHERE id = $1`,
      [id]
    );
    res.status(200).json({ ok: true });
    return;
  }

  methodNotAllowed(res);
}
