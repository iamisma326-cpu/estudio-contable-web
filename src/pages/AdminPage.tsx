/**
 * AdminPage — panel de administración.
 *
 * Pestañas:
 *   Resumen   métricas de usuarios, altas, recursos y actividad
 *   Usuarios  búsqueda, filtros, rol, suspensión y baja
 *   Recursos  catálogo del área privada
 *   Editor    herramienta de edición asistida de PDF (PDFEditor)
 *
 * El rol y la sesión se verifican en RouteGuard (/admin es adminOnly) y otra
 * vez en cada endpoint: esto es solo la vista.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { useSession } from '../hooks/useSession';
import PDFEditor from '../components/PDFEditor';
import StatsPanel from '../components/admin/StatsPanel';
import UsersPanel from '../components/admin/UsersPanel';
import ResourcesPanel from '../components/admin/ResourcesPanel';
import styles from '../styles/AdminPage.module.css';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'editor', label: 'Editor PDF' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AdminPage() {
  useSEO({
    title: 'Panel admin | Sánchez Delgado & Asociados',
    description: 'Panel interno de administración.',
    noindex: true,
  });

  const { me, signOut } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('resumen');

  async function logout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.greeting}>
            Sesión activa: <strong>{me?.name || me?.email || 'admin'}</strong>
            <span className={styles.role}>Administración</span>
          </span>
          <div className={styles.actions}>
            <Link to="/panel" className={styles.backLink}>
              Ver mi panel
            </Link>
            <Link to="/" className={styles.backLink}>
              ← Volver al sitio
            </Link>
            <button type="button" onClick={logout} className={styles.logoutBtn}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Secciones del panel">
        <div className={styles.tabsInner}>
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className={styles.content}>
        {tab === 'resumen' && <StatsPanel />}
        {tab === 'usuarios' && <UsersPanel />}
        {tab === 'recursos' && <ResourcesPanel />}
        {tab === 'editor' && <PDFEditor />}
      </div>
    </section>
  );
}
