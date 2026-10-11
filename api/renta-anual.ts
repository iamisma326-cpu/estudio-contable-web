/**
 * Serverless (Vercel): cronogramas de la DJ Anual del Impuesto a la Renta.
 *
 * Lee y parsea la página oficial en vivo:
 *   https://www.sunat.gob.pe/orientacion/cronogramas/{V}/cRenta{E}.html
 * donde V = año de vencimiento y E = ejercicio = V-1 (la renta 2025 se
 * declara en 2026). SUNAT la publica cada diciembre.
 *
 * Estrategia: sondea el ejercicio del año en curso de Lima y el anterior;
 * sirve el MÁS RECIENTE entre lo obtenido en vivo y el embebido (respaldo
 * verificado contra la fuente). Así, cuando SUNAT cuelgue la renta 2026
 * (cRenta2026.html), el endpoint la sirve sin tocar código, y si cambia el
 * HTML, la página no queda con datos viejos disfrazados de nuevos.
 */

import {
  RENTA_GENERAL_2025,
  RENTA_AMPLIADO_2025,
  RENTA_EJERCICIO_EMBEBIDO,
  todayInLima,
  type RentaRow,
} from '../src/data/sunatSchedule.js';

const BASE_URL = 'https://www.sunat.gob.pe/orientacion/cronogramas';
const TIMEOUT_MS = 8000;

interface ReqLike {
  method?: string;
}
interface ResLike {
  setHeader(key: string, value: string): ResLike;
  status(code: number): ResLike;
  json(body: unknown): ResLike;
  end(body?: string): ResLike;
}

interface RentaData {
  ejercicio: number;
  fuente: 'SUNAT' | 'respaldo';
  url: string;
  general: RentaRow[];
  ampliado: RentaRow[];
}

const MONTH_WORDS: Record<string, number> = {
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

    const mes = MONTH_WORDS[dateMatch[2].toLowerCase()];
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

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

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
      res.status(200).json({
        ejercicio,
        fuente: 'SUNAT',
        url: `${BASE_URL}/${ejercicio + 1}/cRenta${ejercicio}.html`,
        general: parsed.general,
        ampliado: parsed.ampliado,
      } satisfies RentaData);
      return;
    }
  }

  // Respaldo embebido (verificado contra la fuente oficial)
  res.status(200).json({
    ejercicio: RENTA_EJERCICIO_EMBEBIDO,
    fuente: 'respaldo',
    url: `${BASE_URL}/${RENTA_EJERCICIO_EMBEBIDO + 1}/cRenta${RENTA_EJERCICIO_EMBEBIDO}.html`,
    general: RENTA_GENERAL_2025.map(fila),
    ampliado: RENTA_AMPLIADO_2025.map(fila),
  } satisfies RentaData);
}
