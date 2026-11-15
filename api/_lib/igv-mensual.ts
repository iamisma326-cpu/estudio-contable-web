/**
 * Liquidación mensual del IGV (Formulario 0621) y pago a cuenta de renta.
 *
 * El cálculo del IGV de un mes es una resta, pero la resta está llena de
 * trampas que SUNAT no perdona:
 *
 *   - El crédito fiscal de una compra solo se usa si el comprobante está
 *     anotado en el registro de compras del período y tiene RUC válido.
 *   - Una nota de crédito RESTA de la base y del IGV; si se sumara, el impuesto
 *     saldría inflado.
 *   - El exonerado y el inafecto van a la base de la cuenta pero NO generan
 *     crédito ni débito: no son "IGV cero", son operaciones fuera del campo.
 *   - El saldo a favor del mes anterior se arrastra. Si no se arrastra, el
 *     cliente paga dos veces el mismo impuesto.
 *
 * Todo esto se calcula aquí, sin base de datos, para poder probarlo con casos
 * conocidos. La ruta solo junta los comprobantes y llama a esta función.
 */

/** Afectación del IGV según el catálogo 07 de SUNAT. */
export type Afectacion = '10' | '20' | '30' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '21' | '31' | '33' | '34' | '35' | '36' | '37';

export interface ComprobanteTributario {
  tipo: string;
  operacion: 'venta' | 'compra';
  /** '10' gravado, '20' exonerado, '30' inafecto. */
  afectacion: string | null;
  base: number;
  igv: number;
  exonerado: number;
  /** 0 si no se separó al guardar. */
  inafecto: number;
  total: number;
  serie: string | null;
  numero: string | null;
}

export interface ResultadoIGV {
  /** Ventas del período por concepto. */
  ventas: ResumenConcepto;
  /** Compras del período por concepto. */
  compras: ResumenConcepto;
  /** IGV de ventas menos IGV de compras. Positivo = a pagar. */
  resultadoIGV: number;
  /** Saldo a favor que entra del mes anterior. */
  saldoAnterior: number;
  /** Saldo a favor que sale hacia el mes siguiente. */
  saldoAFavor: number;
  /** Lo que efectivamente se paga este mes (0 si hay saldo a favor). */
  igvAPagar: number;
  /** Avisos para quien revisa: no impiden calcular, pero hay que leerlos. */
  avisos: string[];
}

export interface ResumenConcepto {
  /** Base imponible gravada (afectación 10). */
  baseGravada: number;
  /** IGV de la operación gravada. */
  igv: number;
  /** Operaciones exoneradas: van al total pero no dan crédito ni débito. */
  exonerado: number;
  /** Operaciones inafectas: igual, fuera del campo del IGV. */
  inafecto: number;
  /** Importe total de los comprobantes del período. */
  total: number;
  /** Número de comprobantes contados. */
  cantidad: number;
}

const CERO: ResumenConcepto = {
  baseGravada: 0,
  igv: 0,
  exonerado: 0,
  inafecto: 0,
  total: 0,
  cantidad: 0,
};

/** Redondeo a céntimos. Sin esto, sumar 33 floats da 0.30000000000000004. */
function c2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Una nota de crédito resta; todo lo demás suma. */
export function signo(tipo: string): 1 | -1 {
  return tipo === 'nota_credito' ? -1 : 1;
}

/**
 * Afectaciones que dan derecho a crédito fiscal.
 *
 * Solo la 10 (gravado, operación del mercado interno). Las demás del catálogo
 * son regímenes especiales (arroz pilado, IVAP, percepciones, retenciones) que
 * un estudio pequeña rara vez toca; si aparecen, se avisan en vez de calcularse
 * mal, porque cada una tiene su propia forma de declararse.
 */
const CON_CREDITO = new Set(['10']);

/** Afectaciones fuera del campo del IGV. */
const FUERA_DE_CAMPO = new Set(['20', '30', '21']);

/**
 * Acumula los comprobantes en un resumen por concepto.
 *
 * Se separa del cálculo del IGV porque las ventas y las compras se agregan con
 * las mismas reglas, y así un cambio en la regla (por ejemplo, cuando se
 * soporten las afectaciones especiales) se hace en un solo sitio.
 */
export function resumir(comprobantes: ComprobanteTributario[]): { resumen: ResumenConcepto; avisos: string[] } {
  const r: ResumenConcepto = { ...CERO };
  const avisos: string[] = [];
  const afectacionesRaras = new Set<string>();

  for (const c of comprobantes) {
    const s = signo(c.tipo);
    const afect = c.afectacion ?? '10';

    r.total = c2(r.total + s * c.total);
    r.cantidad += 1;

    if (CON_CREDITO.has(afect)) {
      r.baseGravada = c2(r.baseGravada + s * c.base);
      r.igv = c2(r.igv + s * c.igv);
    } else if (FUERA_DE_CAMPO.has(afect)) {
      // El exonerado y el inafecto se suman a la base del comprobante pero no
      // generan impuesto. Si el comprobante no separó el importe, se usa el
      // total: es el único dato que queda y es mejor que perderlo.
      const importe = c.exonerado > 0 || c.inafecto > 0
        ? c.exonerado + c.inafecto
        : c.base + c.igv > 0
          ? c.base + c.igv
          : c.total;
      if (afect === '30') r.inafecto = c2(r.inafecto + s * importe);
      else r.exonerado = c2(r.exonerado + s * importe);
    } else {
      // Cualquier otra afectación (IVAP, arroz pilado, percepciones, retención)
      // tiene reglas propias. Se cuenta el total y se avisa: sumarla como si
      // fuera gravada inflaría el impuesto.
      afectacionesRaras.add(afect);
    }
  }

  for (const a of afectacionesRaras) {
    avisos.push(
      `Hay comprobantes con afectación '${a}', que tiene reglas propias (IVAP, arroz pilado, percepciones o retención). ` +
        'No se incluyeron en el cálculo del IGV: revísalos aparte.'
    );
  }

  return { resumen: r, avisos };
}

