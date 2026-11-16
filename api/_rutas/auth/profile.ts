/**
 * POST /api/auth/profile
 * Body: { empresa?, ruc?, telefono, avisos_whatsapp? }
 *
 * Crea o actualiza el perfil del usuario autenticado. El registro lo llama
 * justo después de `authClient.signUp.email` para guardar los datos que
 * Better Auth no cubre. También sirve para editar el perfil más adelante.
 *
 * El teléfono es OBLIGATORIO al crear el perfil: el estudio necesita un
 * número para contactar al cliente y para los avisos por WhatsApp. En una
 * cuenta ya creada se puede actualizar, pero no borrar (los campos ausentes
 * no se tocan).
 *
 * Además del perfil se crea/actualiza la fila de `suscripciones`: el email
 * queda activo (con enlace de baja en cada envío) y WhatsApp solo si el
 * usuario marcó el consentimiento expreso.
 */

import { query, queryOne } from '../../_db/db.js';
import type { ReqLike, ResLike } from '../../_auth/http.js';
import { applyCors, clientIp, methodNotAllowed, readJsonBody } from '../../_auth/http.js';
import { requireUser } from '../../_auth/guard.js';
import { normalizarWhatsapp } from '../../_lib/noticias/comun.js';

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
  const rucRaw = typeof body?.ruc === 'string' ? body.ruc.replace(/\D/g, '') : null;
  const telefonoRaw = typeof body?.telefono === 'string' ? body.telefono.trim() : null;
  // El registro manda un único consentimiento para email + WhatsApp. Se
  // acepta también la clave antigua `avisos_whatsapp` para no romper clientes
  // viejos. Si no viene ninguna, no se toca la suscripción existente.
  const avisosNoticias =
    typeof body?.avisos_noticias === 'boolean'
      ? body.avisos_noticias
      : typeof body?.avisos_whatsapp === 'boolean'
        ? body.avisos_whatsapp
        : null;

  if (rucRaw && !/^\d{11}$/.test(rucRaw)) {
    res.status(400).json({ ok: false, error: 'validation', fields: { ruc: 'El RUC debe tener 11 dígitos.' } });
    return;
  }

  const telefono = telefonoRaw ? normalizarWhatsapp(telefonoRaw) : null;
  if (telefonoRaw && !telefono) {
    res.status(400).json({
      ok: false,
      error: 'validation',
      fields: { telefono: 'El teléfono debe ser un número peruano de 9 dígitos o internacional con prefijo.' },
    });
    return;
  }

  const existente = await queryOne<{ telefono: string | null }>(
    'SELECT telefono FROM public.profiles WHERE user_id = $1 LIMIT 1',
    [user.id]
  );

  // Alta nueva: sin teléfono no se completa el perfil. Es lo que hace
  // obligatorio el campo en /registro, sin romper cuentas antiguas que aún
  // no lo hayan actualizado.
  if (!existente && !telefono) {
    res.status(400).json({
      ok: false,
      error: 'validation',
      fields: { telefono: 'El teléfono es obligatorio para crear la cuenta.' },
    });
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
    [user.id, empresa || null, rucRaw || null, telefono]
  );

  // La aceptación del registro ES la suscripción: si acepta, email y
  // WhatsApp quedan activos; si no, no se le envía nada. No hay un segundo
  // opt-in. Si el cuerpo no trae la decisión (edición normal del perfil), no
  // se toca la fila: el cliente la cambia desde «Mi cuenta».
  if (avisosNoticias !== null) {
    const acepta = avisosNoticias === true;
    await query(
      `INSERT INTO public.suscripciones
         (user_id, email, whatsapp, canal_email, canal_whatsapp, activo,
          consentimiento_en, consentimiento_ip)
       VALUES ($1, $2, $3, $4, $4, $4,
               CASE WHEN $4 THEN now() ELSE NULL END,
               CASE WHEN $4 THEN $5 ELSE NULL END)
       ON CONFLICT (user_id) DO UPDATE
         SET email             = COALESCE(EXCLUDED.email, public.suscripciones.email),
             whatsapp          = COALESCE(EXCLUDED.whatsapp, public.suscripciones.whatsapp),
             canal_email       = EXCLUDED.canal_email,
             canal_whatsapp    = EXCLUDED.canal_whatsapp,
             activo            = EXCLUDED.activo,
             consentimiento_en = CASE WHEN $4 THEN now() ELSE public.suscripciones.consentimiento_en END,
             consentimiento_ip = CASE WHEN $4 THEN $5 ELSE public.suscripciones.consentimiento_ip END,
             updated_at        = now()`,
      [user.id, user.email, telefono, acepta, clientIp(req)]
    );
  }

  const profile = await queryOne(
    `SELECT empresa, ruc, telefono, notas, created_at
       FROM public.profiles WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );

  res.status(200).json({ ok: true, profile });
}
