/**
 * POST /api/admin/login
 * Body: { user: string, password: string }
 * Respuesta 200: { ok: true, user }
 *   + Set-Cookie httpOnly con sesión firmada (8h).
 * Respuesta 401: { ok: false, error: 'invalid_credentials' }
 *
 * Anti-timing: usa comparación constant-time (ver _adminAuth.ts).
 * Anti brute-force básico: solo compara; rate-limiting fino lo añade Vercel
 * (Firewall) o un middleware externo en producción.
 */

import type { ReqLike, ResLike } from '../_admin/auth';
import { adminUser, adminPassword, makeCookieValue, serializeCookie, readJsonBody, verifyCookie } from '../_admin/auth';

function safeEqual(a: string, b: string): boolean {
  // Duplicado local para no exportar crypto desde el módulo de auth en cada
  // handler; la implementación real vive en _adminAuth.ts (verifyCookie).
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  // Fallback no constant-time si timingSafeEqual no está (browser e tests).
  // En Node sí está, así que este return solo se alcanza en longitudes iguales.
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  // CORS para el frontend (mismo origen en prod, abierto en dev).
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

  const body = (await readJsonBody(req)) as { user?: unknown; password?: unknown } | null;
  const user = typeof body?.user === 'string' ? body.user : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  // Si ya hay sesión válida, la mantenemos (idempotente).
  if (verifyCookie(req.headers)) {
    res.status(200).json({ ok: true, user: adminUser() });
    return;
  }

  const expectedUser = adminUser();
  const expectedPass = adminPassword();
  const match = safeEqual(user, expectedUser) && safeEqual(password, expectedPass);
  if (!match) {
    res.status(401).json({ ok: false, error: 'invalid_credentials' });
    return;
  }

  const cookie = serializeCookie(makeCookieValue(expectedUser));
  res.setHeader('Set-Cookie', cookie);
  res.status(200).json({ ok: true, user: expectedUser });
}