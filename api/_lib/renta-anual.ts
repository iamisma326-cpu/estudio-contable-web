/**
 * Renta anual de tercera categoría (DJ Anual, Formulario Virtual 710).
 *
 * Calcula el impuesto del ejercicio, no solo el número final: sigue el esquema
 * del formulario línea por línea para que el asistente pueda cotejar cada
 * casilla. Un importe a pagar sin su desglose no se puede revisar ni defender
 * ante una fiscalización.
 *
 * Esquema (cartilla de instrucciones SUNAT, ejercicio 2025):
 *
 *   Renta bruta (ingresos netos del ejercicio)
 *   (−) Costo computable / gastos deducibles aceptados
 *   = Renta neta
 *   (+) Adiciones (gastos no deducibles, excesos de límites)
 *   (−) Deducción de pérdidas de ejercicios anteriores
 *   = Renta neta imponible
 *   × tasa según régimen
 *   = Impuesto calculado
 *   (−) Créditos (pagos a cuenta, retenciones, saldo a favor anterior)
 *   = Impuesto por regularizar (o saldo a favor)
 *
 * Tasas confirmadas en renta.sunat.gob.pe (Renta 2025):
 *   Régimen General: 29.5% sobre la renta neta anual.
 *   RMT: escala progresiva acumulativa, 10% hasta 15 UIT y 29.5% por el exceso.
 *
 * Límite de gastos recreativos (inciso ll del art. 37 de la Ley): 0.5% de los
 * ingresos netos, con tope de 40 UIT, el que resulte menor.
 *
 * Lo que este módulo NO hace, a propósito: no decide si un gasto es deducible.
 * Recibe los importes ya clasificados por el contador. Adivinar la deducibilidad
 * es justo el error que convierte una declaración en una reparatoria.
 */

import { UIT_2026, REGIMENES } from '../../src/data/regimenes.js';

/** Redondeo a céntimos, el mismo criterio que usa SUNAT en los importes. */
function c2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type RegimenAnual = 'GENERAL' | 'RMT' | 'RER';

/** Datos del ejercicio. Todos los importes en soles y sin IGV. */
export interface DatosAnuales {
  anio: number;
  regimen: RegimenAnual;
  /** Ingresos netos del ejercicio (ventas sin IGV, netas de notas de crédito). */
  ingresosNetos: number;
  /** Costo computable y gastos deducibles ya aceptados por el contador. */
  gastosDeducibles: number;
  /** Gastos no deducibles que se adicionan a la renta neta. */
  adiciones?: number;
  /** Pérdidas de ejercicios anteriores que se compensan este año. */
  perdidasAnteriores?: number;
  /** Pagos a cuenta del ejercicio efectivamente pagados. */
  pagosACuenta?: number;
  /** Retenciones y percepciones del Impuesto a la Renta. */
  retenciones?: number;
  /** Saldo a favor del impuesto de ejercicios anteriores. */
  saldoAFavorAnterior?: number;
  /** Gastos recreativos contabilizados, para aplicar su límite. */
  gastosRecreativos?: number;
}

/** Una línea del formulario, con su origen explicado. */
export interface LineaAnual {
  concepto: string;
  importe: number;
  /** Por qué sale ese número; vacío cuando es un dato de entrada. */
  detalle?: string;
}

export interface ResultadoAnual {
  anio: number;
  regimen: RegimenAnual;
  /** Renta bruta del ejercicio. */
  rentaBruta: number;
  gastosDeducibles: number;
  /** Límite aplicado a gastos recreativos, si se informaron. */
  limiteRecreativo: number | null;
  /** Exceso de gastos recreativos que se adiciona. */
  excesoRecreativo: number;
  rentaNeta: number;
  adiciones: number;
  perdidasAnteriores: number;
  rentaNetaImponible: number;
  /** Tasa efectiva aplicada sobre la renta neta imponible. */
  tasaEfectiva: number;
  impuestoCalculado: number;
  creditos: number;
  /** Lo que se paga con la declaración. Positivo = a pagar. */
  porRegularizar: number;
  /** Si los créditos superan el impuesto: saldo a favor del ejercicio. */
  saldoAFavor: number;
  lineas: LineaAnual[];
  avisos: string[];
}

