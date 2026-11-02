/**
 * PanelPage — espacio privado del cliente.
 *
 * Misma estructura que el panel de administración: barra superior con la
 * sesión y el cierre de sesión siempre a la vista, pestañas y contenido.
 * Aquí viven las herramientas que antes estaban en /recursos.
 *
 * La pestaña activa se refleja en `?tab=`, así que el enlace se puede
 * compartir o recuperar al recargar.
 */

import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { useSession } from '../hooks/useSession';
import OverviewPanel from '../components/panel/OverviewPanel';
import LibraryPanel from '../components/panel/LibraryPanel';
import CalendarPanel from '../components/panel/CalendarPanel';
import ToolsPanel from '../components/panel/ToolsPanel';
import GuidePanel from '../components/panel/GuidePanel';
import AccountPanel from '../components/panel/AccountPanel';
import { PANEL_TABS, DEFAULT_TAB, isPanelTab } from '../components/panel/tabs';
import type { PanelTab } from '../components/panel/tabs';
import styles from '../styles/PanelPage.module.css';

export default function PanelPage() {
  useSEO({
    title: 'Mi panel | Sánchez Delgado & Asociados',
    description: 'Herramientas contables, calendario tributario y biblioteca de recursos.',
    noindex: true,
  });

  const { me, signOut, isAdmin, refresh } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const requested = params.get('tab');
  const tab: PanelTab = isPanelTab(requested) ? requested : DEFAULT_TAB;

  function goTo(next: PanelTab) {
    setParams(next === DEFAULT_TAB ? {} : { tab: next });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function logout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  // RouteGuard ya garantiza sesión; el chequeo evita un parpadeo si el
  // usuario cierra sesión en otra pestaña mientras esta se re-renderiza.
  if (!me) return null;

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.greeting}>
            Hola, <strong>{me.name || me.email}</strong>
            <span className={styles.role}>{isAdmin ? 'Administración' : 'Cliente'}</span>
          </span>
          <div className={styles.actions}>
            {isAdmin && (
              <Link to="/admin" className={styles.backLink}>
                Panel admin
              </Link>
            )}
            <Link to="/" className={styles.backLink}>
              ← Volver al sitio
            </Link>
            <button type="button" onClick={() => void logout()} className={styles.logoutBtn}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Secciones de tu panel">
        <div className={styles.tabsInner}>
          {PANEL_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
              onClick={() => goTo(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className={styles.content}>
        {tab === 'inicio' && <OverviewPanel me={me} onNavigate={goTo} />}
        {tab === 'biblioteca' && <LibraryPanel />}
        {tab === 'calendario' && <CalendarPanel />}
        {tab === 'herramientas' && <ToolsPanel />}
        {tab === 'guia' && <GuidePanel />}
        {tab === 'cuenta' && <AccountPanel me={me} onSignOut={logout} onSave={refresh} />}
      </div>
    </section>
  );
}
