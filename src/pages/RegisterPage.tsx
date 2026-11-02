/**
 * RegisterPage — alta de clientes.
 *
 * 1. `authClient.signUp.email` crea la identidad en Neon Auth (email,
 *    contraseña, nombre). El mínimo del proveedor es 8 caracteres.
 * 2. `/api/auth/profile` guarda los datos de negocio (empresa, RUC, teléfono)
 *    que Better Auth no cubre.
 * 3. La sesión ya queda abierta, así que se entra directo a /recursos.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { authClient } from '../lib/auth';
import { apiSend, clearTokenCache } from '../lib/api';
import styles from '../styles/LoginPage.module.css';

const ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  EMAIL_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 8 caracteres.',
  INVALID_EMAIL: 'El correo no es válido.',
};

export default function RegisterPage() {
  useSEO({
    title: 'Crear cuenta | Sánchez Delgado & Asociados',
    description: 'Crea tu cuenta para acceder a las herramientas contables y tributarias.',
    canonical: 'https://sanchezdelgado.pe/registro',
    noindex: true,
  });

  const navigate = useNavigate();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [ruc, setRuc] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (nombre.trim().length < 2) {
      setError('Indica tu nombre completo.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('El correo no es válido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (ruc && !/^\d{11}$/.test(ruc.replace(/\D/g, ''))) {
      setError('El RUC debe tener 11 dígitos.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await authClient.signUp.email({
        email: email.trim().toLowerCase(),
        password,
        name: nombre.trim(),
      });

      if (authError) {
        const code = String(authError.code ?? '');
        setError(ERROR_MESSAGES[code] ?? authError.message ?? 'No se pudo crear la cuenta.');
        return;
      }

      clearTokenCache();
      await apiSend('/api/auth/profile', 'POST', {
        empresa: empresa.trim(),
        ruc: ruc.replace(/\D/g, ''),
      });

      navigate('/recursos', { replace: true });
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
        <h1 className={styles.title}>Crear cuenta</h1>
        <p className={styles.lead}>
          Las herramientas tributarias y el material de consulta quedan
          disponibles en tu cuenta.
        </p>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>Nombre completo</span>
            <input
              type="text"
              autoComplete="name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              disabled={submitting}
              className={styles.input}
            />
          </label>

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

          <div className={styles.twoCols}>
            <label className={styles.field}>
              <span className={styles.label}>Empresa (opcional)</span>
              <input
                type="text"
                autoComplete="organization"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={submitting}
                className={styles.input}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>RUC (opcional)</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={11}
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
                disabled={submitting}
                className={styles.input}
                placeholder="20123456789"
              />
            </label>
          </div>

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
              placeholder="Mínimo 8 caracteres"
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
            {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className={styles.switch}>
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>

        <Link to="/" className={styles.back}>
          ← Volver al sitio
        </Link>
      </div>
    </section>
  );
}
