/**
 * Baja de avisos sin sesión.
 *
 * GET /api/baja?token=<uuid>   → aplica la baja (enlace del email)
 * POST /api/baja { token }     → mismo efecto desde la página /baja
 *
 * No revela el correo ni la identidad: con el token solo se confirma que la
 * suscripción quedó desactivada. La fila NO se borra, para recordar la baja
 * si algún día se reimporta la lista.
 */

import { queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../_auth/http.js';

function tokenValido(value: string | null): string | null {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

async function darDeBaja(token: string | null): Promise<boolean> {
  if (!token) return false;
  const row = await queryOne<{ user_id: string }>(
    `UPDATE public.suscripciones
        SET activo = false,
            canal_email = false,
            canal_whatsapp = false,
            updated_at = now()
      WHERE baja_token = $1::uuid
      RETURNING user_id`,
    [token]
  );
  return Boolean(row);
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, POST');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    const ok = await darDeBaja(tokenValido(queryParam(req, 'token')));
    res.status(ok ? 200 : 404).json(
      ok
        ? { ok: true, mensaje: 'Listo. No volverás a recibir avisos del estudio.' }
        : { ok: false, error: 'token_invalido' }
    );
    return;
  }

  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as Record<string, unknown> | null;
    const ok = await darDeBaja(tokenValido(typeof body?.token === 'string' ? body.token : null));
    res.status(ok ? 200 : 404).json(
      ok
        ? { ok: true, mensaje: 'Listo. No volverás a recibir avisos del estudio.' }
        : { ok: false, error: 'token_invalido' }
    );
    return;
  }

  methodNotAllowed(res);
}
