/**
 * Serverless (Vercel): cronograma de obligaciones mensuales SUNAT.
 *
 * Lee y parsea la página oficial en vivo:
 *   https://www.sunat.gob.pe/orientacion/cronogramas/{año}/cObligacionMensual{año}.html
 * El patrón de URL es estable desde ~2016, así que cuando SUNAT publica el
 * ejercicio siguiente (cada diciembre) este endpoint lo sirve solo.
 *
 * Si SUNAT cambia el HTML o falla, responde con el cronograma 2026 embebido
 * (verificado contra la fuente): la página nunca queda sin datos, en el peor
 * caso queda con el ejercicio anterior hasta que se actualice el respaldo.
 *
 * CORS no aplica (servidor a servidor) y el CDN cachea 24 h: la página de
 * SUNAT cambia a lo sumo unas veces al año.
 */

import { MONTHLY_SCHEDULE_2026, todayInLima, type MonthRow } from '../src/data/sunatSchedule.js';

const BASE_URL = 'https://www.sunat.gob.pe/orientacion/cronogramas';
const TIMEOUT_MS = 8000;

/** Tipos mínimos del handler — espejo de api/tipo-cambio.ts */
interface ReqLike {
  method?: string;
}
interface ResLike {
  setHeader(key: string, value: string): ResLike;
  status(code: number): ResLike;
  json(body: unknown): ResLike;
  end(body?: string): ResLike;
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

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

  // Ejercicio vigente = año en curso en Lima. En el arranque de enero, si la
  // página del año nuevo aún no existe, sirve la del año anterior.
  const limaYear = todayInLima().getFullYear();

  for (const year of [limaYear, limaYear - 1]) {
    const html = await fetchExerciseHtml(year);
    if (!html) continue;
    const parsed = parseExercise(html, year);
    if (parsed) {
      res.status(200).json({
        ejercicio: year,
        fuente: 'SUNAT',
        url: `${BASE_URL}/${year}/cObligacionMensual${year}.html`,
        meses: parsed,
      });
      return;
    }
  }

  // Respaldo: cronograma embebido (verificado contra la fuente oficial)
  res.status(200).json({
    ejercicio: 2026,
    fuente: 'respaldo',
    url: `${BASE_URL}/2026/cObligacionMensual2026.html`,
    meses: MONTHLY_SCHEDULE_2026,
  });
}
