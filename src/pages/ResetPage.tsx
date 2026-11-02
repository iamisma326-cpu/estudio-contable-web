/**
 * ResetPage — define la contraseña nueva con el token del correo.
 *
 * El token llega como ?token=… en la URL de retorno que configuramos en
 * /recuperar. Better Auth lo valida y lo consume al guardar.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { authClient } from '../lib/auth';
import { clearTokenCache } from '../lib/api';
import styles from '../styles/LoginPage.module.css';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: 'El enlace no es válido o ya expiró. Pide uno nuevo.',
  PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 8 caracteres.',
};

export default function ResetPage() {
  useSEO({
    title: 'Nueva contraseña | Sánchez Delgado & Asociados',
    description: 'Define una nueva contraseña para tu cuenta.',
    noindex: true,
  });

  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await authClient.resetPassword({ newPassword: password, token });
      if (authError) {
        const code = String(authError.code ?? '');
        setError(ERROR_MESSAGES[code] ?? authError.message ?? 'No se pudo cambiar la contraseña.');
        return;
      }
      clearTokenCache();
      navigate('/login', { replace: true });
    } catch {
      setError('Error de red. Comprueba tu conexión.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <section className={styles.section}>
        <div className={styles.card}>
          <span className={styles.eyebrow}>Área privada</span>
          <h1 className={styles.title}>Enlace no válido</h1>
          <p className={styles.lead}>
            Falta el código del correo. Solicita un enlace nuevo para continuar.
          </p>
          <Link to="/recuperar" className={styles.submit} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            Pedir otro enlace
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <div className={styles.card}>
        <Link to="/" className={styles.brand} aria-label="Volver al inicio">
          Sánchez Delgado <em>&amp;</em> Asociados
        </Link>
        <span className={styles.eyebrow}>Área privada</span>
        <h1 className={styles.title}>Nueva contraseña</h1>
        <p className={styles.lead}>Elige una contraseña de al menos 8 caracteres.</p>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>Contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Repite la contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {submitting ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </section>
  );
}
