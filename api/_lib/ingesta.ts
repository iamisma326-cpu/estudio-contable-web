/**
 * Pipeline de ingesta: de un archivo a un comprobante listo para revisar.
 *
 * Une las piezas sueltas en el orden que importa:
 *
 *   archivo -> leer (XML / PDF / visión) -> validar SUNAT -> convertir a soles
 *          -> detectar duplicado -> decidir estado
 *
 * La decisión final es deliberadamente simple: un comprobante nunca entra
 * "confirmado" solo. Lo máximo que consigue es 'revisado' cuando se leyó por
 * XML (que es determinista). La confianza del extractor no decide nada aquí:
 * un dato mal leído produce un asiento aritméticamente correcto y
 * contablemente falso, y eso se descubre declarando.
 *
 * Ver docs/PROPUESTA-AUTOMATIZACION.md §3 y §10.
 */

import {
  validarComprobante,
  tieneErrores,
  claveDuplicado,
  type Hallazgo,
  type TipoComprobante,
  type Afectacion,
} from './comprobante.js';
import type { ComprobanteXML } from './xml-ubl.js';
import type { CamposFacturaPDF } from './pdf-factura.js';
import { convertirComprobante, type Moneda, type TipoCambio } from './moneda.js';

export type Origen = 'xml' | 'pdf_texto' | 'vision';
export type Estado = 'pendiente' | 'revisado' | 'confirmado' | 'descartado';

/** Lo que el pipeline entrega a la capa de datos. */
export interface ComprobanteIngerido {
  tipo: TipoComprobante;
  operacion: 'venta' | 'compra';
  serie: string | null;
  numero: string | null;
  fechaEmision: string | null;
  rucEmisor: string | null;
  rucReceptor: string | null;
  razonEmisor: string | null;
  /**
   * Razón social de la contraparte.
   *
   * En ventas es el nombre del cliente y en compras el del proveedor. Es lo
   * que pide el registro PLE (campo 12 de 14.1 / campo 13 de 8.1), y no se
   * puede derivar de `razonEmisor`: en ventas el emisor es el contribuyente
   * mismo, así que tomar el emisor deja el registro con el nombre propio en
   * lugar del nombre de a quien se le facturó.
   */
  razonReceptor: string | null;

  moneda: string;
  tipoCambio: number | null;
  base: number;
  igv: number;
  exonerado: number;
  total: number;
  afectacion: Afectacion | null;

  origen: Origen;
  confianza: number;
  estado: Estado;

  hallazgos: Hallazgo[];
  avisos: string[];
  /** Clave para consultar si ya existe; null si faltan datos. */
  clave: string | null;
}

export interface OpcionesIngesta {
  /** RUC del contribuyente dueño de los libros: decide si es venta o compra. */
  rucPropio?: string | null;
  /** Período a registrar, yyyy-mm. Si falta, sale de la fecha de emisión. */
  periodo?: string | null;
  tipoCambio?: TipoCambio | null;
  /** Un comprobante ya existente con la misma clave. */
  yaExiste?: boolean;
}

/** Confianza por origen. El XML no se adivina, se lee. */
export const CONFIANZA: Record<Origen, number> = {
  xml: 0.99,
  pdf_texto: 0.8,
  vision: 0.6,
};

