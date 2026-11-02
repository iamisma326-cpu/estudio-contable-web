/**
 * LoginPage — acceso único para clientes y administración.
 *
 * La identidad la valida Neon Auth (`authClient.signIn.email`). El campo
 * acepta correo o el alias "admin"; el alias se traduce al email de la
 * cuenta admin antes de llamar al proveedor (Better Auth solo autentica por
 * email).
 *
 * Tras el login se consulta /api/auth/me para conocer el rol de aplicación y
 * decidir el destino: /admin para administración, /recursos para clientes.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { authClient, identifierToEmail } from '../lib/auth';
import { apiGet, clearTokenCache } from '../lib/api';
import styles from '../styles/LoginPage.module.css';

interface LocationState {
  from?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Usuario o contraseña incorrectos.',
  INVALID_PASSWORD: 'Usuario o contraseña incorrectos.',
  USER_NOT_FOUND: 'Usuario o contraseña incorrectos.',
  BANNED_USER: 'Tu cuenta está suspendida. Escríbenos para revisarlo.',
  USER_BANNED: 'Tu cuenta está suspendida. Escríbenos para revisarlo.',
  EMAIL_NOT_VERIFIED: 'Debes verificar tu correo antes de entrar.',
};

export default function LoginPage() {
  useSEO({
    title: 'Acceso | Sánchez Delgado & Asociados',
    description: 'Acceso al área privada de recursos y al panel administrativo.',
    canonical: 'https://sanchezdelgado.pe/login',
    breadcrumb: [{ name: 'Acceso', path: '/login' }],
    noindex: true,
  });

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión, no tiene sentido mostrar el formulario.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await authClient.getSession();
      if (cancelled || !session?.data?.user) return;
      const me = await apiGet<{ user: { role: string } }>('/api/auth/me');
      if (cancelled) return;
      if (me.ok) navigate(me.data?.user.role === 'admin' ? '/admin' : '/recursos', { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const email = identifierToEmail(identifier);
    if (!email || !password) {
      setError('Completa usuario y contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await authClient.signIn.email({ email, password });

      if (authError) {
        const code = String(authError.code ?? '');
        setError(
          ERROR_MESSAGES[code] ??
            (authError.status === 403
              ? 'Tu cuenta está suspendida. Escríbenos para revisarlo.'
              : 'No se pudo iniciar sesión. Inténtalo de nuevo.')
        );
        return;
      }

      // Nueva sesión → el JWT cacheado de un login anterior ya no sirve.
      clearTokenCache();
      const me = await apiGet<{ user: { role: string } }>('/api/auth/me');
      const isAdmin = me.data?.user.role === 'admin';

      if (me.status === 403) {
        setError(ERROR_MESSAGES.BANNED_USER);
        await authClient.signOut();
        return;
      }

      const destination = from && !(isAdmin && from === '/recursos') ? from : isAdmin ? '/admin' : '/recursos';
      navigate(destination, { replace: true });
    } catch {
      setError('Error de red. Comprueba tu conexión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.card}>
        <Link to="/" className={styles.brand} aria-label="Volver al inicio">
          Sánchez Delgado <em>&amp;</em> Asociados
        </Link>
        <span className={styles.eyebrow}>Área privada</span>
        <h1 className={styles.title}>Iniciar sesión</h1>
        <p className={styles.lead}>
          Accede a las herramientas contables y, si eres del equipo, al panel de
          administración.
        </p>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>Usuario o correo</span>
            <input
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              disabled={submitting}
              className={styles.input}
              placeholder="tucorreo@empresa.pe"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              className={styles.input}
            />
          </label>

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className={styles.submit}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className={styles.switch}>
          ¿Aún no tienes cuenta? <Link to="/registro">Crear una cuenta</Link>
        </p>
        <p className={styles.switch}>
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
        </p>

        <Link to="/" className={styles.back}>
          ← Volver al sitio
        </Link>
      </div>
    </section>
  );
}
