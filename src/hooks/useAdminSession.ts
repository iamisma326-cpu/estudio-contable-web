/**
 * Hook que consulta /api/admin/session.
 *
 * Estados:
 *   - loading: true durante el fetch inicial
 *   - authenticated: true si hay cookie válida
 *   - error: mensaje si falló distinto a 401
 *
 * Uso: el guard de la ruta /admin.
 */

import { useEffect, useState } from 'react';

interface SessionState {
  loading: boolean;
  authenticated: boolean;
  user: string | null;
}

export function useAdminSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true,
    authenticated: false,
    user: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/session', { credentials: 'include' });
        if (cancelled) return;
        if (res.ok) {
          const data: { user: string } = await res.json();
          setState({ loading: false, authenticated: true, user: data.user });
        } else {
          setState({ loading: false, authenticated: false, user: null });
        }
      } catch {
        if (cancelled) return;
        setState({ loading: false, authenticated: false, user: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}