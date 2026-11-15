/**
 * Comprobantes del estudio (solo staff: admin o asistente).
 *
 * POST /api/comprobantes
 *   Body: { clienteId, xml?: string, periodo?, tipoCambio?, guardarAsiento? }
 *   Sube un XML UBL ya descargado del proveedor. El pipeline hace el resto:
 *   leer → validar → convertir → comprobar duplicado. Devuelve lo leído SIN
 *   guardar salvo que se pida explícitamente (guardar: true).
 *
 * GET /api/comprobantes?periodoId=&estado=
 *   Lista los comprobantes de un período.
 *
 * PATCH /api/comprobantes { id, action, userId? }
 *   action: 'confirmar' | 'descartar'
 *
 * El XML llega en el cuerpo como texto, no como archivo: el cliente ya lo tiene
 * descargado y así no hace falta parsear multipart en una función serverless.
 * Si el XML es grande, el límite de cuerpo de Vercel (4.5 MB) es holgado para
 * un comprobante, que rara vez pasa de 50 KB.
 *
 * Dos operaciones separadas a propósito: leer y guardar. El asistente sube el
 * XML, ve lo que se leyó, y decide. Guardar en el mismo paso es opcional.
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../_auth/http.js';
import { requireStaff } from '../_auth/guard.js';
import {
  asegurarPeriodo,
  existeComprobante,
  guardarComprobante,
  listarComprobantes,
  confirmarComprobante,
  descartarComprobante,
  totalesPeriodo,
} from '../_db/comprobantes.js';

/**
 * El XML se lee en la API, pero la lógica vive en src/lib. Duplicar el parser
 * aquí sería garantizar que se desincronicen, así que se importa tal cual.
 */
import { parsearXML, pareceXML } from '../../src/lib/xml-ubl.js';
import { ingerirDesdeXML, resumenComprobante } from '../../src/lib/ingesta.js';
import { generarAsiento } from '../../src/lib/asientos.js';

/** Tope de tamaño: un comprobante UBL no pasa de decenas de KB. */
const MAX_XML = 2 * 1024 * 1024;

interface BodyLeer {
  clienteId?: string;
  xml?: string;
  periodo?: string;
  rucPropio?: string;
  guardar?: boolean;
  guardarAsiento?: boolean;
  tipoCambio?: { fecha: string; compra: number; venta: number };
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const user = await requireStaff(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') return await listar(req, res);
    if (req.method === 'POST') return await leer(req, res, user.id);
    if (req.method === 'PATCH') return await cambiarEstado(req, res, user.id);
    methodNotAllowed(res);
  } catch (err) {
    // El detalle va al log, no al cliente: puede contener datos del comprobante.
    console.error('[comprobantes]', err);
    res.status(500).json({ error: 'Error interno al procesar el comprobante.' });
  }
}

// ---------------------------------------------------------------------------
// GET: listar
// ---------------------------------------------------------------------------

async function listar(req: ReqLike, res: ResLike): Promise<void> {
  const periodoId = queryParam(req, 'periodoId');
  if (!periodoId) {
    res.status(400).json({ error: 'Falta periodoId.' });
    return;
  }

  const estado = queryParam(req, 'estado') ?? undefined;
  const validos = new Set(['pendiente', 'revisado', 'confirmado', 'descartado']);
  if (estado && !validos.has(estado)) {
    res.status(400).json({ error: `Estado "${estado}" no válido.` });
    return;
  }

  const filas = await listarComprobantes({ query, queryOne }, periodoId, estado);
  const totales = await totalesPeriodo({ query, queryOne }, periodoId);

  res.status(200).json({ comprobantes: filas, totales });
}

// ---------------------------------------------------------------------------
// POST: leer (y opcionalmente guardar) un XML
// ---------------------------------------------------------------------------

