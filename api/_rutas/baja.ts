/**
 * Baja de avisos sin sesión.
 *
 * GET  /api/baja?token=<uuid>  → valida el token SIN modificar nada.
 * POST /api/baja { token }     → aplica la baja (lo llama /baja desde el navegador).
 *
 * Por qué no se da de baja en el GET: los clientes de correo y los escáneres
 * de enlaces abren las URLs antes que la persona. Si el GET modificara la
 * fila, un prefetch podría dar de baja a alguien que nunca pulsó el enlace.
 *
 * La página /baja muestra el resultado y hace el POST automáticamente; el
 * usuario no tiene que iniciar sesión. La fila no se borra: se recuerda la
 * baja para no reimportar a quien ya dijo no.
 */

import { queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../_auth/http.js';
import { esUuid } from '../_lib/noticias/comun.js';

function tokenValido(value: string | null): string | null {
  return esUuid(value) ? value : null;
}

async function estadoToken(token: string | null): Promise<{ valido: boolean; activo: boolean }> {
  if (!token) return { valido: false, activo: false };
  const row = await queryOne<{ activo: boolean }>(
    `SELECT activo FROM public.suscripciones WHERE baja_token = $1::uuid LIMIT 1`,
    [token]
  );
  return row ? { valido: true, activo: row.activo } : { valido: false, activo: false };
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
    const estado = await estadoToken(tokenValido(queryParam(req, 'token')));
    if (!estado.valido) {
      res.status(404).json({ ok: false, error: 'token_invalido' });
      return;
    }
    res.status(200).json({
      ok: true,
      valido: true,
      activo: estado.activo,
      mensaje: estado.activo
        ? 'Confirma la baja para dejar de recibir avisos.'
        : 'Esta suscripción ya está dada de baja.',
    });
    return;
  }

  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as Record<string, unknown> | null;
    const token = tokenValido(typeof body?.token === 'string' ? body.token : null);
    if (!token) {
      res.status(400).json({ ok: false, error: 'token_invalido' });
      return;
    }
    const ok = await darDeBaja(token);
    res.status(ok ? 200 : 404).json(
      ok
        ? { ok: true, mensaje: 'Listo. No volverás a recibir avisos del estudio.' }
        : { ok: false, error: 'token_invalido' }
    );
    return;
  }

  methodNotAllowed(res);
}
