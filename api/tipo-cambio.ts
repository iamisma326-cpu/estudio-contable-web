/**
 * Serverless (Vercel): tipo de cambio referencial SUNAT USD → PEN.
 *
 * SUNAT publica el dato en un .txt plano, pero con CORS cerrado:
 * https://www.sunat.gob.pe/a/txt/tipoCambio.txt → "28/09/2026|3.416|3.425|"
 * Este endpoint lo lee desde el servidor, devuelve JSON con CORS abierto
 * y un TTL de CDN de 1 hora (s-maxage) — SUNAT actualiza una vez al día,
 * así que 3600s sobra y protege el origen.
 *
 * En desarrollo, la misma lógica corre como middleware de Vite
 * (vite.config.ts) para que /api/tipo-cambio exista también en `npm run dev`.
 */

const SUNAT_URL = 'https://www.sunat.gob.pe/a/txt/tipoCambio.txt';
const TIMEOUT_MS = 6000;

/** Tipos mínimos del handler — evita depender de @vercel/node */
interface ReqLike {
  method?: string;
}
interface ResLike {
  setHeader(key: string, value: string): ResLike;
  status(code: number): ResLike;
  json(body: unknown): ResLike;
  end(body?: string): ResLike;
}

interface TipoCambio {
  /** Fecha de la cotización en ISO (YYYY-MM-DD) */
  fecha: string;
  /** Precio de compra en soles por dólar */
  compra: number;
  /** Precio de venta en soles por dólar */
  venta: number;
  fuente: 'SUNAT';
}

/** Lee y transforma el .txt de SUNAT; lanza si el formato no es el esperado */
async function fetchSunat(): Promise<TipoCambio> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(SUNAT_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'sanchezdelgado.pe/1.0' },
    });
    if (!res.ok) throw new Error(`SUNAT respondió ${res.status}`);

    const text = await res.text();
    const parts = text.trim().split('|');
    if (parts.length < 3) throw new Error('Formato de respuesta inesperado');

    const [dia, mes, anio] = parts[0].split('/');
    const compra = Number(parts[1]);
    const venta = Number(parts[2]);
    if (!/^\d{2}$/.test(dia) || !/^\d{2}$/.test(mes) || !Number.isFinite(compra) || !Number.isFinite(venta)) {
      throw new Error('Valores de tipo de cambio inválidos');
    }

    return { fecha: `${anio}-${mes}-${dia}`, compra, venta, fuente: 'SUNAT' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  try {
    const data = await fetchSunat();
    res.status(200).json(data);
  } catch {
    // 502: el CDN no cachea errores y el widget muestra su estado de respaldo
    res.status(502).json({ error: 'No se pudo obtener el tipo de cambio de SUNAT.' });
  }
}
