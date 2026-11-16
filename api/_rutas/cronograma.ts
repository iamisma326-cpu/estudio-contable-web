/**
 * Serverless (Vercel): cronograma de obligaciones mensuales SUNAT.
 *
 * El fetch y el parseo viven en `api/_lib/sunat-cronogramas.ts` porque el
 * detector de noticias necesita exactamente el mismo resultado normalizado
 * para comparar hashes. Aquí solo se sirve HTTP.
 *
 * CORS no aplica (servidor a servidor) y el CDN cachea 24 h: la página de
 * SUNAT cambia a lo sumo unas veces al año.
 */

import { obtenerCronogramaMensual } from '../_lib/sunat-cronogramas.js';

interface ReqLike {
  method?: string;
}
interface ResLike {
  setHeader(key: string, value: string): ResLike;
  status(code: number): ResLike;
  json(body: unknown): ResLike;
  end(body?: string): ResLike;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

  const data = await obtenerCronogramaMensual();
  res.status(200).json(data);
}
