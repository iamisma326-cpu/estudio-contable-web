/**
 * AdminPage — vista post-login.
 *
 * Topbar delgada con saludo + cerrar sesión + volver al sitio.
 * Debajo: PDFEditor (componente con la herramienta de edición).
 *
 * Si la sesión expira mientras estamos aquí, el PDFEditor los redirige a
 * /login automáticamente al recibir 401.
 */

import { useNavigate } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { useAdminSession } from '../hooks/useAdminSession';
import PDFEditor from '../components/PDFEditor';
import styles from '../styles/AdminPage.module.css';

export default function AdminPage() {
  useSEO({
    title: 'Panel admin | Sánchez Delgado & Asociados',
    description: 'Panel interno de administración.',
    noindex: true,
  });

  const { loading, authenticated, user } = useAdminSession();
  const navigate = useNavigate();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    navigate('/login', { replace: true });
  }

  if (loading) {
    return (
      <section className={styles.loading}>
        <span className={styles.spinner} aria-hidden="true" />
        <p>Verificando sesión…</p>
      </section>
    );
  }

  if (!authenticated) {
    // Sesión expirada: navegamos al login. Hacemos el replace aquí para no
    // dejar /admin en el historial.
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.greeting}>
            Sesión activa: <strong>{user || 'admin'}</strong>
          </span>
          <div className={styles.actions}>
            <a href="/" className={styles.backLink}>← Volver al sitio</a>
            <button type="button" onClick={logout} className={styles.logoutBtn}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <PDFEditor />
      </div>
    </section>
  );
}