/**
 * Límite deducible de gastos recreativos.
 *
 * El menor entre 0.5% de los ingresos netos y 40 UIT. Se devuelve también el
 * exceso porque es lo que se adiciona a la renta neta, y es un renglón que se
 * olvida con facilidad.
 */
export function limiteGastosRecreativos(
  ingresosNetos: number,
  gastosRecreativos: number,
  uit: number = UIT_2026
): { limite: number; exceso: number } {
  if (gastosRecreativos <= 0) return { limite: 0, exceso: 0 };
  const porIngresos = c2(Math.max(0, ingresosNetos) * 0.005);
  const topeUit = c2(40 * uit);
  const limite = Math.min(porIngresos, topeUit);
  return { limite, exceso: c2(Math.max(0, gastosRecreativos - limite)) };
}

/**
 * Impuesto según la escala del régimen.
 *
 * RMT es progresiva acumulativa: 10% sobre los primeros 15 UIT de renta neta y
 * 29.5% sobre el exceso. No es "10% o 29.5%" según un umbral: aplicar la tasa
 * alta a todo cuando se pasa de 15 UIT es un error caro y frecuente.
 */
export function impuestoPorEscala(
  rentaNetaImponible: number,
  regimen: RegimenAnual,
  uit: number = UIT_2026
): { impuesto: number; tasaEfectiva: number } {
  const renta = Math.max(0, rentaNetaImponible);
  if (renta === 0) return { impuesto: 0, tasaEfectiva: 0 };

  if (regimen === 'RER') {
    // El RER no determina impuesto sobre renta neta: paga 1.5% mensual sobre
    // ingresos netos, con carácter definitivo. Se avisa en el resultado.
    return { impuesto: 0, tasaEfectiva: 0 };
  }

  if (regimen === 'GENERAL') {
    const impuesto = c2(renta * REGIMENES.GENERAL.tasa);
    return { impuesto, tasaEfectiva: REGIMENES.GENERAL.tasa };
  }

  // RMT: tramo reducido hasta 15 UIT, exceso al 29.5%.
  const tramoReducido = 15 * uit;
  const tasaBaja = REGIMENES.RMT.tasaHasta15UIT;
  const tasaAlta = REGIMENES.RMT.tasaExceso;

  if (renta <= tramoReducido) {
    return { impuesto: c2(renta * tasaBaja), tasaEfectiva: tasaBaja };
  }
  const impuesto = c2(tramoReducido * tasaBaja + (renta - tramoReducido) * tasaAlta);
  return { impuesto, tasaEfectiva: c2(impuesto / renta) };
}

/**
 * Liquidación completa del ejercicio.
 *
 * Devuelve las líneas del formulario en orden, para que se puedan leer como se
 * lee el 710 y no como una suma suelta.
 */
