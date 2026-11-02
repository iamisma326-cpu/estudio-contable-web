/**
 * RecoverPage — solicitud de restablecimiento de contraseña.
 *
 * Neon Auth envía el correo (SMTP compartido del branch). El enlace vuelve a
 * /restablecer con el token en la query string.
 *
 * No se revela si el correo existe: la respuesta es la misma en ambos casos.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { authClient } from '../lib/auth';
import styles from '../styles/LoginPage.module.css';

export default function RecoverPage() {
  useSEO({
    title: 'Recuperar contraseña | Sánchez Delgado & Asociados',
    description: 'Solicita un enlace para restablecer tu contraseña.',
    noindex: true,
  });

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('El correo no es válido.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: `${window.location.origin}/restablecer`,
      });
      if (authError) {
        setError(authError.message ?? 'No se pudo enviar el correo.');
        return;
      }
      setSent(true);
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
        <h1 className={styles.title}>Recuperar contraseña</h1>

        {sent ? (
          <>
            <p className={styles.lead}>
              Si <strong>{email}</strong> tiene una cuenta, te enviamos un enlace para
              elegir una contraseña nueva. Revisa también el correo no deseado.
            </p>
            <Link to="/login" className={styles.back}>
              ← Volver a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <p className={styles.lead}>
              Escribe el correo de tu cuenta y te enviaremos un enlace para
              restablecerla.
            </p>
            <form className={styles.form} onSubmit={onSubmit} noValidate>
              <label className={styles.field}>
                <span className={styles.label}>Correo</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                  className={styles.input}
                  placeholder="tucorreo@empresa.pe"
                />
              </label>

              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={submitting} className={styles.submit}>
                {submitting ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>

            <p className={styles.switch}>
              <Link to="/login">Volver a iniciar sesión</Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
