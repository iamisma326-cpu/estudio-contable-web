/**
 * POST /api/auth/profile
 * Body: { empresa?, ruc?, telefono? }
 *
 * Crea o actualiza el perfil del usuario autenticado. El registro lo llama
 * justo después de `authClient.signUp.email` para guardar los datos que
 * Better Auth no cubre. También sirve para editar el perfil más adelante.
 *
 * Los campos ausentes no se borran: solo se actualiza lo que llega.
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, readJsonBody } from '../_auth/http.js';
import { requireUser } from '../_auth/guard.js';

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'POST');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const body = (await readJsonBody(req)) as Record<string, unknown> | null;
  const empresa = typeof body?.empresa === 'string' ? body.empresa.trim() : null;
  const telefono = typeof body?.telefono === 'string' ? body.telefono.trim() : null;
  const rucRaw = typeof body?.ruc === 'string' ? body.ruc.replace(/\D/g, '') : null;

  if (rucRaw && !/^\d{11}$/.test(rucRaw)) {
    res.status(400).json({ ok: false, error: 'validation', fields: { ruc: 'El RUC debe tener 11 dígitos.' } });
    return;
  }

  // $2..$4 nulos = no tocar la columna (COALESCE con el valor actual).
  await query(
    `INSERT INTO public.profiles (user_id, empresa, ruc, telefono)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET empresa    = COALESCE(EXCLUDED.empresa, public.profiles.empresa),
           ruc        = COALESCE(EXCLUDED.ruc, public.profiles.ruc),
           telefono   = COALESCE(EXCLUDED.telefono, public.profiles.telefono),
           updated_at = now()`,
    [user.id, empresa || null, rucRaw || null, telefono || null]
  );

  const profile = await queryOne(
    `SELECT empresa, ruc, telefono, notas, created_at
       FROM public.profiles WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );

  res.status(200).json({ ok: true, profile });
}