async function leer(req: ReqLike, res: ResLike, userId: string): Promise<void> {
  const body = (await readJsonBody(req)) as BodyLeer | null;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Cuerpo inválido.' });
    return;
  }

  const { clienteId, xml } = body;
  if (!clienteId || typeof clienteId !== 'string') {
    res.status(400).json({ error: 'Falta clienteId.' });
    return;
  }
  if (!xml || typeof xml !== 'string') {
    res.status(400).json({ error: 'Falta el XML del comprobante.' });
    return;
  }
  if (xml.length > MAX_XML) {
    res.status(413).json({ error: 'El XML supera el tamaño máximo admitido.' });
    return;
  }
  if (!pareceXML(xml)) {
    res.status(400).json({ error: 'El archivo no parece un comprobante UBL.' });
    return;
  }

  // El cliente debe existir: sin él no hay libro.
  const cliente = await queryOne<{ id: string; ruc: string; razon_social: string }>(
    `SELECT id, ruc, razon_social FROM public.clientes WHERE id = $1`,
    [clienteId]
  );
  if (!cliente) {
    res.status(404).json({ error: 'El cliente no existe.' });
    return;
  }

  const leido = parsearXML(xml);

  // Se usa el RUC propio del cliente si no lo manda el cliente HTTP: es lo que
  // decide si la factura es venta o compra, y equivocarlo invierte el libro.
  const rucPropio = body.rucPropio?.trim() || cliente.ruc;

  // Duplicado antes de ingerir, para que el estado salga correcto de una vez.
  const yaExiste = await existeComprobante(
    { query, queryOne },
    clienteId,
    leido.rucEmisor,
    leido.serie,
    leido.numero
  );

  const ingerido = ingerirDesdeXML(leido, {
    rucPropio,
    periodo: body.periodo ?? null,
    tipoCambio: body.tipoCambio ?? null,
    yaExiste,
  });

  // Respuesta de lectura: el asistente ve esto y decide si guardar.
  const resultado: Record<string, unknown> = {
    comprobante: ingerido,
    resumen: resumenComprobante(ingerido),
    yaExiste,
  };

  if (!body.guardar) {
    res.status(200).json({ ...resultado, guardado: false });
    return;
  }

  // Guardar: no se permite si hay errores. Un comprobante roto en el libro es
  // peor que no tenerlo, porque alguien lo va a dar por bueno.
  //
  // El duplicado se comprueba ANTES que los errores: el duplicado también es un
  // hallazgo de tipo error, y al usuario le sirve saber que el problema es que
  // ya existe (409) y no un genérico "tiene errores" (422).
  if (yaExiste) {
    res.status(409).json({
      ...resultado,
      guardado: false,
      error: 'Este comprobante ya está registrado.',
    });
    return;
  }
  if (ingerido.estado === 'pendiente' && ingerido.hallazgos.some((h) => h.gravedad === 'error')) {
    res.status(422).json({
      ...resultado,
      guardado: false,
      error: 'El comprobante tiene errores: corrígelos antes de guardar.',
    });
    return;
  }

  // Período: del comprobante o del que pidió el usuario.
  const periodo = body.periodo ?? ingerido.fechaEmision?.slice(0, 7);
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    res.status(400).json({ error: 'No se pudo determinar el período (año-mes).' });
    return;
  }
  const [anio, mes] = periodo.split('-').map(Number);
  const periodoId = await asegurarPeriodo({ query, queryOne }, clienteId, anio, mes);

  // Asiento opcional: solo si se pidió y el comprobante está sano.
  let asiento = null;
  if (body.guardarAsiento && ingerido.estado === 'revisado') {
    try {
      asiento = generarAsiento({
        tipo: ingerido.tipo,
        serie: ingerido.serie,
        numero: ingerido.numero,
        fechaEmision: ingerido.fechaEmision,
        rucEmisor: ingerido.rucEmisor,
        razonSocialEmisor: ingerido.razonEmisor,
        base: ingerido.base,
        igv: ingerido.igv,
        exonerado: ingerido.exonerado,
        total: ingerido.total,
        operacion: ingerido.operacion,
      });
    } catch (e) {
      // El asiento es opcional: si no se puede generar, el comprobante se
      // guarda igual y se avisa. No se pierde la lectura por un asiento.
      console.error('[comprobantes] asiento no generado', e);
      asiento = null;
    }
  }

  const guardado = await guardarComprobante(
    { query, queryOne },
    clienteId,
    periodoId,
    ingerido,
    asiento
  );

  res.status(201).json({
    ...resultado,
    guardado: true,
    periodoId,
    comprobanteId: guardado.comprobanteId,
    asientoId: guardado.asientoId,
    guardoAsiento: asiento !== null,
  });
}

// ---------------------------------------------------------------------------
// PATCH: confirmar / descartar
// ---------------------------------------------------------------------------

async function cambiarEstado(req: ReqLike, res: ResLike, userId: string): Promise<void> {
  const body = (await readJsonBody(req)) as { id?: string; action?: string } | null;
  const id = body?.id;
  const action = body?.action;

  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'Falta el id del comprobante.' });
    return;
  }
  if (action !== 'confirmar' && action !== 'descartar') {
    res.status(400).json({ error: 'action debe ser "confirmar" o "descartar".' });
    return;
  }

  // Confirmar es el paso irreversible: exige que el comprobante esté limpio.
  if (action === 'confirmar') {
    const fila = await queryOne<{ id: string; estado: string; total: string | null }>(
      `SELECT id, estado, total::text FROM public.comprobantes WHERE id = $1`,
      [id]
    );
    if (!fila) {
      res.status(404).json({ error: 'El comprobante no existe.' });
      return;
    }
    if (fila.estado === 'descartado') {
      res.status(409).json({ error: 'Un comprobante descartado no se puede confirmar.' });
      return;
    }
    if (!fila.total || Number(fila.total) <= 0) {
      res.status(422).json({ error: 'El comprobante no tiene importe: no se puede confirmar.' });
      return;
    }

    const ok = await confirmarComprobante({ query, queryOne }, id, userId);
    if (!ok) {
      res.status(409).json({ error: 'No se pudo confirmar el comprobante.' });
      return;
    }
    res.status(200).json({ id, estado: 'confirmado' });
    return;
  }

  const ok = await descartarComprobante({ query, queryOne }, id);
  if (!ok) {
    res.status(409).json({ error: 'No se puede descartar (¿ya estaba confirmado?).' });
    return;
  }
  res.status(200).json({ id, estado: 'descartado' });
}
