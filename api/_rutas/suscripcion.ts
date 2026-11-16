/**
 * Preferencias de aviso del cliente.
 *
 * GET  /api/suscripcion  → estado actual (o los valores por defecto)
 * POST /api/suscripcion  → guarda canales, teléfono y consentimiento
 *
 * Ley 29733: se guarda cuándo y desde qué IP se aceptó. La baja se hace con
 * `activo = false`; no se borra la fila para no reimportar a quien ya dijo no.
 */

import { queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, clientIp, methodNotAllowed, readJsonBody } from '../_auth/http.js';
import { requireUser } from '../_auth/guard.js';
import { normalizarWhatsapp } from '../_lib/noticias/comun.js';

interface SuscripcionRow {
  user_id: string;
  email: string | null;
  whatsapp: string | null;
  canal_email: boolean;
  canal_whatsapp: boolean;
  activo: boolean;
  consentimiento_en: string | null;
  consentimiento_ip: string | null;
  created_at: string;
  updated_at: string;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, POST');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const suscripcion = await queryOne<SuscripcionRow>(
      `SELECT user_id, email, whatsapp, canal_email, canal_whatsapp, activo,
              consentimiento_en, consentimiento_ip, created_at, updated_at
         FROM public.suscripciones WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    res.status(200).json({
      ok: true,
      email_cuenta: user.email,
      suscripcion,
    });
    return;
  }

  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  const body = (await readJsonBody(req)) as Record<string, unknown> | null;
  const actual = await queryOne<SuscripcionRow>(
    `SELECT user_id, email, whatsapp, canal_email, canal_whatsapp, activo,
            consentimiento_en, consentimiento_ip, created_at, updated_at
       FROM public.suscripciones WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );

  const canalEmail = body?.canal_email === true;
  const canalWhatsapp = body?.canal_whatsapp === true;
  const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
  const email = emailRaw || actual?.email || user.email;
  const whatsappRaw = typeof body?.whatsapp === 'string' ? body.whatsapp.trim() : '';
  const whatsapp = normalizarWhatsapp(whatsappRaw || actual?.whatsapp || null);

  if (canalEmail && !email) {
    res.status(400).json({ ok: false, error: 'validation', fields: { email: 'Falta el correo.' } });
    return;
  }
  if (canalWhatsapp && !whatsapp) {
    res.status(400).json({
      ok: false,
      error: 'validation',
      fields: { whatsapp: 'Escribe un número peruano de 9 dígitos o uno internacional con prefijo.' },
    });
    return;
  }

  const activo = canalEmail || canalWhatsapp;
  const consentimiento = body?.consentimiento === true;

  // Consentimiento nuevo cuando: se enciende WhatsApp por primera vez, o se
  // reactiva una cuenta que estaba dada de baja. Marcar solo email en una
  // cuenta ya activa no obliga a repetirlo.
  const requiereConsentimiento =
    (canalWhatsapp && !actual?.canal_whatsapp) || (activo && !actual?.activo);
  if (requiereConsentimiento && !consentimiento) {
    res.status(400).json({
      ok: false,
      error: 'validation',
      fields: { consentimiento: 'Necesitamos tu consentimiento para enviarte avisos.' },
    });
    return;
  }

  const guardada = await queryOne<SuscripcionRow>(
    `INSERT INTO public.suscripciones
       (user_id, email, whatsapp, canal_email, canal_whatsapp, activo,
        consentimiento_en, consentimiento_ip)
     VALUES ($1, $2, $3, $4, $5, $6,
             CASE WHEN $7 THEN now() ELSE NULL END,
             CASE WHEN $7 THEN $8 ELSE NULL END)
     ON CONFLICT (user_id) DO UPDATE
       SET email             = EXCLUDED.email,
           whatsapp          = EXCLUDED.whatsapp,
           canal_email       = EXCLUDED.canal_email,
           canal_whatsapp    = EXCLUDED.canal_whatsapp,
           activo            = EXCLUDED.activo,
           consentimiento_en = CASE WHEN $7 THEN now() ELSE public.suscripciones.consentimiento_en END,
           consentimiento_ip = CASE WHEN $7 THEN $8 ELSE public.suscripciones.consentimiento_ip END,
           updated_at        = now()
     RETURNING user_id, email, whatsapp, canal_email, canal_whatsapp, activo,
               consentimiento_en, consentimiento_ip, created_at, updated_at`,
    [user.id, email, whatsapp, canalEmail, canalWhatsapp, activo, consentimiento, clientIp(req)]
  );

  res.status(200).json({ ok: true, suscripcion: guardada });
}
