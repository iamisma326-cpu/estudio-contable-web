/**
 * Exportación PLE (solo admin).
 *
 * GET /api/ple?clienteId=&periodo=&formato=14.1|8.1
 *   Devuelve los totales del registro y, con &descargar=1, el archivo .txt.
 *
 * Dos decisiones que no son técnicas:
 *
 * 1. Solo se exportan comprobantes CONFIRMADOS. Un comprobante en la bandeja no
 *    ha pasado por la revisión de nadie; presentarlo a SUNAT lo convertiría en
 *    una declaración en firme, y corregirlo después exige una rectificatoria.
 *
 * 2. El perfil se puede consultar sin descargar (`descargar` ausente). El
 *    asistente ve cuántos registros y qué totales va a presentar antes de bajarse
 *    el archivo, igual que la bandeja muestra la lectura antes de guardar.
 */

import { fechaISO } from '../_lib/fecha-iso.js';
import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam } from '../_auth/http.js';
import { requireAdmin } from '../_auth/guard.js';
import { generarPLE, nombreArchivo, type FormatoPLE } from '../_lib/ple.js';
import type { ComprobanteIngerido } from '../_lib/ingesta.js';

const FORMATOS: FormatoPLE[] = ['14.1', '8.1'];

/**
 * Los comprobantes confirmados de un período, en la forma que espera el
 * exportador.
 *
 * Se mapea fila -> ComprobanteIngerido en vez de reutilizar el lector de la
 * bandeja: aquí solo hacen falta los campos que van al archivo, y así un cambio
 * en la bandeja no altera lo que se declara.
 */
async function cargarConfirmados(clienteId: string, periodoId: string): Promise<ComprobanteIngerido[]> {
  const filas = await query<Record<string, unknown>>(
    `SELECT tipo, operacion, serie, numero, fecha_emision, ruc_emisor, ruc_receptor,
            razon_emisor, razon_receptor, moneda, tipo_cambio, base, igv, exonerado, total,
            origen, confianza, estado
       FROM public.comprobantes
      WHERE cliente_id = $1 AND periodo_id = $2 AND estado = 'confirmado'
      ORDER BY fecha_emision, serie, numero`,
    [clienteId, periodoId]
  );

  return filas.map((f) => ({
    tipo: String(f.tipo ?? 'factura') as ComprobanteIngerido['tipo'],
    operacion: f.operacion === 'venta' ? 'venta' : 'compra',
    serie: (f.serie as string) ?? null,
    numero: (f.numero as string) ?? null,
    fechaEmision: fechaISO(f.fecha_emision),
    rucEmisor: (f.ruc_emisor as string) ?? null,
    rucReceptor: (f.ruc_receptor as string) ?? null,
    razonEmisor: (f.razon_emisor as string) ?? null,
    razonReceptor: (f.razon_receptor as string) ?? null,
    moneda: String(f.moneda ?? 'PEN'),
    tipoCambio: f.tipo_cambio === null ? null : Number(f.tipo_cambio),
    base: Number(f.base ?? 0),
    igv: Number(f.igv ?? 0),
    exonerado: Number(f.exonerado ?? 0),
    // La tabla no guarda el inafecto por separado: el esquema lo distingue por
    // `afectacion` ('30' = inafecto). Se informa 0 y el total sigue cuadrando
    // porque en el PLE el inafecto (campo 19 de ventas) suma al total.
    inafecto: 0,
    total: Number(f.total ?? 0),
    afectacion: null,
    origen: (f.origen as ComprobanteIngerido['origen']) ?? 'xml',
    confianza: Number(f.confianza ?? 0),
    estado: 'confirmado',
    hallazgos: [],
    avisos: [],
    clave: null,
  }));
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
  const formato = (queryParam(req, 'formato') ?? '14.1') as FormatoPLE;
  const descargar = queryParam(req, 'descargar') === '1';

  if (!clienteId) {
    res.status(400).json({ ok: false, error: 'Falta clienteId.' });
    return;
  }
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    res.status(400).json({ ok: false, error: 'Falta el período (aaaa-mm).' });
    return;
  }
  if (!FORMATOS.includes(formato)) {
    res.status(400).json({ ok: false, error: 'Formato inválido: use 14.1 o 8.1.' });
    return;
  }

  const cliente = await queryOne<{ ruc: string; razon_social: string }>(
    `SELECT ruc, razon_social FROM public.clientes WHERE id = $1`,
    [clienteId]
  );
  if (!cliente) {
    res.status(404).json({ ok: false, error: 'El cliente no existe.' });
    return;
  }

  // El período puede no existir todavía: es un registro vacío, no un error.
  const [anio, mes] = periodo.split('-').map(Number);
  const per = await queryOne<{ id: string; estado: string }>(
    `SELECT id, estado FROM public.periodos WHERE cliente_id = $1 AND anio = $2 AND mes = $3`,
    [clienteId, anio, mes]
  );

  const comprobantes = per ? await cargarConfirmados(clienteId, per.id) : [];
  const exportado = generarPLE(comprobantes, formato, {
    periodo,
    rucInformante: cliente.ruc,
    razonSocial: cliente.razon_social,
  });

  const aviso: string[] = [...exportado.problemas];
  if (per?.estado === 'cerrado') {
    aviso.push('El período está cerrado: este registro ya debería haberse presentado.');
  }
  if (exportado.lineas.length === 0) {
    aviso.push('No hay comprobantes confirmados en este período para este registro.');
  }

  const nombre = nombreArchivo(cliente.ruc, periodo, formato, {
    conOperaciones: exportado.lineas.length > 0,
  });

  if (!descargar) {
    res.status(200).json({
      ok: true,
      formato,
      periodo,
      periodoEstado: per?.estado ?? 'sin_periodo',
      totales: exportado.totales,
      nombreArchivo: nombre,
      avisos: aviso,
    });
    return;
  }

  // Se devuelve como texto plano para que el navegador lo descargue tal cual:
  // un JSON con el contenido obligaría al cliente a reconstruir los saltos.
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end(exportado.contenido);
}