/**
 * Calcula la liquidación del mes.
 *
 * @param ventas    comprobantes de venta del período
 * @param compras   comprobantes de compra del período
 * @param saldoAnterior saldo a favor del mes anterior (0 si no hay)
 */
export function liquidarIGV(
  ventas: ComprobanteTributario[],
  compras: ComprobanteTributario[],
  saldoAnterior = 0
): ResultadoIGV {
  const v = resumir(ventas);
  const c = resumir(compras);
  const avisos = [...v.avisos, ...c.avisos];

  if (saldoAnterior < 0) {
    avisos.push('El saldo del mes anterior es negativo: un saldo a favor no puede serlo. Se tomó 0.');
  }
  const anterior = Math.max(0, c2(saldoAnterior));

  // IGV ventas − IGV compras − saldo a favor anterior.
  // Positivo: se paga. Negativo: queda a favor para el mes siguiente.
  const resultado = c2(v.resumen.igv - c.resumen.igv - anterior);

  const aFavor = resultado < 0 ? c2(-resultado) : 0;
  const aPagar = resultado > 0 ? resultado : 0;

  if (v.resumen.cantidad === 0) {
    avisos.push('No hay ventas registradas en el período. Si el cliente sí vendió, faltan comprobantes.');
  }
  if (c.resumen.igv > 0 && v.resumen.igv === 0) {
    avisos.push('Hay crédito fiscal pero ninguna venta: el resultado queda como saldo a favor.');
  }

  return {
    ventas: v.resumen,
    compras: c.resumen,
    resultadoIGV: resultado,
    saldoAnterior: anterior,
    saldoAFavor: aFavor,
    igvAPagar: aPagar,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Pago a cuenta del Impuesto a la Renta
// ---------------------------------------------------------------------------

export interface ParametrosRenta {
  /** Tasa del pago a cuenta según el régimen (0.015 RER, 0.01 RMT, 0.015 General). */
  tasa: number;
  /** Coeficiente del régimen general (renta del año anterior / ingresos). Opcional. */
  coeficiente?: number | null;
}

export interface PagoACuenta {
  /** Ingresos netos del mes: ventas gravadas + exoneradas + inafectas. */
  ingresosNetos: number;
  /** Tasa aplicada. */
  tasa: number;
  /** Importe a pagar. */
  monto: number;
  /** De dónde salió la tasa. */
  criterio: 'coeficiente' | 'tasa';
  avisos: string[];
}

/**
 * Pago a cuenta mensual de renta de tercera categoría.
 *
 * Base: los ingresos netos del mes, que son las ventas del período SIN el IGV.
 * Es un error común (y caro) aplicar la tasa sobre el total facturado: el IGV no
 * es ingreso del contribuyente, se cobra por cuenta del Estado.
 *
 * En el régimen general se paga el MAYOR entre el 1.5% de los ingresos y el
 * coeficiente aplicado a los ingresos. El coeficiente sale de la renta del
 * ejercicio anterior y lo calcula la SUNAT; aquí se recibe ya calculado.
 */
export function pagoACuenta(
  ingresosNetos: number,
  params: ParametrosRenta
): PagoACuenta {
  const avisos: string[] = [];
  const ingresos = Math.max(0, c2(ingresosNetos));

  if (ingresos === 0) {
    avisos.push('Sin ingresos netos no hay pago a cuenta que hacer.');
    return { ingresosNetos: 0, tasa: params.tasa, monto: 0, criterio: 'tasa', avisos };
  }

  const porTasa = c2(ingresos * params.tasa);

  let monto = porTasa;
  let criterio: 'coeficiente' | 'tasa' = 'tasa';

  if (params.coeficiente !== null && params.coeficiente !== undefined && params.coeficiente > 0) {
    const porCoef = c2(ingresos * params.coeficiente);
    // Régimen general: se paga el mayor entre el coeficiente y el 1.5%.
    if (porCoef > porTasa) {
      monto = porCoef;
      criterio = 'coeficiente';
    }
  }

  return { ingresosNetos: ingresos, tasa: params.tasa, monto, criterio, avisos };
}

/** Ingresos netos del mes: la base del pago a cuenta. No incluye el IGV. */
export function ingresosNetosDeVentas(ventas: ResumenConcepto): number {
  return c2(ventas.baseGravada + ventas.exonerado + ventas.inafecto);
}
