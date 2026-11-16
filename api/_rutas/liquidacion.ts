/**
 * Liquidación mensual del IGV y pago a cuenta de renta (solo admin).
 *
 * GET /api/liquidacion?clienteId=&periodo=
 *
 * Devuelve lo que el asistente necesita para llenar el Formulario 0621:
 * IGV de ventas, IGV de compras, resultado y saldo a favor; más el pago a
 * cuenta de renta del mes según el régimen del cliente.
 *
 * Una decisión que sí importa: solo entran comprobantes CONFIRMADOS. Un
 * comprobante que nadie revisó no puede mover el impuesto de un cliente; si
 * entrara, el número que se declara dependería de una lectura automática que
 * puede estar mal.
 *
 * El saldo a favor del mes anterior se toma del campo `saldo_a_favor_igv` del
 * período previo si existe; si no, se asume 0 y se avisa, porque asumir 0 cuando
 * había saldo hace que el cliente pague dos veces el mismo impuesto.
 */

import { queryOne, query } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam } from '../_auth/http.js';
import { requireAdmin } from '../_auth/guard.js';
import {
  liquidarIGV,
  pagoACuenta,
  ingresosNetosDeVentas,
  type ComprobanteTributario,
} from '../_lib/igv-mensual.js';
import { REGIMENES, UIT_2026 } from '../../src/data/regimenes.js';
import { saldoAnterior, type SaldoAnterior } from '../_lib/saldo-anterior.js';

/** Tasa del pago a cuenta según el régimen del cliente. */
function tasaPagoACuenta(regimen: string): number {
  if (regimen === 'RER') return REGIMENES.RER.tasaIngresos;
  if (regimen === 'RMT') return REGIMENES.RMT.pagoACuentaTopeTasa;
  return REGIMENES.GENERAL.pagoACuenta;
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

  const user = await requireAdmin(req, res);
  if (!user) return;

  const clienteId = queryParam(req, 'clienteId');
  const periodo = queryParam(req, 'periodo');

  if (!clienteId) {
    res.status(400).json({ ok: false, error: 'Falta clienteId.' });
    return;
  }
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    res.status(400).json({ ok: false, error: 'Falta el período (aaaa-mm).' });
    return;
  }

  const cliente = await queryOne<{ ruc: string; razon_social: string; regimen: string }>(
    `SELECT ruc, razon_social, regimen FROM public.clientes WHERE id = $1`,
    [clienteId]
  );
  if (!cliente) {
    res.status(404).json({ ok: false, error: 'El cliente no existe.' });
    return;
  }

  const [anio, mes] = periodo.split('-').map(Number);
  const per = await queryOne<{ id: string; estado: string }>(
    `SELECT id, estado FROM public.periodos WHERE cliente_id = $1 AND anio = $2 AND mes = $3`,
    [clienteId, anio, mes]
  );

  let confirmados: ComprobanteTributario[] = [];
  if (per) {
    const filas = await query<Record<string, unknown>>(
      `SELECT tipo, operacion, afectacion, base, igv, exonerado, total, serie, numero
         FROM public.comprobantes
        WHERE cliente_id = $1 AND periodo_id = $2 AND estado = 'confirmado'
        ORDER BY fecha_emision, serie, numero`,
      [clienteId, per.id]
    );
    confirmados = filas.map((f) => ({
      tipo: String(f.tipo ?? 'factura'),
      operacion: f.operacion === 'venta' ? 'venta' : 'compra',
      afectacion: (f.afectacion as string) ?? '10',
      base: Number(f.base ?? 0),
      igv: Number(f.igv ?? 0),
      exonerado: Number(f.exonerado ?? 0),
      // La tabla no guarda el inafecto aparte: se distingue por `afectacion`.
      inafecto: 0,
      total: Number(f.total ?? 0),
      serie: (f.serie as string) ?? null,
      numero: (f.numero as string) ?? null,
    }));
  }

  const ventas = confirmados.filter((c) => c.operacion === 'venta');
  const compras = confirmados.filter((c) => c.operacion === 'compra');

  const previo = await saldoAnterior(clienteId, anio, mes);
  const avisos: string[] = [];
  if (previo.origen === 'periodo_sin_declarar') {
    avisos.push(
      'El período anterior no tiene saldo a favor declarado: se tomó como 0. ' +
        'Si ese mes cerró con saldo a favor, corrígelo antes de declarar.'
    );
  }

  const igv = liquidarIGV(ventas, compras, previo.saldo);
  avisos.push(...igv.avisos);

  // El pago a cuenta se calcula sobre los ingresos netos del mes, sin IGV.
  const netos = ingresosNetosDeVentas(igv.ventas);
  const renta = pagoACuenta(netos, { tasa: tasaPagoACuenta(cliente.regimen) });
  avisos.push(...renta.avisos);

  if (cliente.regimen === 'GENERAL') {
    avisos.push(
      'Régimen General: si el coeficiente de la renta anterior resulta mayor que el 1.5%, ' +
        'el pago a cuenta es el del coeficiente. Aquí solo se muestra el 1.5%.'
    );
  }

  const pendientes = per
    ? await queryOne<{ c: number }>(
        `SELECT count(*)::int AS c FROM public.comprobantes
          WHERE cliente_id = $1 AND periodo_id = $2 AND estado IN ('pendiente','revisado')`,
        [clienteId, per.id]
      )
    : null;

  if ((pendientes?.c ?? 0) > 0) {
    avisos.push(
      `Hay ${pendientes?.c} comprobante(s) sin confirmar en el período: no entran en este cálculo.`
    );
  }

  res.status(200).json({
    ok: true,
    cliente: { ruc: cliente.ruc, razonSocial: cliente.razon_social, regimen: cliente.regimen },
    periodo,
    periodoEstado: per?.estado ?? 'sin_periodo',
    igv,
    renta: {
      ...renta,
      regimen: cliente.regimen,
      // El detalle ayuda a explicar el número: no es lo mismo 1% que 1.5%.
      base: 'ingresos netos del mes (sin IGV)',
    },
    uit: UIT_2026,
    avisos,
  });
}
