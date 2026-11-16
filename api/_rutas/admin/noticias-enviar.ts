/**
 * POST /api/admin/noticias/enviar
 *
 * Body: { id | ids, canales: ['email'|'whatsapp'], modo: 'ahora'|'cola',
 *         soloMi?: boolean }
 *
 * Siempre encola primero. Con modo 'ahora' procesa el lote en la misma
 * invocación; si algo falla, la fila queda pendiente y el cron la recoge.
 * `soloMi` permite enseñar el resultado sin escribirle a un cliente real.
 */

import { query } from '../../_db/db.js';
import type { ReqLike, ResLike } from '../../_auth/http.js';
import { applyCors, methodNotAllowed, readJsonBody } from '../../_auth/http.js';
import { requireAdmin } from '../../_auth/guard.js';
import { encolarNoticias, procesarEnvios } from '../../_lib/noticias/cola.js';
import { esUuid, type Canal } from '../../_lib/noticias/comun.js';

function idsDelBody(body: Record<string, unknown> | null): string[] {
  const raw = body?.ids ?? body?.id;
  const valores = Array.isArray(raw) ? raw : [raw];
  return Array.from(
    new Set(
      valores.filter(
        (v): v is string => esUuid(v)
      )
    )
  );
}

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

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = (await readJsonBody(req)) as Record<string, unknown> | null;
  const ids = idsDelBody(body);
  if (!ids.length) {
    res.status(400).json({ ok: false, error: 'invalid_id' });
    return;
  }

  const canalesRaw = Array.isArray(body?.canales) ? body.canales : [];
  const canales = Array.from(
    new Set(canalesRaw.filter((c): c is Canal => c === 'email' || c === 'whatsapp'))
  );
  if (!canales.length) {
    res.status(400).json({
      ok: false,
      error: 'validation',
      fields: { canales: 'Elige al menos un canal.' },
    });
    return;
  }

  const modo = body?.modo === 'cola' ? 'cola' : 'ahora';
  const soloMi = body?.soloMi === true;

  const publicadas = await query<{ id: string; estado: string }>(
    'SELECT id, estado FROM public.noticias WHERE id = ANY($1::uuid[])',
    [ids]
  );
  const noPublicadas = publicadas.filter((n) => n.estado !== 'publicada');
  const encontradas = new Set(publicadas.map((n) => n.id));
  const faltantes = ids.filter((id) => !encontradas.has(id));
  if (!publicadas.length || noPublicadas.length || faltantes.length) {
    res.status(409).json({
      ok: false,
      error: 'noticia_no_publicada',
      detail: 'Solo se pueden enviar noticias publicadas. Publica primero el borrador.',
    });
    return;
  }

  const encolado = await encolarNoticias(ids, canales, {
    soloMi,
    admin: { id: admin.id, email: admin.email },
  });

  if (!encolado.filas) {
    // Sin cron, este es el camino de reintento: si ya había filas pendientes
    // de esas noticias/canales (por un fallo anterior), se procesan ahora.
    if (modo === 'ahora') {
      const reintento = await procesarEnvios({ noticiaIds: ids, canales });
      if (reintento.enviados > 0 || reintento.fallidos > 0) {
        res.status(200).json({
          ok: true,
          lote: encolado.lote,
          encolados: 0,
          destinatarios: 0,
          enviados: reintento,
          modo,
          aviso: 'Se procesaron envíos pendientes de esas noticias.',
        });
        return;
      }
    }
    res.status(200).json({
      ok: true,
      lote: encolado.lote,
      encolados: 0,
      enviados: null,
      aviso:
        'No hay destinatarios nuevos para esos canales. Revisa las preferencias de los clientes o usa «Enviar solo a mí».',
    });
    return;
  }

  const envios = modo === 'ahora' ? await procesarEnvios({ lote: encolado.lote }) : null;

  res.status(200).json({
    ok: true,
    lote: encolado.lote,
    encolados: encolado.filas,
    destinatarios: encolado.destinatarios,
    enviados: envios,
    modo,
  });
}
