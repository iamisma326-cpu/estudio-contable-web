/**
 * Excel del mes (solo staff).
 *
 * GET /api/libro?clienteId=&periodo=&descargar=1
 *
 * Arma el libro con las cinco hojas de la propuesta y lo devuelve como .xlsx.
 * Reutiliza el mismo cálculo de IGV y renta que la pantalla de liquidación, para
 * que el Excel y lo que se declara no puedan discrepar.
 *
 * Lo que entra al libro: los comprobantes CONFIRMADOS. Los demás van a la hoja
 * Pendientes con su motivo. Esa hoja es la razón de ser del archivo: un libro
 * que omite las facturas sin revisar cuadra consigo mismo y no con la realidad
 * del cliente, y la diferencia aparece en la fiscalización, no antes.
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam } from '../_auth/http.js';
import { requireStaff } from '../_auth/guard.js';
import { crearLibroMensual, nombreLibro } from '../_lib/libro-excel.js';
import { liquidarIGV, pagoACuenta, ingresosNetosDeVentas, type ComprobanteTributario } from '../_lib/igv-mensual.js';
import { generarAsiento } from '../_lib/asientos.js';
import type { ComprobanteIngerido } from '../_lib/ingesta.js';
import { REGIMENES } from '../../src/data/regimenes.js';

/** Fila de la base a ComprobanteIngerido. */
function aComprobante(f: Record<string, unknown>): ComprobanteIngerido {
  return {
    tipo: String(f.tipo ?? 'factura') as ComprobanteIngerido['tipo'],
    operacion: f.operacion === 'venta' ? 'venta' : 'compra',
    serie: (f.serie as string) ?? null,
    numero: (f.numero as string) ?? null,
    fechaEmision: f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : null,
    rucEmisor: (f.ruc_emisor as string) ?? null,
    rucReceptor: (f.ruc_receptor as string) ?? null,
    razonEmisor: (f.razon_emisor as string) ?? null,
    moneda: String(f.moneda ?? 'PEN'),
    tipoCambio: f.tipo_cambio === null || f.tipo_cambio === undefined ? null : Number(f.tipo_cambio),
    base: Number(f.base ?? 0),
    igv: Number(f.igv ?? 0),
    exonerado: Number(f.exonerado ?? 0),
    total: Number(f.total ?? 0),
    afectacion: ((f.afectacion as string) ?? '10') as ComprobanteIngerido['afectacion'],
    origen: (f.origen as ComprobanteIngerido['origen']) ?? 'xml',
    confianza: Number(f.confianza ?? 0),
    estado: String(f.estado ?? 'pendiente') as ComprobanteIngerido['estado'],
    hallazgos: [],
    avisos: [],
    clave: null,
  };
}

/** Tasa del pago a cuenta según el régimen. */
function tasaPagoACuenta(regimen: string): number {
  if (regimen === 'RER') return REGIMENES.RER.tasaIngresos;
  if (regimen === 'RMT') return REGIMENES.RMT.pagoACuentaTopeTasa;
  return REGIMENES.GENERAL.pagoACuenta;
}

const CAMPOS = `tipo, operacion, serie, numero, fecha_emision, ruc_emisor, ruc_receptor,
                razon_emisor, moneda, tipo_cambio, base, igv, exonerado, total,
                afectacion, origen, confianza, estado`;

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
  const per = await queryOne<{ id: string }>(
    `SELECT id FROM public.periodos WHERE cliente_id = $1 AND anio = $2 AND mes = $3`,
    [clienteId, anio, mes]
  );

  const filas = per
    ? await query<Record<string, unknown>>(
        `SELECT ${CAMPOS} FROM public.comprobantes
          WHERE cliente_id = $1 AND periodo_id = $2
          ORDER BY fecha_emision, serie, numero`,
        [clienteId, per.id]
      )
    : [];

  const todos = filas.map(aComprobante);
  const confirmados = todos.filter((c) => c.estado === 'confirmado');
  const fuera = todos.filter((c) => c.estado !== 'confirmado');

  // El motivo de cada pendiente, no solo su estado: "revisado" no le dice a
  // quien cierra el mes por qué falta esa factura.
  const MOTIVOS: Record<string, string> = {
    pendiente: 'Sin revisar: nadie ha comprobado la lectura automática.',
    revisado: 'Revisado pero no confirmado: falta el visto bueno.',
    descartado: 'Descartado a propósito por el asistente.',
  };
  const pendientes = fuera.map((c) => ({
    comprobante: c,
    motivo: MOTIVOS[c.estado] ?? `Estado '${c.estado}'.`,
  }));

  // Mismo cálculo que /api/liquidacion.
  const tributarios: ComprobanteTributario[] = confirmados.map((c) => ({
    tipo: c.tipo,
    operacion: c.operacion,
    afectacion: c.afectacion,
    base: c.base,
    igv: c.igv,
    exonerado: c.exonerado,
    inafecto: 0,
    total: c.total,
    serie: c.serie,
    numero: c.numero,
  }));
  const igv = liquidarIGV(
    tributarios.filter((c) => c.operacion === 'venta'),
    tributarios.filter((c) => c.operacion === 'compra'),
    0
  );
  const renta = pagoACuenta(ingresosNetosDeVentas(igv.ventas), { tasa: tasaPagoACuenta(cliente.regimen) });

  // Las líneas del diario salen del mismo generador que usa la base.
  const asientoDe = (c: ComprobanteIngerido) => {
    try {
      // generarAsiento espera el comprobante contable, no el de ingesta: el
      // nombre de la razón social lleva otro campo y las opcionales son null.
      const a = generarAsiento({
        tipo: c.tipo,
        serie: c.serie,
        numero: c.numero,
        fechaEmision: c.fechaEmision,
        rucEmisor: c.rucEmisor,
        razonSocialEmisor: c.razonEmisor,
        base: c.base,
        igv: c.igv,
        exonerado: c.exonerado,
        total: c.total,
        operacion: c.operacion,
        notaEmitidaPorMi: c.operacion === 'venta' && c.tipo === 'nota_credito',
      });
      return a.lineas.map((l) => ({
        cuenta: l.cuenta,
        nombre: l.cuentaNombre,
        debe: l.debe,
        haber: l.haber,
      }));
    } catch {
      // Un comprobante que no genera asiento no puede tumbar el libro entero.
      return null;
    }
  };

  const libro = crearLibroMensual(
    {
      periodo,
      cliente: { ruc: cliente.ruc, razonSocial: cliente.razon_social, regimen: cliente.regimen },
      confirmados,
      pendientes,
      igv,
      renta,
    },
    asientoDe
  );

  const nombre = nombreLibro(cliente.ruc, periodo);

  if (queryParam(req, 'descargar') !== '1') {
    res.status(200).json({
      ok: true,
      periodo,
      nombreArchivo: nombre,
      hojas: ['Ventas', 'Compras', 'Diario', 'Resumen', 'Pendientes'],
      confirmados: confirmados.length,
      pendientes: pendientes.length,
      igvAPagar: igv.igvAPagar,
      pagoACuenta: renta.monto,
      bytes: libro.length,
    });
    return;
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.setHeader('Content-Length', String(libro.length));
  res.setHeader('Cache-Control', 'no-store');
  // El res de Vercel acepta Buffer; se castea porque ResLike solo declara string.
  (res as unknown as { end(b?: Buffer): void }).end(libro);
  res.status(200);
}
