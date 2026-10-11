/**
 * LoginPage — formulario de acceso admin.
 *
 * La contraseña NO está hardcodeada: el serverless /api/admin/login compara
 * contra ADMIN_USER/ADMIN_PASSWORD (env vars de Vercel, default "admin" /
 * "admin123" solo en dev). El frontend solo manda y maneja el estado.
 *
 * UX:
 *   - form minimal, una sola pantalla.
 *   - errores visibles sin alerts nativos.
 *   - al éxito navega a /admin.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import styles from '../styles/LoginPage.module.css';

export default function LoginPage() {
  useSEO({
    title: 'Acceso administrativo | Sánchez Delgado & Asociados',
    description: 'Acceso administrativo al editor de documentos.',
    canonical: 'https://sanchezdelgado.pe/login',
    breadcrumb: [{ name: 'Acceso admin', path: '/login' }],
    noindex: true,
  });

  const navigate = useNavigate();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user, password }),
      });
      if (res.ok) {
        navigate('/admin', { replace: true });
        return;
      }
      const data: { error?: string } = await res.json().catch(() => ({}));
      setError(data.error === 'invalid_credentials' ? 'Usuario o contraseña incorrectos.' : 'No se pudo iniciar sesión.');
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
        <span className={styles.eyebrow}>Acceso administrativo</span>
        <h1 className={styles.title}>Iniciar sesión</h1>
        <p className={styles.lead}>
          Panel de herramientas internas para edición asistida de documentos.
        </p>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>Usuario</span>
            <input
              type="text"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              required
              disabled={submitting}
              className={styles.input}
              placeholder="admin"
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

        <Link to="/" className={styles.back}>
          ← Volver al sitio
        </Link>
      </div>
    </section>
  );
}