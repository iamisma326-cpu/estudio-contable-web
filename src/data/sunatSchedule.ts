/**
 * Cronograma de obligaciones mensuales SUNAT — ejercicio 2026.
 *
 * Fuente oficial (verificado 28/09/2026):
 *   https://www.sunat.gob.pe/orientacion/cronogramas/2026/cObligacionMensual2026.html
 * Base legal: Anexo I — Resolución de Superintendencia N° 281-2022/SUNAT.
 *
 * Cubre la declaración mensual (PDT 621 / Formulario Virtual), ITF,
 * planilla electrónica (PLAME) y los registros de compras/ventas
 * electrónicos (SIRE/PLE): SUNAT agrupa todas las obligaciones
 * mensuales bajo el mismo cronograma por dígito de RUC.
 *
 * Estructura de cada mes:
 *   [0] dígito 0 · [1] dígito 1 · [2] dígitos 2 y 3 · [3] dígitos 4 y 5
 *   [4] dígitos 6 y 7 · [5] dígitos 8 y 9 · [6] Buenos Contribuyentes y UESP
 *
 * Las fechas del ejercicio 2026 vencen entre febrero de 2026 y enero de
 * 2027; "Dic" es la única fila que cruza de año, por eso cada entrada
 * lleva su propio año.
 */

export interface MonthRow {
  /** Mes del período tributario, 0 = enero */
  month: number;
  /** Año del período tributario (2026) */
  year: number;
  /** Fechas de vencimiento por grupo de dígito (índice 0-6, ver tabla) */
  deadlines: [number, number, number, number, number, number, number];
}

/** Grupos de dígito tal como los publica SUNAT (índice de `deadlines`) */
export const DIGIT_GROUPS: Array<{ label: string; digits: string[] }> = [
  { label: '0', digits: ['0'] },
  { label: '1', digits: ['1'] },
  { label: '2 y 3', digits: ['2', '3'] },
  { label: '4 y 5', digits: ['4', '5'] },
  { label: '6 y 7', digits: ['6', '7'] },
  { label: '8 y 9', digits: ['8', '9'] },
];

/** Índice del grupo "Buenos Contribuyentes y UESP" dentro de una fila */
export const GOOD_TAXPAYER_INDEX = 6;

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

/** ITF y declaración mensual — períodos tributarios del ejercicio 2026 */
export const MONTHLY_SCHEDULE_2026: MonthRow[] = [
  //            0        1        2y3      4y5      6y7      8y9      BC/UESP
  { month: 0,  year: 2026, deadlines: [16, 17, 18, 19, 20, 23, 24] },   // vence feb 2026
  { month: 1,  year: 2026, deadlines: [16, 17, 18, 19, 20, 23, 24] },   // vence mar 2026
  { month: 2,  year: 2026, deadlines: [17, 20, 21, 22, 23, 24, 27] },   // vence abr 2026
  { month: 3,  year: 2026, deadlines: [18, 19, 20, 21, 22, 25, 26] },   // vence may 2026
  { month: 4,  year: 2026, deadlines: [15, 16, 17, 18, 19, 22, 23] },   // vence jun 2026
  { month: 5,  year: 2026, deadlines: [15, 16, 17, 20, 21, 22, 24] },   // vence jul 2026
  { month: 6,  year: 2026, deadlines: [18, 19, 20, 21, 24, 25, 26] },   // vence ago 2026
  { month: 7,  year: 2026, deadlines: [15, 16, 17, 18, 21, 22, 23] },   // vence set 2026
  { month: 8,  year: 2026, deadlines: [16, 19, 20, 21, 22, 23, 26] },   // vence oct 2026
  { month: 9,  year: 2026, deadlines: [16, 17, 18, 19, 20, 23, 24] },   // vence nov 2026
  { month: 10, year: 2026, deadlines: [17, 18, 21, 22, 23, 24, 28] },   // vence dic 2026
  { month: 11, year: 2026, deadlines: [18, 19, 20, 21, 22, 25, 26] },   // vence ene 2027
];

/** Mes (0-11) en que vence cada período tributario del ejercicio 2026 */
const PAYMENT_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];

/** Año en que vence cada período (dic-2026 vence en enero 2027) */
const PAYMENT_YEAR = [2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2026, 2027];

/** Grupo de dígito (0-5) o Buenos Contribuyentes (6) para un último dígito de RUC */
export function digitGroupIndex(lastDigit: number): number {
  if (lastDigit === 0) return 0;
  if (lastDigit === 1) return 1;
  return Math.floor((lastDigit + 2) / 2); // 2-3 -> 2, 4-5 -> 3, 6-7 -> 4, 8-9 -> 5
}

/** Índice de columna del cronograma para un último dígito (0-9) o BC (usa 10) */
export function columnIndex(lastDigit: number): number {
  return lastDigit === 10 ? GOOD_TAXPAYER_INDEX : digitGroupIndex(lastDigit);
}

export interface UpcomingDeadline {
  /** Período tributario en texto, ej. "Setiembre 2026" */
  periodLabel: string;
  /** Fecha de vencimiento del período, en hora local de Lima (UTC-5) */
  dueDate: Date;
  /** Días naturales restantes (negativo = ya venció) */
  daysLeft: number;
}

