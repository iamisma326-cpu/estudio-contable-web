/**
 * Guard de rutas privadas.
 *
 * - Sin sesión → /login (guardando a dónde iba el usuario).
 * - Sesión suspendida → pantalla de aviso, sin datos.
 * - adminOnly y rol != admin → /recursos.
 *
 * El guard del cliente es UX, no seguridad: cada endpoint de /api valida el
 * JWT y el rol por su cuenta.
 */

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

function LoadingScreen() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="page-loaderDot" aria-hidden="true" />
      <span>Verificando sesión…</span>
    </div>
  );
}

function SuspendedNotice() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 460 }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 12 }}>Cuenta suspendida</h1>
        <p style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Tu acceso está desactivado temporalmente. Escríbenos a
          contacto@sanchezdelgado.pe para revisar el caso.
        </p>
      </div>
    </main>
  );
}

export default function RouteGuard({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { loading, authUser, me, denied, isAdmin } = useSession();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (denied) return <SuspendedNotice />;

  if (!authUser || !me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/recursos" replace />;
  }

  return <>{children}</>;
}
