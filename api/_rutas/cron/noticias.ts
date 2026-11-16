/**
 * GET /api/cron/noticias
 *
 * Mantenimiento manual. NO está programado en Vercel y NO envía el digest:
 * los avisos salen solo cuando el admin pulsa «Publicar y enviar».
 *
 *   1. Detecta cambios en SUNAT y crea BORRADORES para revisión.
 *   2. Reintenta envíos pendientes (si el admin los dejó a medias).
 *
 * La URL es pública, así que sin `Authorization: Bearer ${CRON_SECRET}`
 * responde 401 y no hace trabajo. No se añade ninguna función serverless:
 * entra por el catch-all como el resto de rutas.
 */

import { timingSafeEqual } from 'node:crypto';
import type { ReqLike, ResLike } from '../../_auth/http.js';
import { applyCors, methodNotAllowed } from '../../_auth/http.js';
import { detectarCambios } from '../../_lib/noticias/detector.js';
import { procesarEnvios } from '../../_lib/noticias/cola.js';
import { mensajeError } from '../../_lib/noticias/comun.js';

function autorizado(req: ReqLike): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return false;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match) return false;

  const recibido = Buffer.from(match[1]);
  const esperado = Buffer.from(secret);
  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res);
    return;
  }

  if (!process.env.CRON_SECRET) {
    res.status(500).json({ ok: false, error: 'cron_secret_no_configurado' });
    return;
  }
  if (!autorizado(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const iniciado = Date.now();
  const errores: string[] = [];

  let deteccion: Awaited<ReturnType<typeof detectarCambios>> = [];
  try {
    deteccion = await detectarCambios();
  } catch (error) {
    errores.push(`deteccion: ${mensajeError(error)}`);
  }

  let reintentos: Awaited<ReturnType<typeof procesarEnvios>> | null = null;
  try {
    reintentos = await procesarEnvios();
  } catch (error) {
    errores.push(`reintentos: ${mensajeError(error)}`);
  }

  res.status(200).json({
    ok: errores.length === 0,
    ahora: new Date().toISOString(),
    deteccion,
    reintentos,
    errores,
    ms: Date.now() - iniciado,
  });
}
