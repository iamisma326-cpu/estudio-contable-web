/**
 * Cliente de Neon Auth (Managed Better Auth).
 *
 * La identidad (registro, login, sesión, logout) la resuelve Better Auth en
 * el servidor de Neon; este cliente solo habla con él.
 *
 * VITE_NEON_AUTH_URL es la URL pública del branch. Es distinta de
 * NEON_AUTH_BASE_URL solo en el nombre: mismo valor, expuesto al bundle
 * porque Vite únicamente inyecta variables con prefijo VITE_.
 */

import { createAuthClient } from '@neon/auth';
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters';

const url = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;

if (!url) {
  // Falla ruidosamente en build/dev en lugar de mandar requests a "" y
  // mostrar "error de red" genérico en el formulario.
  console.error('Falta VITE_NEON_AUTH_URL: el login y el registro no funcionarán.');
}

export const AUTH_URL = url ?? '';

export const authClient = createAuthClient(AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});

/** Email de la cuenta admin: el login acepta el alias "admin". */
export const ADMIN_LOGIN_EMAIL =
  (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ?? 'admin@sanchezdelgado.pe';

/** "admin" → email de la cuenta; un correo se deja intacto. */
export function identifierToEmail(identifier: string): string {
  const value = identifier.trim();
  if (!value) return '';
  if (value.includes('@')) return value.toLowerCase();
  if (value.toLowerCase() === 'admin') return ADMIN_LOGIN_EMAIL;
  return value.toLowerCase();
}
