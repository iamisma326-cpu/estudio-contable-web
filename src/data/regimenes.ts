/**
 * Parámetros tributarios de los regímenes de tercera categoría,
 * ejercicio 2026 (verificados contra SUNAT y el TUO de la LIR).
 *
 * Fuentes:
 * - RER: emprender.sunat.gob.pe — 1.5% de ingresos netos mensuales,
 *   límites S/ 525,000 de ingresos y de compras, 10 trabajadores.
 * - RMT (D.L. 1269): pagos a cuenta 1% (ingresos hasta 300 UIT),
 *   anual 10% hasta 15 UIT de renta neta + 29.5% por el exceso,
 *   límite 1,700 UIT de ingresos netos anuales.
 * - Régimen General: 29.5% de la renta neta, pagos a cuenta 1.5%
 *   (o coeficiente, si resulta mayor).
 * - UIT 2026: S/ 5,500 (D.S. 301-2025-EF).
 */

export const UIT_2026 = 5500;

export const REGIMENES = {
  RER: {
    nombre: 'Régimen Especial (RER)',
    limiteIngresos: 525000,
    tasaIngresos: 0.015, // pago definitivo mensual
  },
  RMT: {
    nombre: 'Régimen MYPE Tributario',
    limiteIngresos: 1700 * UIT_2026, // S/ 9,350,000
    pagoACuentaTope: 300 * UIT_2026, // pago a cuenta 1% hasta 300 UIT
    pagoACuentaTopeTasa: 0.01,
    pagoACuentaExtraTasa: 0.015, // exceso de 300 UIT: 1.5%
    tasaHasta15UIT: 0.1,
    tasaExceso: 0.295,
    rentaTasaReducida: 15 * UIT_2026, // S/ 82,500
  },
  GENERAL: {
    nombre: 'Régimen General',
    tasa: 0.295,
    pagoACuenta: 0.015,
  },
} as const;

export interface ResultadoRegimen {
  key: 'RER' | 'RMT' | 'GENERAL';
  nombre: string;
  /** Impuesto a la renta anual estimado en soles; null si no aplica */
  impuestoAnual: number | null;
  /** Pagos a cuenta mensuales estimados; null si es pago definitivo (RER) */
  pagoACuentaMensual: number | null;
  elegible: boolean;
  motivoInelegible?: string;
}

/**
 * Estimación comparativa de impuesto a la renta anual.
 *
 * @param ingresosNetosAnuales  Ventas netas del año (sin IGV)
 * @param gastosDeducibles      Gastos deducibles del año (sin IGV)
 *
 * El RER grava INGRESOS (1.5%, definitivo); RMT y General gravan
 * UTILIDAD (renta neta) con regularización contra pagos a cuenta.
 */
export function compararRegimenes(ingresosNetosAnuales: number, gastosDeducibles: number): ResultadoRegimen[] {
  const ingresos = Math.max(0, ingresosNetosAnuales);
  const gastos = Math.max(0, Math.min(gastosDeducibles, ingresos)); // sin utilidad negativa
  const rentaNeta = ingresos - gastos;

  // --- RER: 1.5% de ingresos, definitivo ---
  const rerElegible = ingresos <= REGIMENES.RER.limiteIngresos;
  const rerAnual = ingresos * REGIMENES.RER.tasaIngresos;

  // --- RMT: 10% hasta 15 UIT + 29.5% exceso, con pagos a cuenta ---
  const rmtElegible = ingresos <= REGIMENES.RMT.limiteIngresos;
  const { RMT } = REGIMENES;
  const rmtAnual =
    rentaNeta <= RMT.rentaTasaReducida
      ? rentaNeta * RMT.tasaHasta15UIT
      : RMT.rentaTasaReducida * RMT.tasaHasta15UIT + (rentaNeta - RMT.rentaTasaReducida) * RMT.tasaExceso;
  const rmtPacMensual =
    ingresos <= RMT.pagoACuentaTope
      ? (ingresos / 12) * RMT.pagoACuentaTopeTasa
      : (RMT.pagoACuentaTope / 12) * RMT.pagoACuentaTopeTasa + ((ingresos - RMT.pagoACuentaTope) / 12) * RMT.pagoACuentaExtraTasa;

  // --- General: 29.5% de la renta neta, pagos a cuenta 1.5% ---
  const genAnual = rentaNeta * REGIMENES.GENERAL.tasa;
  const genPacMensual = (ingresos / 12) * REGIMENES.GENERAL.pagoACuenta;

  return [
    {
      key: 'RER',
      nombre: REGIMENES.RER.nombre,
      impuestoAnual: rerElegible ? rerAnual : null,
      pagoACuentaMensual: null,
      elegible: rerElegible,
      motivoInelegible: rerElegible ? undefined : `Supera el límite de S/ 525,000 de ingresos anuales.`,
    },
    {
      key: 'RMT',
      nombre: REGIMENES.RMT.nombre,
      impuestoAnual: rmtElegible ? rmtAnual : null,
      pagoACuentaMensual: rmtElegible ? rmtPacMensual : null,
      elegible: rmtElegible,
      motivoInelegible: rmtElegible ? undefined : 'Supera 1,700 UIT de ingresos anuales (S/ 9,350,000).',
    },
    {
      key: 'GENERAL',
      nombre: REGIMENES.GENERAL.nombre,
      impuestoAnual: genAnual,
      pagoACuentaMensual: genPacMensual,
      elegible: true,
    },
  ];
}

/** S/ con separador de miles peruano y 2 decimales */
export function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
