/**
 * fetch contra nuestra API (/api/*) con el JWT de Neon Auth.
 *
 * Los endpoints serverless no comparten cookies con el host de auth, así que
 * la identidad viaja como `Authorization: Bearer`. El token dura 15 min: se
 * cachea en memoria hasta un minuto antes de expirar para no pedir uno nuevo
 * en cada request.
 */

import { AUTH_URL, authClient } from './auth';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cache: CachedToken | null = null;

function jwtExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(normalized)) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Invalida el token cacheado (logout, cambio de cuenta, 401). */
export function clearTokenCache(): void {
  cache = null;
}

/**
 * `token()` lo aporta el plugin JWT de Better Auth. El wrapper tipa el cliente
 * como ReactAuthClient genérico, así que el método no aparece en los tipos
 * (sí existe en runtime; verificado contra el branch).
 */
interface TokenCapableClient {
  token: () => Promise<{ data?: { token?: string } | null } | null>;
}

/**
 * Fallback: pide el JWT directamente al endpoint del branch usando la cookie
 * de sesión. El SDK puede devolver null si aún no hidrató su store (p. ej.
 * recarga directa en una ruta privada).
 */
async function fetchTokenFromAuthServer(): Promise<string | null> {
  if (!AUTH_URL) return null;
  try {
    const res = await fetch(`${AUTH_URL}/token`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: unknown };
    return typeof data.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}

export async function getAuthToken(force = false): Promise<string | null> {
  if (!force && cache && cache.expiresAt - 60_000 > Date.now()) return cache.token;

  let token: string | null = null;
  try {
    const result = await (authClient as unknown as TokenCapableClient).token();
    token = result?.data?.token ?? null;
  } catch {
    token = null;
  }

  if (!token) token = await fetchTokenFromAuthServer();

  if (!token) {
    cache = null;
    return null;
  }
  cache = { token, expiresAt: jwtExpiry(token) };
  return token;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

async function request<T>(
  path: string,
  init: RequestInit | undefined,
  retry: boolean
): Promise<ApiResult<T>> {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => null)) as T | null;

  // Token vencido entre el chequeo y el request: se renueva una vez.
  if (res.status === 401 && retry) {
    clearTokenCache();
    await getAuthToken(true);
    return request<T>(path, init, false);
  }
  return { ok: res.ok, status: res.status, data };
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'GET' }, true);
}

export function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<ApiResult<T>> {
  return request<T>(
    path,
    { method, body: body === undefined ? undefined : JSON.stringify(body) },
    true
  );
}
