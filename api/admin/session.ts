/**
 * GET /api/admin/session
 * Respuesta 200: { ok: true, user } si hay cookie válida.
 * Respuesta 401: { ok: false, error: 'not_authenticated' } si no.
 * El frontend lo usa como guard de la ruta /admin.
 */

import type { ReqLike, ResLike } from '../_admin/auth';
import { verifyCookie } from '../_admin/auth';

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  const origin = req.headers?.['origin'];
  res.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const user = verifyCookie(req.headers);
  if (!user) {
    res.status(401).json({ ok: false, error: 'not_authenticated' });
    return;
  }
  res.status(200).json({ ok: true, user });
}