/** Deriva yyyy-mm de una fecha ISO. */
function periodoDe(fecha: string | null): string | null {
  if (!fecha) return null;
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(fecha.trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Ingiere un comprobante leído por XML.
 *
 * El operador (venta/compra) se decide comparando el RUC emisor con el del
 * contribuyente: si emitió él, es venta; si no, es compra. Si no se conoce el
 * RUC propio se asume compra, que es el caso mayoritario de un estudio
 * contable y el que más duele si se clasifica al revés.
 */
export function ingerirDesdeXML(
  xml: ComprobanteXML,
  opciones: OpcionesIngesta = {}
): ComprobanteIngerido {
  const avisos: string[] = [];
  const hallazgos: Hallazgo[] = [];

  // Los problemas del parser se vuelven hallazgos de error: si el XML está
  // roto, no se puede confiar en lo leído.
  for (const p of xml.problemas) {
    hallazgos.push({ codigo: 'xml_ilegible', gravedad: 'error', mensaje: p });
  }

  // --- Operación ---
  const rucPropio = opciones.rucPropio?.trim();
  let operacion: 'venta' | 'compra' = 'compra';
  if (rucPropio && xml.rucEmisor) {
    operacion = xml.rucEmisor.trim() === rucPropio ? 'venta' : 'compra';
  } else if (!rucPropio) {
    avisos.push('No se indicó el RUC propio: se asumió compra. Revisar si era una venta.');
  }

  // --- Período ---
  const periodo = opciones.periodo?.trim() || periodoDe(xml.fechaEmision);
  if (!periodo) {
    avisos.push('No se pudo determinar el período: falta la fecha de emisión.');
  }

  // --- Moneda ---
  const moneda = (xml.moneda ?? 'PEN').toUpperCase();
  let base = xml.base ?? 0;
  let igv = xml.igv ?? 0;
  let exonerado = xml.exonerado ?? 0;
  let total = xml.total ?? 0;
  let tipoCambioAplicado: number | null = null;

  if (moneda !== 'PEN') {
    const conv = convertirComprobante(
      { base: xml.base, igv: xml.igv, exonerado: xml.exonerado, total: xml.total },
      moneda,
      operacion,
      opciones.tipoCambio
    );
    base = conv.base;
    igv = conv.igv;
    exonerado = conv.exonerado;
    total = conv.total;
    tipoCambioAplicado = conv.tipoCambio || null;
    avisos.push(...conv.avisos);
  }

  // --- Validación SUNAT (sobre los importes ya en soles) ---
  if (periodo) {
    hallazgos.push(
      ...validarComprobante({
        tipo: xml.tipo,
        serie: xml.serie,
        numero: xml.numero,
        fechaEmision: xml.fechaEmision,
        rucEmisor: xml.rucEmisor,
        rucReceptor: xml.rucReceptor,
        base,
        igv,
        exonerado,
        total,
        afectacion: xml.afectacion,
        periodo,
      })
    );
  }

  // --- Duplicado ---
  const clave = claveDuplicado('', xml.rucEmisor, xml.serie, xml.numero);
  if (opciones.yaExiste) {
    hallazgos.push({
      codigo: 'duplicado',
      gravedad: 'error',
      mensaje: 'Este comprobante ya está registrado en el período.',
    });
  }

  // --- Estado ---
  const estado = decidirEstado(hallazgos, 'xml', !!opciones.yaExiste);

  return {
    tipo: xml.tipo,
    operacion,
    serie: xml.serie,
    numero: xml.numero,
    fechaEmision: xml.fechaEmision,
    rucEmisor: xml.rucEmisor,
    rucReceptor: xml.rucReceptor,
    razonEmisor: xml.razonSocialEmisor,
    razonReceptor: xml.razonSocialReceptor,
    moneda,
    tipoCambio: tipoCambioAplicado,
    base,
    igv,
    exonerado,
    total,
    afectacion: xml.afectacion,
    origen: 'xml',
    confianza: CONFIANZA.xml,
    estado,
    hallazgos,
    avisos,
    clave,
  };
}

/**
 * Ingiere un comprobante leído del TEXTO de un PDF.
 *
 * Misma mecánica que ingerirDesdeXML, con dos diferencias que vienen del medio:
 *
 * 1. Un campo ausente NO se convierte en 0. En un XML un importe que falta es
 *    un error de estructura; en un PDF lo normal es que la maquetación no se
 *    haya entendido. Aquí el importe queda en 0 y se registra el hallazgo, para
 *    que nadie confirme un comprobante cuyo total en realidad se desconoce.
 * 2. El estado nunca pasa de 'pendiente': el texto de un PDF no es
 *    determinista, así que siempre lo mira una persona.
 */
export function ingerirDesdePDF(
  campos: CamposFacturaPDF,
  opciones: OpcionesIngesta = {}
): ComprobanteIngerido {
  const avisos: string[] = [...campos.avisos];
  const hallazgos: Hallazgo[] = [];

  // Un campo que no se leyó impide validar, pero no es excusa para inventarlo:
  // se avisa y se deja el valor en 0 para que el total cante en la revisión.
  for (const faltante of campos.faltantes) {
    hallazgos.push({
      codigo: `pdf_sin_${faltante}`,
      gravedad: 'error',
      campo: faltante,
      mensaje: `No se pudo leer «${faltante}» del PDF: hay que completarlo a mano.`,
    });
  }

  // --- Operación ---
  const rucPropio = opciones.rucPropio?.trim();
  let operacion: 'venta' | 'compra' = 'compra';
  if (rucPropio && campos.rucEmisor) {
    operacion = campos.rucEmisor.trim() === rucPropio ? 'venta' : 'compra';
  } else if (!rucPropio) {
    avisos.push('No se indicó el RUC propio: se asumió compra. Revisar si era una venta.');
  }

  // --- Período ---
  const periodo = opciones.periodo?.trim() || periodoDe(campos.fechaEmision);
  if (!periodo) {
    avisos.push('No se pudo determinar el período: falta la fecha de emisión.');
  }

  // --- Moneda ---
  const moneda = (campos.moneda ?? 'PEN').toUpperCase();
  let base = campos.base ?? 0;
  let igv = campos.igv ?? 0;
  let exonerado = campos.exonerado ?? 0;
  let total = campos.total ?? 0;
  let tipoCambioAplicado: number | null = null;

  if (moneda !== 'PEN') {
    const conv = convertirComprobante(
      { base: campos.base, igv: campos.igv, exonerado: campos.exonerado, total: campos.total },
      moneda,
      operacion,
      opciones.tipoCambio
    );
    base = conv.base;
    igv = conv.igv;
    exonerado = conv.exonerado;
    total = conv.total;
    tipoCambioAplicado = conv.tipoCambio || null;
    avisos.push(...conv.avisos);
  }

  // --- Validación SUNAT (sobre los importes ya en soles) ---
  // Sin serie o número la validación no puede decir nada útil del duplicado,
  // pero sí comprobar el RUC y el cuadre de los importes que se leyeron.
  if (periodo && campos.tipo) {
    hallazgos.push(
      ...validarComprobante({
        tipo: campos.tipo,
        serie: campos.serie,
        numero: campos.numero,
        fechaEmision: campos.fechaEmision,
        rucEmisor: campos.rucEmisor,
        rucReceptor: campos.rucReceptor,
        base,
        igv,
        exonerado,
        total,
        afectacion: null,
        periodo,
      })
    );
  }

  // --- Duplicado ---
  const clave = claveDuplicado('', campos.rucEmisor, campos.serie, campos.numero);
  if (opciones.yaExiste) {
    hallazgos.push({
      codigo: 'duplicado',
      gravedad: 'error',
      mensaje: 'Este comprobante ya está registrado en el período.',
    });
  }

  // El PDF nunca llega a 'revisado' por bien que se haya leído: el estado lo
  // decide una persona, así que se pasa 'pdf_texto' y se fuerza 'pendiente'.
  const estado = decidirEstado(hallazgos, 'pdf_texto', !!opciones.yaExiste);

  return {
    tipo: campos.tipo ?? 'factura',
    operacion,
    serie: campos.serie,
    numero: campos.numero,
    fechaEmision: campos.fechaEmision,
    rucEmisor: campos.rucEmisor,
    rucReceptor: campos.rucReceptor,
    razonEmisor: campos.razonSocialEmisor,
    // Un PDF no trae de forma fiable el nombre de la contraparte: se deja
    // nulo antes que poner ahí el del emisor, que sería un dato falso.
    razonReceptor: null,
    moneda,
    tipoCambio: tipoCambioAplicado,
    base,
    igv,
    exonerado,
    total,
    afectacion: null,
    origen: 'pdf_texto',
    // La confianza del extractor, acotada para no dar falsa seguridad.
    confianza: Math.min(campos.confianza, CONFIANZA.pdf_texto),
    estado: estado === 'revisado' ? 'pendiente' : estado,
    hallazgos,
    avisos,
    clave,
  };
}

/**
 * Decide el estado inicial.
 *
 * Regla dura: NADA entra confirmado. Como mucho 'revisado', y solo si la
 * lectura fue determinista (XML) y no hay errores. Un duplicado siempre queda
 * en 'pendiente': alguien tiene que mirar si es un reenvío o una corrección.
 */
export function decidirEstado(
  hallazgos: Hallazgo[],
  origen: Origen,
  duplicado: boolean
): Estado {
  if (tieneErrores(hallazgos)) return 'pendiente';
  if (duplicado) return 'pendiente';

  // Solo el XML llega a 'revisado' sin que nadie lo mire: es la única vía
  // determinista. PDF y visión son lecturas, no certezas.
  if (origen === 'xml') return 'revisado';
  return 'pendiente';
}

/**
 * ¿Hay algo que impida confirmar? Devuelve los motivos, vacío si se puede.
 */
export function motivosParaNoConfirmar(c: ComprobanteIngerido): string[] {
  const motivos: string[] = [];
  if (tieneErrores(c.hallazgos)) {
    motivos.push(...c.hallazgos.filter((h) => h.gravedad === 'error').map((h) => h.mensaje));
  }
  if (c.estado === 'descartado') motivos.push('El comprobante está descartado.');
  if (!c.serie || !c.numero) motivos.push('Falta serie o número.');
  if (c.total <= 0) motivos.push('El importe total debe ser mayor que cero.');
  return motivos;
}

/** Resumen legible para la bandeja de revisión. */
export function resumenComprobante(c: ComprobanteIngerido): string {
  const doc = [c.serie, c.numero].filter(Boolean).join('-') || 'sin número';
  const tipo = c.tipo.replace('_', ' ');
  const quien = c.razonEmisor || c.rucEmisor || 'sin RUC';
  const importe = `S/ ${c.total.toFixed(2)}`;
  const errores = c.hallazgos.filter((h) => h.gravedad === 'error').length;
  const avisos = c.hallazgos.filter((h) => h.gravedad === 'aviso').length;
  const marca = errores > 0 ? ` [${errores} error(es)]` : avisos > 0 ? ` [${avisos} aviso(s)]` : '';
  return `${tipo} ${doc} - ${quien} - ${importe}${marca}`;
}
