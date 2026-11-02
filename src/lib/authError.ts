/**
 * Traduce errores del cliente de Better Auth a mensajes para el usuario.
 *
 * El cliente puede devolver `{ error }` o lanzar una excepción con el mismo
 * contenido según el endpoint (el 401 de sign-in se lanza). Si solo se mira
 * `error`, un 401 cae en el catch y se muestra "Error de red", que es falso:
 * la red funcionó y lo que falló fue la credencial.
 */

interface AuthErrorLike {
  status?: number;
  code?: string;
  message?: string;
  body?: { code?: string; message?: string };
}

export const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Usuario o contraseña incorrectos.',
  INVALID_PASSWORD: 'Usuario o contraseña incorrectos.',
  USER_NOT_FOUND: 'Usuario o contraseña incorrectos.',
  INVALID_TOKEN: 'El enlace no es válido o ya expiró. Pide uno nuevo.',
  PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 8 caracteres.',
  PASSWORD_TOO_LONG: 'La contraseña es demasiado larga.',
  INVALID_EMAIL: 'El correo no es válido.',
  USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  EMAIL_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  BANNED_USER: 'Tu cuenta está suspendida. Escríbenos para revisarlo.',
  USER_BANNED: 'Tu cuenta está suspendida. Escríbenos para revisarlo.',
  EMAIL_NOT_VERIFIED: 'Debes verificar tu correo antes de entrar.',
};

export interface AuthErrorInfo {
  status?: number;
  code: string;
  message: string;
}

export function authErrorInfo(err: unknown): AuthErrorInfo {
  const e = (err ?? {}) as AuthErrorLike;
  return {
    status: typeof e.status === 'number' ? e.status : undefined,
    code: e.code ?? e.body?.code ?? '',
    message: e.message ?? e.body?.message ?? '',
  };
}

/**
 * Mensaje accionable o null si no reconocemos el caso (el llamador decide).
 * `fallbackForNetwork` distingue un fallo real de red (sin status) del resto.
 */
export function authErrorMessage(err: unknown): string | null {
  const { status, code } = authErrorInfo(err);

  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];

  if (status === 401) return AUTH_MESSAGES.INVALID_EMAIL_OR_PASSWORD;
  if (status === 403) return AUTH_MESSAGES.BANNED_USER;
  if (status === 429) return 'Demasiados intentos seguidos. Espera unos minutos.';
  if (status === 400) return 'Los datos enviados no son válidos.';
  if (status !== undefined && status >= 500) {
    return 'El servicio de acceso no responde. Inténtalo en un momento.';
  }
  return null;
}

/** true si no hubo respuesta HTTP (red caída, CORS, dominio no confiable). */
export function isNetworkError(err: unknown): boolean {
  return authErrorInfo(err).status === undefined;
}
