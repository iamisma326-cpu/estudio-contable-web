/**
 * POST /api/whatsapp/baja
 *
 * Webhook interno del servicio Go: cuando un cliente responde «BAJA» por
 * WhatsApp, whatsmeow lo detecta y avisa aquí. No tiene sesión de usuario:
 * se autentica con el mismo `WA_SERVICIO_TOKEN` que usa Vercel para llamar al
 * servicio. El teléfono solo puede provenir del remitente real del mensaje.
 *
 * No se expone en el navegador ni se documenta como API pública.
 */

import { timingSafeEqual } from 'node:crypto';
import { query } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, readJsonBody } from '../_auth/http.js';
import { normalizarWhatsapp } from '../_lib/noticias/comun.js';

function autorizado(req: ReqLike): boolean {
  const secret = process.env.WA_SERVICIO_TOKEN;
  if (!secret) return false;
  const raw = req.headers?.['x-servicio-token'] ?? req.headers?.['X-Servicio-Token'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
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

  if (!process.env.WA_SERVICIO_TOKEN) {
    res.status(500).json({ ok: false, error: 'servicio_no_configurado' });
    return;
  }
  if (!autorizado(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const body = (await readJsonBody(req)) as Record<string, unknown> | null;
  const telefono = normalizarWhatsapp(
    typeof body?.telefono === 'string' ? body.telefono : null
  );
  if (!telefono) {
    res.status(400).json({ ok: false, error: 'telefono_invalido' });
    return;
  }

  const bajas = await query<{ user_id: string }>(
    `UPDATE public.suscripciones
        SET activo = false,
            canal_email = false,
            canal_whatsapp = false,
            updated_at = now()
      WHERE whatsapp = $1
        AND (activo = true OR canal_email = true OR canal_whatsapp = true)
      RETURNING user_id`,
    [telefono]
  );

  res.status(200).json({ ok: true, telefono, bajas: bajas.length });
}
