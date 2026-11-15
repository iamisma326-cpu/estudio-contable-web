/**
 * Clientes y períodos del estudio (solo staff).
 *
 * GET /api/clientes
 *   Lista los contribuyentes dados de alta. Es lo primero que necesita cualquier
 *   pantalla de trabajo: un comprobante siempre pertenece a un cliente.
 *
 * GET /api/periodos?clienteId=
 *   Lista los períodos abiertos de un cliente. Un período es lo que agrupa los
 *   comprobantes de un mes; sin período no hay dónde registrarlos.
 *
 * Son dos recursos distintos en un mismo archivo porque ambos son solo lectura
 * y se piden juntos al abrir la bandeja. Separarlos en dos funciones serverless
 * gastaría dos de las doce que permite el plan gratuito de Vercel, y el límite
 * ya es el recurso más escaso del proyecto.
 *
 * Los clientes NO son usuarios del sistema: en el modelo actual el estudio lleva
 * los libros de terceros que no inician sesión.
 */

import { query } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam } from '../_auth/http.js';
import { requireStaff } from '../_auth/guard.js';

type ReqConRecurso = ReqLike & { _recurso?: string };

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

  const user = await requireStaff(req, res);
  if (!user) return;

  // El router monta los dos recursos en este mismo archivo y avisa cuál se pidió
  // en _recurso. Se evita mirar req.url porque Vercel reescribe la URL y el valor
  // que llega no es el que pidió el cliente.
  const recurso = (req as ReqConRecurso)._recurso;

  if (recurso === 'periodos') {
    const clienteId = queryParam(req, 'clienteId');
    if (!clienteId) {
      res.status(400).json({ ok: false, error: 'missing_cliente_id' });
      return;
    }
    const periodos = await query(
      `SELECT id, anio, mes, estado
         FROM public.periodos
        WHERE cliente_id = $1
        ORDER BY anio DESC, mes DESC`,
      [clienteId]
    );
    res.status(200).json({ ok: true, periodos });
    return;
  }

  const clientes = await query(
    `SELECT id, ruc, razon_social, regimen
       FROM public.clientes
      WHERE is_active = true
      ORDER BY razon_social`
  );
  res.status(200).json({ ok: true, clientes });
}