/** "Hoy" en Lima (UTC-5), sin hora — para que el contador no baile por la zona del visitante */
export function todayInLima(): Date {
  const now = new Date();
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return new Date(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate());
}

/** Diferencia en días naturales entre dos fechas sin hora (b-a) */
function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

/**
 * Próximos vencimientos (pendientes, ordenados) para un último dígito
 * de RUC o Buenos Contribuyentes (lastDigit = 10).
 *
 * Devuelve máximo 3: el mes en curso/entrante y los dos siguientes.
 */
export function upcomingDeadlines(lastDigit: number, limit = 3): UpcomingDeadline[] {
  const col = columnIndex(lastDigit);
  const today = todayInLima();

  const upcoming = MONTHLY_SCHEDULE_2026.flatMap((row) => {
    const payMonth = PAYMENT_MONTH[row.month];
    const payYear = PAYMENT_YEAR[row.month];
    const dueDate = new Date(payYear, payMonth, row.deadlines[col]);
    const daysLeft = daysBetween(today, dueDate);
    if (daysLeft < 0) return [];
    return [{ periodLabel: `${MONTH_NAMES[row.month]} ${row.year}`, dueDate, daysLeft }];
  });

  return upcoming.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, limit);
}

/** Fecha de vencimiento de un período tributario dado para un dígito */
export function deadlineFor(periodMonth: number, lastDigit: number): Date {
  const row = MONTHLY_SCHEDULE_2026[periodMonth];
  if (!row) throw new Error(`Mes de período inválido: ${periodMonth}`);
  return new Date(PAYMENT_YEAR[row.month], PAYMENT_MONTH[row.month], row.deadlines[columnIndex(lastDigit)]);
}

/** Mes (0-11) y año en que vence un período tributario del ejercicio 2026 */
export function paymentInfo(periodMonth: number): { month: number; year: number } {
  const row = MONTHLY_SCHEDULE_2026[periodMonth];
  if (!row) throw new Error(`Mes de período inválido: ${periodMonth}`);
  return { month: PAYMENT_MONTH[row.month], year: PAYMENT_YEAR[row.month] };
}

/** Formato largo peruano: "27 de abril de 2026" */
export function formatLongDate(date: Date): string {
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()].toLowerCase()} de ${date.getFullYear()}`;
}

/* ============================================================
   DECLARACIÓN ANUAL DE RENTA — ejercicio 2025 (vence en 2026)
   Fuente: RS 386-2025/SUNAT — verificada 28/09/2026.
   A diferencia del cronograma mensual, aquí cada dígito tiene SU
   propia fecha (sin grupos 2y3/4y5…). Índice 10 = Buenos
   Contribuyentes y sujetos no obligados a inscribirse en el RUC.
   ============================================================ */

/** Cronograma General: empresas fuera del alcance de la Ley N° 31940 */
export const RENTA_GENERAL_2025: Date[] = [
  new Date(2026, 2, 26), // dígito 0
  new Date(2026, 2, 27), // 1
  new Date(2026, 2, 30), // 2
  new Date(2026, 2, 31), // 3
  new Date(2026, 3, 1),  // 4
  new Date(2026, 3, 6),  // 5
  new Date(2026, 3, 7),  // 6
  new Date(2026, 3, 8),  // 7
  new Date(2026, 3, 9),  // 8
  new Date(2026, 3, 10), // 9
  new Date(2026, 3, 13), // Buenos Contribuyentes
];

/** Cronograma Ampliado: personas naturales y MYPE (Ley N° 31940, ingresos 2024 ≤ 1,700 UIT) */
export const RENTA_AMPLIADO_2025: Date[] = [
  new Date(2026, 4, 27), // dígito 0
  new Date(2026, 4, 28), // 1
  new Date(2026, 4, 29), // 2
  new Date(2026, 5, 1),  // 3
  new Date(2026, 5, 2),  // 4
  new Date(2026, 5, 3),  // 5
  new Date(2026, 5, 4),  // 6
  new Date(2026, 5, 5),  // 7
  new Date(2026, 5, 8),  // 8
  new Date(2026, 5, 9),  // 9
  new Date(2026, 5, 10), // Buenos Contribuyentes
];

export interface RentaAnual {
  /** Fecha del cronograma General para el dígito */
  general: Date;
  /** Fecha del cronograma Ampliado (Ley 31940) para el dígito */
  ampliado: Date;
}

/** Fechas de la DJ Anual de Renta 2025 para un último dígito (0-9) o BC (10) */
export function rentaAnual(lastDigit: number): RentaAnual {
  const i = lastDigit === 10 ? 10 : lastDigit % 10;
  return { general: RENTA_GENERAL_2025[i], ampliado: RENTA_AMPLIADO_2025[i] };
}

/** Días naturales hasta una fecha (negativo = ya pasó), medido en Lima */
export function daysUntil(date: Date): number {
  return daysBetween(todayInLima(), date);
}

/** Formato corto: "27 Abr" */
export function formatShortDate(date: Date): string {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** Etiqueta del grupo de un dígito, ej. "8 y 9" o "Buenos Contribuyentes y UESP" */
export function groupLabelFor(lastDigit: number): string {
  if (lastDigit === 10) return 'Buenos Contribuyentes y UESP';
  return DIGIT_GROUPS[digitGroupIndex(lastDigit)].label;
}
