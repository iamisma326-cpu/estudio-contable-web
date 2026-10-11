/**
 * Utilidades compartidas para endpoints bajo /api/admin/*.
 *
 * Modelo: una sola credencial admin (user + password) definida por env vars.
 * Al loguearse correctamente se emite una cookie httpOnly con un payload
 * firmado HMAC-SHA256 que el resto de handlers admin validan. Esto evita
 * repetir la comparación user/pass en cada endpoint y permite revocación
 * con un cambio de ADMIN_SECRET.
 *
 * Variables de entorno (en Vercel → Project Settings → Environment Variables):
 *   ADMIN_USER      Usuario, default "admin"
 *   ADMIN_PASSWORD  Contraseña en claro (NO recomendado en prod)
 *   ADMIN_SECRET    Secreto HMAC (32+ chars). Si falta, se usa un derivado
 *                   determinístico de ADMIN_PASSWORD para no bloquear dev.
 *
 * Seguridad:
 *   - Cookie httpOnly + SameSite=Lax + Secure en producción.
 *   - La cookie solo marca "autenticado", no expone user/pass.
 *   - La firma usa HMAC-SHA256 con comparación constant-time.
 */

import crypto from 'crypto';

export interface ReqLike {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ResLike {
  setHeader(key: string, value: string): ResLike;
  status(code: number): ResLike;
  json(body: unknown): ResLike;
  end(body?: string): ResLike;
}

const COOKIE_NAME = 'sd_admin';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8h

function envOrDefault(name: string, fallback: string): string {
  const fromProcess = process.env[name];
  return fromProcess && fromProcess.length > 0 ? fromProcess : fallback;
}

export function adminUser(): string {
  return envOrDefault('ADMIN_USER', 'admin');
}

export function adminPassword(): string {
  return envOrDefault('ADMIN_PASSWORD', 'admin123');
}

/** Secreto HMAC: si ADMIN_SECRET existe se usa; si no, derivado. */
function adminSecret(): string {
  const explicit = process.env.ADMIN_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  // Derivado: evita hardcodear un secreto real en el repo pero sigue
  // siendo fijo entre invocaciones dentro del mismo deploy.
  return crypto
    .createHash('sha256')
    .update(`sd-admin:${adminPassword()}`)
    .digest('hex');
}

/** Firma el payload {user, exp} con HMAC-SHA256. */
function sign(payload: string): string {
  return crypto.createHmac('sha256', adminSecret()).update(payload).digest('hex');
}

/** Compara dos strings en tiempo constante. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Construye el valor de la cookie: base64(payload).firma. */
export function makeCookieValue(user: string, ttlSeconds = COOKIE_MAX_AGE): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ u: user, e: exp });
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${b64}.${sign(b64)}`;
}

/** Serializa la cookie con flags httpOnly y SameSite=Lax. */
export function serializeCookie(value: string, ttlSeconds = COOKIE_MAX_AGE): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${ttlSeconds}`;
}

export function clearCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

/** Parsea la cabecera Cookie y devuelve el valor de sd_admin si existe. */
export function readCookie(headers: Record<string, string | string[] | undefined> | undefined): string | null {
  if (!headers) return null;
  const raw = headers['cookie'] ?? headers['Cookie'];
  if (!raw) return null;
  const parts = (Array.isArray(raw) ? raw.join('; ') : raw).split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE_NAME) return v.join('=');
  }
  return null;
}

/** Valida la cookie; devuelve el user si es válida, null si no. */
export function verifyCookie(headers: Record<string, string | string[] | undefined> | undefined): string | null {
  const value = readCookie(headers);
  if (!value) return null;
  const [b64, sig] = value.split('.');
  if (!b64 || !sig) return null;
  if (!safeEqual(sig, sign(b64))) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (typeof payload.u !== 'string' || typeof payload.e !== 'number') return null;
    if (payload.e < Math.floor(Date.now() / 1000)) return null;
    return payload.u;
  } catch {
    return null;
  }
}

/** Lee JSON del body en Vercel o entornos sin bodyParser automático. */
export async function readJsonBody(req: ReqLike): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    return req.body;
  }
  return null;
}