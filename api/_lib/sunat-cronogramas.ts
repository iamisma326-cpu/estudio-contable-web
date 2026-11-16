/**
 * Obtención y parseo de los cronogramas de SUNAT.
 *
 * Vive aquí (y no dentro de los handlers) porque lo usan dos consumidores:
 *   1. /api/cronograma y /api/renta-anual, que lo sirven a la web.
 *   2. El detector de noticias, que hashea el RESULTADO YA PARSEADO para
 *      distinguir un cambio real de un simple "última actualización".
 *
 * Si SUNAT cambia el HTML o falla la red, se devuelve el respaldo embebido
 * (verificado contra la fuente). El detector ignora los respaldos a propósito:
 * comparar contra un respaldo no debe generar un borrador.
 */

import {
  MONTHLY_SCHEDULE_2026,
  RENTA_GENERAL_2025,
  RENTA_AMPLIADO_2025,
  RENTA_EJERCICIO_EMBEBIDO,
  todayInLima,
  type MonthRow,
  type RentaRow,
} from '../../src/data/sunatSchedule.js';

const BASE_URL = 'https://www.sunat.gob.pe/orientacion/cronogramas';
const TIMEOUT_MS = 8000;

export interface CronogramaMensual {
  ejercicio: number;
  fuente: 'SUNAT' | 'respaldo';
  url: string;
  meses: MonthRow[];
}

export interface RentaAnualData {
  ejercicio: number;
  fuente: 'SUNAT' | 'respaldo';
  url: string;
  general: RentaRow[];
  ampliado: RentaRow[];
}

/** Abreviaturas de mes tal como las publica SUNAT (Perú usa "Set") */
const MONTH_WORDS: Record<string, number> = {
  Ene: 0, Feb: 1, Mar: 2, Abr: 3, May: 4, Jun: 5,
  Jul: 6, Ago: 7, Set: 8, Sep: 8, Oct: 9, Nov: 10, Dic: 11,
};

/**
 * Parsea el HTML del cronograma de un ejercicio.
 *
 * Estructura verificada (estable desde hace años): filas <tr> con 8 celdas
 * ["Ene-2026", "16 Feb", ..., "24 Feb"] — período + 7 fechas por grupo de
 * dígito (0 | 1 | 2y3 | 4y5 | 6y7 | 8y9 | BC/UESP). Sólo la fila de
 * diciembre lleva año explícito ("18 Ene 2027").
 */
function parseExercise(html: string, year: number): MonthRow[] | null {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const found: MonthRow[] = [];

  for (const tr of rows) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map((c) =>
      c.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    );
    if (cells.length !== 8) continue;

    const period = cells[0].match(/^([A-Z][a-z]{2})-(\d{4})$/);
    if (!period) continue;
    const month = MONTH_WORDS[period[1]];
    if (month === undefined || Number(period[2]) !== year) continue;

    const deadlines: number[] = [];
    let ok = true;
    for (let i = 1; i <= 7; i++) {
      const d = cells[i].match(/^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?$/);
      if (!d) { ok = false; break; }
      const day = Number(d[1]);
      const payMonth = MONTH_WORDS[d[2]];
      // Coherencia: el período `month` vence en el mes siguiente (o en enero del año siguiente)
      if (day < 1 || day > 31 || payMonth !== (month + 1) % 12) { ok = false; break; }
      deadlines.push(day);
    }
    if (!ok) continue;

    found.push({ month, year, deadlines: deadlines as MonthRow['deadlines'] });
  }

  return found.length === 12 ? found : null;
}

async function fetchExerciseHtml(year: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${BASE_URL}/${year}/cObligacionMensual${year}.html`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'sanchezdelgado.pe/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function obtenerCronogramaMensual(): Promise<CronogramaMensual> {
  // Ejercicio vigente = año en curso en Lima. En el arranque de enero, si la
  // página del año nuevo aún no existe, sirve la del año anterior.
  const limaYear = todayInLima().getFullYear();

  for (const year of [limaYear, limaYear - 1]) {
    const html = await fetchExerciseHtml(year);
    if (!html) continue;
    const parsed = parseExercise(html, year);
    if (parsed) {
      return {
        ejercicio: year,
        fuente: 'SUNAT',
        url: `${BASE_URL}/${year}/cObligacionMensual${year}.html`,
        meses: parsed,
      };
    }
  }

  return {
    ejercicio: 2026,
    fuente: 'respaldo',
    url: `${BASE_URL}/2026/cObligacionMensual2026.html`,
    meses: MONTHLY_SCHEDULE_2026,
  };
}

const MONTH_WORDS_RENTA: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, setiembre: 8, septiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

/** Date local → fila serializable */
function fila(f: Date): RentaRow {
  return { anio: f.getFullYear(), mes: f.getMonth(), dia: f.getDate() };
}

/**
 * Parsea la página de renta de un ejercicio.
 *
 * Estructura verificada: pares <tr><td>DÍGITO</td><td>D de MES de AAAA</td></tr>
 * repetidos dos veces — primero el cronograma General (11 filas), luego el
 * Ampliado (11 filas). Los dígitos van 0-9 y "Buenos Contribuyentes…".
 */
function parseRenta(html: string): { general: RentaRow[]; ampliado: RentaRow[] } | null {
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const pairs: RentaRow[] = [];

  for (const tr of rows) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? []).map((c) =>
      c.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    );
    if (cells.length !== 2) continue;

    const digit = cells[0];
    const dateMatch = cells[1].match(/^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i);
    if (!dateMatch) continue;
    if (!/^\d$|^Buenos Contribuyentes/i.test(digit)) continue;

    const mes = MONTH_WORDS_RENTA[dateMatch[2].toLowerCase()];
    const dia = Number(dateMatch[1]);
    const anio = Number(dateMatch[3]);
    if (mes === undefined || dia < 1 || dia > 31) continue;

    pairs.push({ anio, mes, dia });
  }

  if (pairs.length !== 22) return null;
  return { general: pairs.slice(0, 11), ampliado: pairs.slice(11, 22) };
}

async function fetchRentaHtml(ejercicio: number): Promise<string | null> {
  const vence = ejercicio + 1;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${BASE_URL}/${vence}/cRenta${ejercicio}.html`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'sanchezdelgado.pe/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function obtenerRentaAnual(): Promise<RentaAnualData> {
  const anioLima = todayInLima().getFullYear();
  // Ejercicios candidatos: la renta del año anterior ya vence este año
  const candidatos = [anioLima - 1, anioLima - 2];

  for (const ejercicio of candidatos) {
    const html = await fetchRentaHtml(ejercicio);
    if (!html) continue;
    const parsed = parseRenta(html);
    if (!parsed) continue;

    // Sólo sirve lo vivo si es más reciente que el embebido
    if (ejercicio >= RENTA_EJERCICIO_EMBEBIDO) {
      return {
        ejercicio,
        fuente: 'SUNAT',
        url: `${BASE_URL}/${ejercicio + 1}/cRenta${ejercicio}.html`,
        general: parsed.general,
        ampliado: parsed.ampliado,
      };
    }
  }

  return {
    ejercicio: RENTA_EJERCICIO_EMBEBIDO,
    fuente: 'respaldo',
    url: `${BASE_URL}/${RENTA_EJERCICIO_EMBEBIDO + 1}/cRenta${RENTA_EJERCICIO_EMBEBIDO}.html`,
    general: RENTA_GENERAL_2025.map(fila),
    ampliado: RENTA_AMPLIADO_2025.map(fila),
  };
}
