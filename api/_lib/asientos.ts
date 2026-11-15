/**
 * Generación de asientos contables (partida doble) desde un comprobante.
 *
 * Traduce un comprobante ya validado a las líneas de debe/haber del PCGE.
 * Es determinista: las mismas entradas dan siempre el mismo asiento. La
 * confianza del extractor NO entra aquí — un dato mal leído genera un asiento
 * aritméticamente correcto y contablemente falso, que es peor que un error
 * visible porque se descubre declarando. Por eso la validación va antes.
 *
 * Regla de la casa: todo asiento cuadra. Los generadores lo verifican antes de
 * devolver y lanzan si no cuadra, en vez de entregar un asiento roto.
 *
 * Ver docs/PROPUESTA-AUTOMATIZACION.md §5.
 */

import type { TipoComprobante } from './comprobante.js';

// ---------------------------------------------------------------------------
// Catálogo PCGE (Resolución CNC 002-2019-EF/30, vigente)
// ---------------------------------------------------------------------------

export const CUENTAS = {
  /** 12 Cuentas por cobrar comerciales – terceros */
  CXC: { codigo: '12', nombre: 'Cuentas por cobrar comerciales - terceros' },
  /** 42 Cuentas por pagar comerciales – terceros */
  CXP: { codigo: '42', nombre: 'Cuentas por pagar comerciales - terceros' },
  /** 40111 IGV por pagar (ventas) */
  IGV_VENTAS: { codigo: '40111', nombre: 'IGV por pagar' },
  /** 40112 IGV crédito fiscal (compras) */
  IGV_COMPRAS: { codigo: '40112', nombre: 'IGV crédito fiscal' },
  /** 40113 IGV régimen de percepciones */
  IGV_PERCEPCIONES: { codigo: '40113', nombre: 'IGV régimen de percepciones' },
  /** 40114 IGV régimen de retenciones */
  IGV_RETENCIONES: { codigo: '40114', nombre: 'IGV régimen de retenciones' },
  /** 70 Ventas */
  VENTAS: { codigo: '70', nombre: 'Ventas' },
  /** 60 Compras */
  COMPRAS: { codigo: '60', nombre: 'Compras' },
  /** 69 Costo de ventas */
  COSTO_VENTAS: { codigo: '69', nombre: 'Costo de ventas' },
  /** 63 Gastos de servicios prestados por terceros */
  SERVICIOS: { codigo: '63', nombre: 'Gastos de servicios prestados por terceros' },
  /** 10 Efectivo y equivalentes de efectivo */
  CAJA: { codigo: '10', nombre: 'Efectivo y equivalentes de efectivo' },
  /** 20 Mercaderías */
  MERCADERIAS: { codigo: '20', nombre: 'Mercaderías' },
} as const;

export type CuentaPCGE = (typeof CUENTAS)[keyof typeof CUENTAS];

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface LineaAsiento {
  cuenta: string;
  cuentaNombre: string;
  debe: number;
  haber: number;
  /** Glosa por línea, opcional. */
  detalle?: string;
}

export interface AsientoGenerado {
  fecha: string;
  glosa: string;
  lineas: LineaAsiento[];
  totalDebe: number;
  totalHaber: number;
}

