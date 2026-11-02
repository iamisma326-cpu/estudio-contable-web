/**
 * Resumen del panel: métricas de usuarios, altas de los últimos 14 días,
 * recursos más abiertos y actividad reciente.
 */

import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import type { StatsResponse } from '../../lib/adminTypes';
import styles from '../../styles/AdminPage.module.css';

function formatDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StatsPanel() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<StatsResponse>('/api/admin/stats');
      if (cancelled) return;
      if (res.ok && res.data) setData(res.data);
      else setError('No se pudieron cargar las métricas.');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className={styles.alert}>{error}</p>;
  if (!data) return <p className={styles.muted}>Cargando métricas…</p>;

  const { overview, signups, topResources, recentUsers, recentActivity } = data;
  const maxSignups = Math.max(1, ...signups.map((s) => s.count));

  const cards = [
    { label: 'Usuarios registrados', value: overview.users_total, hint: `${overview.profiles} con perfil completado` },
    { label: 'Nuevos (7 días)', value: overview.new_7d, hint: `${overview.new_24h} en las últimas 24 h` },
    { label: 'Sesiones activas', value: overview.active_sessions, hint: `${overview.logins_7d} accesos esta semana` },
    { label: 'Suspendidos', value: overview.users_banned, hint: `Administradores: ${overview.admins}` },
    { label: 'Recursos activos', value: overview.resources_active, hint: `${overview.views_7d} aperturas en 7 días` },
    { label: 'Correos verificados', value: overview.users_verified, hint: `${overview.new_30d} altas en 30 días` },
  ];

  return (
    <>
      <div className={styles.cards}>
        {cards.map((card) => (
          <div key={card.label} className={styles.card}>
            <span className={styles.cardLabel}>{card.label}</span>
            <span className={styles.cardValue}>{card.value}</span>
            <span className={styles.cardHint}>{card.hint}</span>
          </div>
        ))}
      </div>

      <div className={styles.panels}>
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Altas de los últimos 14 días</h3>
          <div className={styles.chart} role="img" aria-label="Altas por día en los últimos 14 días">
            {signups.map((day) => (
              <div key={day.date} className={styles.chartBar} title={`${day.date}: ${day.count}`}>
                <div
                  className={styles.chartFill}
                  style={{ height: `${Math.max(3, (day.count / maxSignups) * 100)}%` }}
                />
                <span className={styles.chartDay}>{day.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Recursos más abiertos (30 días)</h3>
          {topResources.length === 0 ? (
            <p className={styles.muted}>Sin aperturas registradas todavía.</p>
          ) : (
            <ul className={styles.list}>
              {topResources.map((resource) => (
                <li key={resource.id} className={styles.listItem}>
                  <span className={styles.listTitle}>{resource.title}</span>
                  <span className={styles.badgeNeutral + ' ' + styles.badge}>{resource.views} vistas</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Últimos registros</h3>
          {recentUsers.length === 0 ? (
            <p className={styles.muted}>Todavía no hay usuarios.</p>
          ) : (
            <ul className={styles.list}>
              {recentUsers.map((user) => (
                <li key={user.id} className={styles.listItem}>
                  <span className={styles.listMain}>
                    <span className={styles.listTitle}>{user.name}</span>
                    <span className={styles.listMeta}>{user.email}</span>
                  </span>
                  <span className={styles.badgeNeutral + ' ' + styles.badge}>
                    {formatDate(user.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Actividad reciente</h3>
          {recentActivity.length === 0 ? (
            <p className={styles.muted}>Sin actividad registrada.</p>
          ) : (
            <ul className={styles.list}>
              {recentActivity.map((event, i) => (
                <li key={i} className={styles.listItem}>
                  <span className={styles.listMain}>
                    <span className={styles.listTitle}>{event.title ?? 'Recurso eliminado'}</span>
                    <span className={styles.listMeta}>{event.email ?? 'Usuario eliminado'}</span>
                  </span>
                  <span className={styles.listMeta}>{formatDateTime(event.viewed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
