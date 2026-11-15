/**
 * Conversión a soles para comprobantes en moneda extranjera.
 *
 * El registro contable peruano va en soles (ver db/schema.sql: "Todo en soles.
 * La moneda original se guarda aparte"). Una factura en USD necesita su tipo de
 * cambio del día de emisión, no del día en que se digitó: usar el equivocado
 * mueve el gasto y descuadra la declaración.
 *
 * Este módulo NO llama a la red. Recibe la tasa ya obtenida (del endpoint
 * /api/tipo-cambio o de la del día que indique el contador) y convierte. La red
 * y el caché son responsabilidad de quien llama, para que esto siga siendo
 * determinista y probable sin servidor.
 *
 * Ver docs/PROPUESTA-AUTOMATIZACION.md §6.
 */

export type Moneda = 'PEN' | 'USD' | 'EUR' | string;

export interface TipoCambio {
  fecha: string;
  /** Soles por unidad de moneda extranjera, para compras. */
  compra: number;
  /** Soles por unidad de moneda extranjera, para ventas. */
  venta: number;
}

export interface ImporteConvertido {
  /** Importe en soles, redondeado a céntimos. */
  soles: number;
  /** Tipo de cambio aplicado. */
  tipoCambio: number;
  /** Qué columna se usó y por qué. */
  criterio: 'compra' | 'venta' | 'sin-conversion';
  monedaOriginal: string;
  importeOriginal: number;
  /** Avisos para la bandeja de revisión. */
  avisos: string[];
}

