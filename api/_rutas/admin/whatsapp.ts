/**
 * Proxy de administración hacia el servicio Go de WhatsApp.
 *
 * GET  /api/admin/whatsapp/estado        → { conectado, jid, desde, ultimo_error }
 * POST /api/admin/whatsapp/vincular      → { qr } (PNG base64) o ya conectado
 * POST /api/admin/whatsapp/desvincular   → cierra la sesión
 *
 * El token interno (WA_SERVICIO_TOKEN) se queda en el servidor: el navegador
 * solo ve estas tres rutas, todas con requireAdmin.
 */

import type { ReqLike, ResLike } from '../../_auth/http.js';
import { applyCors, methodNotAllowed, readJsonBody } from '../../_auth/http.js';
import { requireAdmin } from '../../_auth/guard.js';
import {
  estadoWhatsapp,
  solicitarQr,
  desvincularWhatsapp,
} from '../../_lib/noticias/whatsapp.js';

type ReqConRecurso = ReqLike & { _recurso?: string };

function ruta(req: ReqLike): string {
  const nombre = (req as ReqConRecurso)._recurso || '';
  if (nombre.endsWith('/vincular')) return 'vincular';
  if (nombre.endsWith('/desvincular')) return 'desvincular';
  return 'estado';
}

function errorDeServicio(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, POST');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const accion = ruta(req);

  if (accion === 'estado') {
    if (req.method !== 'GET') {
      methodNotAllowed(res);
      return;
    }
    try {
      const estado = await estadoWhatsapp();
      res.status(200).json({ ok: true, estado });
    } catch (error) {
      // Sin servicio configurado el panel debe poder decirlo, no romperse.
      res.status(200).json({
        ok: false,
        estado: { conectado: false, jid: null, desde: null, ultimo_error: errorDeServicio(error) },
        error: errorDeServicio(error),
      });
    }
    return;
  }

  if (req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  await readJsonBody(req);

  if (accion === 'vincular') {
    try {
      const data = await solicitarQr();
      res.status(200).json({ ok: true, ...data });
    } catch (error) {
      res.status(502).json({ ok: false, error: errorDeServicio(error) });
    }
    return;
  }

  try {
    await desvincularWhatsapp();
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(502).json({ ok: false, error: errorDeServicio(error) });
  }
}
