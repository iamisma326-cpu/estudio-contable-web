/**
 * Sesión de la intranet.
 *
 * Dos capas:
 *   1. Better Auth (`authClient.useSession`) → ¿hay sesión? ¿quién es?
 *   2. Nuestra API (`/api/auth/me`)          → rol de aplicación y perfil.
 *
 * El rol NO se lee del usuario de Better Auth de forma optimista: /api/auth/me
 * devuelve la fila autoritativa de la base de datos (así una cuenta suspendida
 * deja de tener acceso aunque su JWT siga vigente).
 */

import { useCallback, useEffect, useState } from 'react';
import { authClient } from '../lib/auth';
import { apiGet, clearTokenCache } from '../lib/api';

export interface Profile {
  empresa: string | null;
  ruc: string | null;
  telefono: string | null;
  notas: string | null;
  created_at: string;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  banned: boolean;
  profile: Profile | null;
}

interface SessionState {
  /** true mientras se resuelve la sesión de auth o el rol. */
  loading: boolean;
  /** Usuario de Better Auth (sin rol de aplicación). */
  authUser: { id: string; email: string; name: string } | null;
  /** Usuario con rol y perfil según la API. null si no autenticado. */
  me: Me | null;
  /** La API rechazó la sesión por cuenta suspendida (403). */
  denied: boolean;
  isAdmin: boolean;
  refresh: () => void;
  signOut: () => Promise<void>;
}

/**
 * Cache breve de /api/auth/me.
 * El guard y varias vistas montan useSession a la vez; sin esto se piden los
 * mismos datos 3-4 veces por navegación.
 */
let meCache: { id: string; at: number; me: Me | null; denied: boolean } | null = null;
const ME_TTL_MS = 10_000;

export function useSession(): SessionState {
  const session = authClient.useSession();
  const authUser = session?.data?.user ?? null;

  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState(false);
  // Id del usuario cuyo /api/auth/me ya se resolvió. Sin esto, el guard ve
  // `me === null` mientras la petición está en vuelo y redirige a /login
  // en bucle.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    meCache = null;
    setTick((n) => n + 1);
  }, []);

  // Dependencia por id: el objeto de sesión es una referencia nueva en cada
  // render y usarlo como dependencia dispara un bucle de /api/auth/me.
  const authUserId = authUser?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    if (!authUserId) {
      setMe(null);
      setDenied(false);
      setResolvedFor(null);
      return;
    }

    const cached = meCache && meCache.id === authUserId && Date.now() - meCache.at < ME_TTL_MS ? meCache : null;
    if (cached) {
      setMe(cached.me);
      setDenied(cached.denied);
      setResolvedFor(authUserId);
      return;
    }

    (async () => {
      const res = await apiGet<{ ok: boolean; user: Me }>('/api/auth/me');
      if (cancelled) return;
      if (res.ok && res.data?.user) {
        setMe(res.data.user);
        setDenied(false);
      } else {
        // 403 = suspendida; 401 = sesión inválida o cuenta borrada. En ambos
        // casos no hay acceso, pero el mensaje al usuario es distinto.
        setMe(null);
        setDenied(res.status === 403);
      }
      meCache = {
        id: authUserId,
        at: Date.now(),
        me: res.ok && res.data?.user ? res.data.user : null,
        denied: res.status === 403,
      };
      setResolvedFor(authUserId);
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, tick]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    clearTokenCache();
    setMe(null);
    setResolvedFor(null);
    meCache = null;
  }, []);

  const authenticated = Boolean(authUser) && Boolean(me) && resolvedFor === authUserId;
  const resolving = Boolean(authUserId) && resolvedFor !== authUserId;

  return {
    loading: Boolean(session?.isPending) || resolving,
    authUser,
    me: authenticated ? me : null,
    denied,
    isAdmin: me?.role === 'admin',
    refresh,
    signOut,
  };
}
