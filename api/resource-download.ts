/**
 * GET /api/resource-download?id=…
 *
 * Devuelve { url } con un GET prefirmado (5 min) al adjunto privado del
 * recurso. Requiere sesión: el bucket nunca se abre al público.
 */

import { queryOne } from './_db/db.js';
import type { ReqLike, ResLike } from './_auth/http.js';
import { applyCors, methodNotAllowed, queryParam } from './_auth/http.js';
import { requireUser } from './_auth/guard.js';
import { signedDownload } from './_storage/s3.js';

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

  const id = queryParam(req, 'id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(400).json({ ok: false, error: 'invalid_id' });
    return;
  }

  const row = await queryOne<{ file_key: string | null; file_name: string | null }>(
    `SELECT file_key, file_name
       FROM public.resources
      WHERE id = $1 AND is_active = true
      LIMIT 1`,
    [id]
  );

  if (!row || !row.file_key) {
    res.status(404).json({ ok: false, error: 'file_not_found' });
    return;
  }

  let url: string;
  try {
    url = await signedDownload(row.file_key);
  } catch {
    res.status(500).json({ ok: false, error: 'storage_unavailable' });
    return;
  }

  res.status(200).json({ ok: true, url, fileName: row.file_name ?? 'archivo' });
}
