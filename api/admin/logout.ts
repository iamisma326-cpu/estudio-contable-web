/**
 * POST /api/admin/logout
 * Limpia la cookie de sesión.
 * Idempotente: siempre devuelve 200.
 */

import type { ReqLike, ResLike } from '../_admin/auth.js';
import { clearCookieHeader } from '../_admin/auth.js';

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  const origin = req.headers?.['origin'];
  res.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  res.setHeader('Set-Cookie', clearCookieHeader());
  res.status(200).json({ ok: true });
}