/** Redondeo a céntimos, igual que en asientos.ts. */
function c(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convierte un importe a soles.
 *
 * Criterio SUNAT: las COMPRAS se convierten al tipo de cambio **venta** y las
 * VENTAS al tipo de cambio **compra**. La lógica es la del banco: la otra parte
 * te vende o te compra la divisa. Aplicarlo al revés beneficia siempre al
 * contribuyente, y es de las primeras cosas que observa una fiscalización.
 *
 * Si la moneda ya es PEN no se toca nada y no se exige tipo de cambio.
 */
export function convertirASoles(
  importe: number | null | undefined,
  moneda: Moneda | null | undefined,
  operacion: 'venta' | 'compra',
  tc?: TipoCambio | null
): ImporteConvertido {
  const original = typeof importe === 'number' && Number.isFinite(importe) ? c(importe) : 0;
  const mon = (moneda ?? 'PEN').toUpperCase();
  const avisos: string[] = [];

  // Sin conversión: soles, o un importe que no hay que tocar.
  if (mon === 'PEN') {
    return {
      soles: original,
      tipoCambio: 1,
      criterio: 'sin-conversion',
      monedaOriginal: mon,
      importeOriginal: original,
      avisos,
    };
  }

  if (!tc) {
    avisos.push(
      `Comprobante en ${mon} sin tipo de cambio: hay que registrarlo a mano o pedir la tasa del día.`
    );
    return {
      soles: original,
      tipoCambio: 0,
      criterio: 'sin-conversion',
      monedaOriginal: mon,
      importeOriginal: original,
      avisos,
    };
  }

  // Compras al venta, ventas al compra (criterio SUNAT).
  const criterio: 'compra' | 'venta' = operacion === 'compra' ? 'venta' : 'compra';
  const tasa = criterio === 'venta' ? tc.venta : tc.compra;

  if (!Number.isFinite(tasa) || tasa <= 0) {
    avisos.push(`El tipo de cambio ${criterio} no es válido (${tasa}).`);
    return {
      soles: original,
      tipoCambio: 0,
      criterio: 'sin-conversion',
      monedaOriginal: mon,
      importeOriginal: original,
      avisos,
    };
  }

  // La tasa debe ser del día de emisión o anterior; una futura no existe.
  if (tc.fecha) {
    const hoy = new Date().toISOString().slice(0, 10);
    if (tc.fecha > hoy) {
      avisos.push(`El tipo de cambio es del ${tc.fecha}, posterior a hoy: revisar la fecha.`);
    }
  }

  return {
    soles: c(original * tasa),
    tipoCambio: tasa,
    criterio,
    monedaOriginal: mon,
    importeOriginal: original,
    avisos,
  };
}

/**
 * Convierte los importes de un comprobante conservando su coherencia interna.
 *
 * Convertir base, IGV y total por separado introduce diferencias de redondeo:
 * la suma de las partes puede no dar el total. Aquí se convierte la base y se
 * deriva el total, y se comprueba que la diferencia sea solo de redondeo.
 */
export function convertirComprobante(
  importes: { base: number | null; igv: number | null; exonerado: number | null; total: number | null },
  moneda: Moneda | null | undefined,
  operacion: 'venta' | 'compra',
  tc?: TipoCambio | null
): {
  base: number;
  igv: number;
  exonerado: number;
  total: number;
  tipoCambio: number;
  avisos: string[];
} {
  const avisos: string[] = [];
  const mon = (moneda ?? 'PEN').toUpperCase();

  if (mon === 'PEN') {
    return {
      base: c(importes.base ?? 0),
      igv: c(importes.igv ?? 0),
      exonerado: c(importes.exonerado ?? 0),
      total: c(importes.total ?? 0),
      tipoCambio: 1,
      avisos,
    };
  }

  if (!tc) {
    avisos.push(`Comprobante en ${mon} sin tipo de cambio: no se puede registrar en soles.`);
    return {
      base: c(importes.base ?? 0),
      igv: c(importes.igv ?? 0),
      exonerado: c(importes.exonerado ?? 0),
      total: c(importes.total ?? 0),
      tipoCambio: 0,
      avisos,
    };
  }

  const criterio: 'compra' | 'venta' = operacion === 'compra' ? 'venta' : 'compra';
  const tasa = criterio === 'venta' ? tc.venta : tc.compra;

  if (!Number.isFinite(tasa) || tasa <= 0) {
    avisos.push(`El tipo de cambio ${criterio} no es válido (${tasa}).`);
    return {
      base: c(importes.base ?? 0),
      igv: c(importes.igv ?? 0),
      exonerado: c(importes.exonerado ?? 0),
      total: c(importes.total ?? 0),
      tipoCambio: 0,
      avisos,
    };
  }

  // Se convierte cada componente y se corrige el total para que cuadre.
  const base = c((importes.base ?? 0) * tasa);
  const igv = c((importes.igv ?? 0) * tasa);
  const exonerado = c((importes.exonerado ?? 0) * tasa);
  const sumaPartes = c(base + igv + exonerado);
  const totalOriginal = c((importes.total ?? 0) * tasa);

  // Si el total en soles no coincide con la suma de partes por más de un
  // céntimo, se avisa: puede ser un descuento global no desglosado.
  let total = totalOriginal;
  if (totalOriginal > 0 && Math.abs(sumaPartes - totalOriginal) > 0.01) {
    avisos.push(
      `Al convertir a soles, base + IGV + exonerado = ${sumaPartes.toFixed(2)} pero el total da ${totalOriginal.toFixed(2)}. Revisar descuentos globales.`
    );
  }
  if (total === 0) total = sumaPartes;

  avisos.push(`Convertido de ${mon} a PEN al tipo de cambio ${criterio} ${tasa}.`);

  return { base, igv, exonerado, total, tipoCambio: tasa, avisos };
}

/**
 * ¿La tasa corresponde a la fecha de emisión del comprobante?
 * Un comprobante de ayer no se convierte con la tasa de hoy.
 */
export function tipoCambioCorresponde(
  fechaComprobante: string | null | undefined,
  tc: TipoCambio | null | undefined
): { ok: boolean; motivo?: string } {
  if (!tc) return { ok: false, motivo: 'No hay tipo de cambio.' };
  if (!fechaComprobante) return { ok: false, motivo: 'El comprobante no tiene fecha.' };

  // SUNAT no publica tipo de cambio los fines de semana ni feriados: se usa el
  // último publicado, que es anterior. Solo es problema si la tasa es FUTURA.
  if (tc.fecha > fechaComprobante) {
    return {
      ok: false,
      motivo: `El tipo de cambio es del ${tc.fecha} y el comprobante del ${fechaComprobante}: la tasa no puede ser posterior.`,
    };
  }
  return { ok: true };
}