export function liquidarRentaAnual(
  datos: DatosAnuales,
  uit: number = UIT_2026
): ResultadoAnual {
  const avisos: string[] = [];

  const ingresos = c2(Math.max(0, datos.ingresosNetos));
  const gastos = c2(Math.max(0, datos.gastosDeducibles));
  const recreativos = c2(Math.max(0, datos.gastosRecreativos ?? 0));

  const { limite, exceso } = limiteGastosRecreativos(ingresos, recreativos, uit);
  if (exceso > 0) {
    avisos.push(
      `Gastos recreativos: el límite deducible es ${limite.toFixed(2)} ` +
        `(el menor entre 0.5% de ingresos y 40 UIT). Se adicionan ${exceso.toFixed(2)}.`
    );
  }
  if (gastos > ingresos + 10) {
    avisos.push(
      'Los gastos superan a los ingresos: la renta neta será una pérdida. ' +
        'Compruébese que no falten ingresos por registrar.'
    );
  }

  // `gastosDeducibles` trae el gasto recreativo completo tal como está en
  // contabilidad. La renta neta parte de ahí sin tocarlo y el exceso sobre el
  // límite se adiciona. Sumar aquí el límite y además el exceso contaría dos
  // veces la misma diferencia.
  const rentaNeta = c2(ingresos - gastos);
  const adiciones = c2(Math.max(0, datos.adiciones ?? 0) + exceso);
  const perdidas = c2(Math.max(0, datos.perdidasAnteriores ?? 0));

  // La pérdida compensable no puede dejar la renta imponible en negativo.
  const rentaAntesPerdidas = c2(rentaNeta + adiciones);
  if (perdidas > 0 && rentaAntesPerdidas <= 0) {
    avisos.push(
      'Hay pérdidas de ejercicios anteriores para compensar, pero la renta del ' +
        'ejercicio no es positiva: no se aplican y quedan para el año siguiente.'
    );
  }
  const perdidasAplicadas = Math.min(perdidas, Math.max(0, rentaAntesPerdidas));
  const rentaNetaImponible = Math.max(0, c2(rentaAntesPerdidas - perdidasAplicadas));

  const { impuesto, tasaEfectiva } = impuestoPorEscala(rentaNetaImponible, datos.regimen, uit);

  const pac = c2(Math.max(0, datos.pagosACuenta ?? 0));
  const ret = c2(Math.max(0, datos.retenciones ?? 0));
  const saldo = c2(Math.max(0, datos.saldoAFavorAnterior ?? 0));
  const creditos = c2(pac + ret + saldo);

  const diferencia = c2(impuesto - creditos);
  const porRegularizar = diferencia > 0 ? diferencia : 0;
  const saldoAFavor = diferencia < 0 ? c2(-diferencia) : 0;

  if (datos.regimen === 'RER') {
    avisos.push(
      'El Régimen Especial de Renta no presenta renta anual sobre renta neta: ' +
        'paga 1.5% mensual sobre ingresos netos con carácter definitivo. ' +
        'Esta liquidación no corresponde a ese régimen.'
    );
  }
  if (datos.regimen === 'RMT' && ingresos > 1700 * uit) {
    avisos.push(
      `Los ingresos (${ingresos.toFixed(2)}) superan las 1,700 UIT ` +
        `(${(1700 * uit).toFixed(2)}): el cliente no puede estar en el RMT.`
    );
  }

  const lineas: LineaAnual[] = [
    { concepto: 'Renta bruta (ingresos netos del ejercicio)', importe: ingresos },
    { concepto: '(−) Costo computable y gastos deducibles', importe: -gastos },
  ];
  if (recreativos > 0) {
    lineas.push({
      concepto: 'Gastos recreativos aceptados',
      importe: limite,
      detalle: `de ${recreativos.toFixed(2)} contabilizados`,
    });
  }
  lineas.push({ concepto: '= Renta neta', importe: rentaNeta });
  lineas.push({ concepto: '(+) Adiciones', importe: adiciones });
  if (perdidas > 0) {
    lineas.push({
      concepto: '(−) Pérdidas de ejercicios anteriores aplicadas',
      importe: -perdidasAplicadas,
      detalle:
        perdidasAplicadas < perdidas
          ? `de ${perdidas.toFixed(2)}; el resto no se pudo aplicar`
          : undefined,
    });
  }
  lineas.push({ concepto: '= Renta neta imponible', importe: rentaNetaImponible });
  lineas.push({
    concepto: `Impuesto calculado (${(tasaEfectiva * 100).toFixed(2)}%)`,
    importe: impuesto,
    detalle: datos.regimen === 'RMT' ? 'escala 10% / 29.5%' : undefined,
  });
  lineas.push({ concepto: '(−) Pagos a cuenta', importe: -pac });
  if (ret > 0) lineas.push({ concepto: '(−) Retenciones y percepciones', importe: -ret });
  if (saldo > 0) lineas.push({ concepto: '(−) Saldo a favor de ejercicios anteriores', importe: -saldo });
  lineas.push({
    concepto: porRegularizar > 0 ? '= Impuesto por regularizar' : '= Saldo a favor del ejercicio',
    importe: porRegularizar > 0 ? porRegularizar : -saldoAFavor,
  });

  return {
    anio: datos.anio,
    regimen: datos.regimen,
    rentaBruta: ingresos,
    gastosDeducibles: gastos,
    limiteRecreativo: recreativos > 0 ? limite : null,
    excesoRecreativo: exceso,
    rentaNeta,
    adiciones,
    perdidasAnteriores: perdidasAplicadas,
    rentaNetaImponible,
    tasaEfectiva,
    impuestoCalculado: impuesto,
    creditos,
    porRegularizar,
    saldoAFavor,
    lineas,
    avisos,
  };
}
