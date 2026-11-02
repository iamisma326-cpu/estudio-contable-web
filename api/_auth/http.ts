/**
 * Utilidades HTTP compartidas por los handlers de /api/*.
 * (Sin estado de sesión: la identidad la resuelve Neon Auth, ver guard.ts.)
 */

export interface ReqLike {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

export interface ResLike {
  setHeader(key: string, value: string): ResLike;
  status(code: number): ResLike;
  json(body: unknown): ResLike;
  end(body?: string): ResLike;
}

/** Lee JSON del body en Vercel (bodyParser automático) o devuelve null. */
export async function readJsonBody(req: ReqLike): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    return req.body;
  }
  return null;
}

/**
 * Parámetro de query string. En Vercel llega en req.query; en el middleware
 * de Vite (Connect) queda en req.url, ya sin el prefijo de la ruta montada.
 */
export function queryParam(req: ReqLike, name: string): string | null {
  const fromQuery = req.query?.[name];
  if (typeof fromQuery === 'string') return fromQuery;
  if (Array.isArray(fromQuery) && typeof fromQuery[0] === 'string') return fromQuery[0];

  const url = req.url ?? '';
  const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  if (!qs) return null;
  return new URLSearchParams(qs).get(name);
}

export function clientIp(req: ReqLike): string | null {
  const raw = req.headers?.['x-forwarded-for'] ?? req.headers?.['x-real-ip'];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const ip = value.split(',')[0]?.trim();
  return ip ? ip.slice(0, 64) : null;
}

/** CORS + preflight. La sesión viaja en Authorization, no en cookies. */
export function applyCors(req: ReqLike, res: ResLike, methods: string): void {
  const origin = req.headers?.['origin'];
  res.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
}

/** Corta el handler con 405 si el método no es el esperado. */
export function methodNotAllowed(res: ResLike): void {
  res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