export interface ComprobanteContable {
  tipo: TipoComprobante;
  serie?: string | null;
  numero?: string | null;
  fechaEmision?: string | null;
  rucEmisor?: string | null;
  razonSocialEmisor?: string | null;
  base?: number | null;
  igv?: number | null;
  exonerado?: number | null;
  total?: number | null;
  /** 'venta' = el cliente vende; 'compra' = el cliente compra. */
  operacion: 'venta' | 'compra';
  /** Nota de crédito emitida (reduce venta) o recibida (reduce compra). */
  notaEmitidaPorMi?: boolean;
  /** Retención de IGV aplicada por el agente (solo ventas en algunos regímenes). */
  retencion?: number | null;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Redondea a céntimos. Los importes contables nunca llevan fracciones de céntimo. */
function c(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** ¿El asiento cuadra al céntimo? */
export function cuadra(a: AsientoGenerado): boolean {
  return c(a.totalDebe) === c(a.totalHaber);
}

/**
 * Lanza si el asiento no cuadra. Se llama siempre antes de devolver: un asiento
 * descuadrado no debe llegar nunca a la base de datos.
 */
function exigirCuadre(a: AsientoGenerado): AsientoGenerado {
  const debe = c(a.totalDebe);
  const haber = c(a.totalHaber);
  if (debe !== haber) {
    throw new Error(
      `Asiento descuadrado (${debe.toFixed(2)} ≠ ${haber.toFixed(2)}): ${a.glosa}`
    );
  }
  // Un asiento sin líneas o con todas en cero tampoco sirve.
  const conImporte = a.lineas.filter((l) => c(l.debe) > 0 || c(l.haber) > 0);
  if (conImporte.length < 2) {
    throw new Error(`Asiento sin partida doble (${conImporte.length} línea(s) con importe): ${a.glosa}`);
  }
  return a;
}

function glosaBase(com: ComprobanteContable): string {
  const tipo = com.tipo.replace('_', ' ');
  const doc = [com.serie, com.numero].filter(Boolean).join('-');
  const quien = com.razonSocialEmisor || com.rucEmisor || 'sin RUC';
  return `${tipo} ${doc} ${quien}`.trim().replace(/\s+/g, ' ');
}

function fechaOFallo(com: ComprobanteContable): string {
  if (!com.fechaEmision) {
    throw new Error('No se puede generar el asiento sin fecha de emisión.');
  }
  return com.fechaEmision;
}

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/**
 * Asiento de una COMPRA (el cliente recibe la factura).
 *
 *   DEBE  60  Compras                 base gravada
 *   DEBE  60  Compras                 exonerado (sin crédito fiscal)
 *   DEBE  40112 IGV crédito fiscal    igv
 *   HABER 42  CxP                     total
 *
 * El exonerado también va a la 60: no da crédito fiscal pero sí es gasto.
 */
export function asientoCompra(com: ComprobanteContable): AsientoGenerado {
  if (com.operacion !== 'compra') {
    throw new Error('asientoCompra() recibió un comprobante de venta.');
  }
  const fecha = fechaOFallo(com);
  const base = c(com.base);
  const igv = c(com.igv);
  const exonerado = c(com.exonerado);
  const total = c(com.total);

  // Si el total no viene, se reconstruye: el asiento debe cuadrar siempre.
  const totalReal = total || c(base + igv + exonerado);

  const lineas: LineaAsiento[] = [];
  const compra = c(base + exonerado);
  if (compra > 0) {
    lineas.push({
      cuenta: CUENTAS.COMPRAS.codigo,
      cuentaNombre: CUENTAS.COMPRAS.nombre,
      debe: compra,
      haber: 0,
      detalle: exonerado > 0 ? `base ${c(base).toFixed(2)} + exonerado ${exonerado.toFixed(2)}` : undefined,
    });
  }
  if (igv > 0) {
    lineas.push({
      cuenta: CUENTAS.IGV_COMPRAS.codigo,
      cuentaNombre: CUENTAS.IGV_COMPRAS.nombre,
      debe: igv,
      haber: 0,
    });
  }
  lineas.push({
    cuenta: CUENTAS.CXP.codigo,
    cuentaNombre: CUENTAS.CXP.nombre,
    debe: 0,
    haber: totalReal,
  });

  return exigirCuadre({
    fecha,
    glosa: glosaBase(com),
    lineas,
    totalDebe: lineas.reduce((s, l) => s + c(l.debe), 0),
    totalHaber: lineas.reduce((s, l) => s + c(l.haber), 0),
  });
}

/**
 * Asiento de una VENTA (el cliente emite la factura).
 *
 *   DEBE  12  CxC                     total
 *   HABER 70  Ventas                  base gravada
 *   HABER 70  Ventas                  exonerado
 *   HABER 40111 IGV por pagar         igv
 *
 * Con retención de IGV (el cliente emitió y un agente le retiene):
 *   DEBE  12  CxC                     total - retención
 *   DEBE  40114 IGV retenciones       retención   (crédito a favor del cliente)
 *   HABER 70  Ventas                  base gravada
 *   HABER 40111 IGV por pagar         igv
 *
 * La retención NO reduce el ingreso ni el IGV que se declara: es un saldo a
 * favor del cliente frente a SUNAT. Por eso entra por el DEBE, no restando del
 * haber. Restarla del CxC y además abonarla descuadra el asiento.
 */
export function asientoVenta(com: ComprobanteContable): AsientoGenerado {
  if (com.operacion !== 'venta') {
    throw new Error('asientoVenta() recibió un comprobante de compra.');
  }
  const fecha = fechaOFallo(com);
  const base = c(com.base);
  const igv = c(com.igv);
  const exonerado = c(com.exonerado);
  const total = c(com.total);
  const retencion = c(com.retencion);

  const totalReal = total || c(base + igv + exonerado);
  const porCobrar = c(totalReal - retencion);

  const lineas: LineaAsiento[] = [
    {
      cuenta: CUENTAS.CXC.codigo,
      cuentaNombre: CUENTAS.CXC.nombre,
      debe: porCobrar,
      haber: 0,
      detalle: retencion > 0 ? `neto de retención ${retencion.toFixed(2)}` : undefined,
    },
  ];

  // La retención entra por el debe: es IGV que el cliente ya pagó por
  // adelantado y que recuperará contra su impuesto.
  if (retencion > 0) {
    lineas.push({
      cuenta: CUENTAS.IGV_RETENCIONES.codigo,
      cuentaNombre: CUENTAS.IGV_RETENCIONES.nombre,
      debe: retencion,
      haber: 0,
    });
  }

  const ingreso = c(base + exonerado);
  if (ingreso > 0) {
    lineas.push({
      cuenta: CUENTAS.VENTAS.codigo,
      cuentaNombre: CUENTAS.VENTAS.nombre,
      debe: 0,
      haber: ingreso,
    });
  }
  if (igv > 0) {
    lineas.push({
      cuenta: CUENTAS.IGV_VENTAS.codigo,
      cuentaNombre: CUENTAS.IGV_VENTAS.nombre,
      debe: 0,
      haber: igv,
    });
  }

  return exigirCuadre({
    fecha,
    glosa: glosaBase(com),
    lineas,
    totalDebe: lineas.reduce((s, l) => s + c(l.debe), 0),
    totalHaber: lineas.reduce((s, l) => s + c(l.haber), 0),
  });
}

/**
 * Invierte un asiento (debe <-> haber). Se usa para las notas de crédito:
 * una NC es exactamente el asiento contrario al que corrige.
 */
export function invertir(a: AsientoGenerado, motivo?: string): AsientoGenerado {
  const lineas = a.lineas.map((l) => ({
    ...l,
    debe: c(l.haber),
    haber: c(l.debe),
  }));
  const totalDebe = lineas.reduce((s, l) => s + c(l.debe), 0);
  const totalHaber = lineas.reduce((s, l) => s + c(l.haber), 0);
  return exigirCuadre({
    fecha: a.fecha,
    glosa: motivo ? `${a.glosa} (${motivo})` : `${a.glosa} (invertido)`,
    lineas,
    totalDebe,
    totalHaber,
  });
}

/**
 * Punto de entrada: elige el generador según tipo y operación.
 *
 * Las notas de crédito invierten el asiento del documento que corrigen. Si la
 * nota no tiene importes propios (algunas solo referencian el documento), se
 * lanza: mejor una revisión humana que un asiento inventado.
 */
export function generarAsiento(com: ComprobanteContable): AsientoGenerado {
  if (!com.fechaEmision) {
    throw new Error('No se puede generar el asiento sin fecha de emisión.');
  }

  const esNotaCredito = com.tipo === 'nota_credito';

  let a: AsientoGenerado;
  if (esNotaCredito) {
    // Una NC se registra como el espejo del documento que corrige.
    const comoSiFuera = {
      ...com,
      // Si la NC lleva base/igv propios se usa ese importe como el original.
      total: c(com.total),
    };
    if (c(com.total) === 0) {
      throw new Error(
        'La nota de crédito no tiene importe propio: hay que vincularla al comprobante que corrige.'
      );
    }
    a = com.operacion === 'venta' ? asientoVenta(comoSiFuera) : asientoCompra(comoSiFuera);
    return invertir(a, 'nota de crédito');
  }

  if (com.tipo === 'nota_debito') {
    // La nota de débito suma: mismo asiento que la operación base.
    a = com.operacion === 'venta' ? asientoVenta(com) : asientoCompra(com);
    return { ...a, glosa: `${a.glosa} (nota de débito)` };
  }

  return com.operacion === 'venta' ? asientoVenta(com) : asientoCompra(com);
}

/**
 * Asiento de una venta con su costo (para quienes llevan inventario).
 *
 *   DEBE  69  Costo de ventas
 *   HABER 20  Mercaderías
 *
 * Va aparte porque no todo cliente lleva inventario: un estudio contable
 * factura servicios sin costo de ventas asociado.
 */
export function asientoCostoVenta(costo: number, fecha: string, glosa: string): AsientoGenerado {
  const importe = c(costo);
  if (importe <= 0) {
    throw new Error('El costo de venta debe ser mayor que cero.');
  }
  return exigirCuadre({
    fecha,
    glosa: `${glosa} (costo de ventas)`,
    lineas: [
      {
        cuenta: CUENTAS.COSTO_VENTAS.codigo,
        cuentaNombre: CUENTAS.COSTO_VENTAS.nombre,
        debe: importe,
        haber: 0,
      },
      {
        cuenta: CUENTAS.MERCADERIAS.codigo,
        cuentaNombre: CUENTAS.MERCADERIAS.nombre,
        debe: 0,
        haber: importe,
      },
    ],
    totalDebe: importe,
    totalHaber: importe,
  });
}
