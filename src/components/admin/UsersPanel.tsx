/**
 * Gestión de usuarios: búsqueda, filtros, paginación y acciones de rol,
 * suspensión y baja. Cada acción la valida el servidor (incluido el bloqueo
 * de modificarse a uno mismo).
 */

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';
import type { AdminUser, UsersResponse } from '../../lib/adminTypes';
import styles from '../../styles/AdminPage.module.css';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ACTION_LABELS: Record<string, string> = {
  promote: 'Promover',
  demote: 'Degradar',
  suspend: 'Suspender',
  activate: 'Reactivar',
  delete: 'Eliminar',
};

export default function UsersPanel() {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      q: query.trim(),
      role,
      status,
      page: String(page),
      limit: '20',
    });
    const res = await apiGet<UsersResponse>(`/api/admin/users?${params.toString()}`);
    if (res.ok && res.data) {
      setData(res.data);
    } else {
      setError('No se pudo cargar la lista de usuarios.');
    }
    setLoading(false);
  }, [query, role, status, page]);

  // Debounce de la búsqueda: el resto de cambios recarga de inmediato.
  useEffect(() => {
    const timer = window.setTimeout(load, query ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function runAction(user: AdminUser, action: string) {
    if (action === 'delete') {
      const ok = window.confirm(
        `¿Eliminar definitivamente a ${user.email}? Se borran su cuenta, sesiones y perfil.`
      );
      if (!ok) return;
    }
    setBusyId(user.id);
    setError(null);
    const res = await apiSend<{ ok: boolean; error?: string }>('/api/admin/users', 'PATCH', {
      id: user.id,
      action,
    });
    if (!res.ok) {
      const messages: Record<string, string> = {
        cannot_modify_self: 'No puedes aplicar esa acción sobre tu propia cuenta.',
        not_found: 'El usuario ya no existe.',
        forbidden: 'Tu sesión no tiene permisos de administración.',
      };
      setError(messages[res.data?.error ?? ''] ?? 'No se pudo completar la acción.');
    }
    setBusyId(null);
    await load();
  }

  return (
    <>
      <div className={styles.filters}>
        <input
          type="search"
          className={`${styles.input} ${styles.searchInput}`}
          placeholder="Buscar por nombre o correo…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          aria-label="Buscar usuarios"
        />
        <select
          className={styles.select}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por rol"
        >
          <option value="">Todos los roles</option>
          <option value="user">Usuarios</option>
          <option value="admin">Administradores</option>
        </select>
        <select
          className={styles.select}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="suspended">Suspendidos</option>
        </select>
      </div>

      {error && <p className={styles.alert}>{error}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Empresa</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Registro</th>
              <th>Último acceso</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  Cargando usuarios…
                </td>
              </tr>
            )}
            {data?.users.map((user) => (
              <tr key={user.id}>
                <td>
                  <span className={styles.cellTitle}>{user.name}</span>
                  <span className={styles.cellSub}>{user.email}</span>
                </td>
                <td>{user.empresa || '—'}</td>
                <td>
                  <span className={user.role === 'admin' ? styles.badge : styles.badgeNeutral + ' ' + styles.badge}>
                    {user.role === 'admin' ? 'Admin' : 'Usuario'}
                  </span>
                </td>
                <td>
                  <span className={user.banned ? styles.badge : styles.badgeNeutral + ' ' + styles.badge}>
                    {user.banned ? 'Suspendido' : 'Activo'}
                  </span>
                </td>
                <td>{formatDate(user.createdAt)}</td>
                <td>{formatDate(user.last_session_at)}</td>
                <td>
                  <div className={styles.rowActions}>
                    {user.role === 'admin' ? (
                      <button
                        type="button"
                        className={styles.miniBtn}
                        disabled={busyId === user.id}
                        onClick={() => runAction(user, 'demote')}
                      >
                        {ACTION_LABELS.demote}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.miniBtn}
                        disabled={busyId === user.id}
                        onClick={() => runAction(user, 'promote')}
                      >
                        {ACTION_LABELS.promote}
                      </button>
                    )}
                    {user.banned ? (
                      <button
                        type="button"
                        className={styles.miniBtn}
                        disabled={busyId === user.id}
                        onClick={() => runAction(user, 'activate')}
                      >
                        {ACTION_LABELS.activate}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.miniBtn}
                        disabled={busyId === user.id}
                        onClick={() => runAction(user, 'suspend')}
                      >
                        {ACTION_LABELS.suspend}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                      disabled={busyId === user.id}
                      onClick={() => runAction(user, 'delete')}
                    >
                      {ACTION_LABELS.delete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.users.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  No hay usuarios que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>
            {data.total} usuario{data.total === 1 ? '' : 's'} · página {data.page} de {data.pages}
          </span>
          <div className={styles.pageBtns}>
            <button
              type="button"
              className={styles.miniBtn}
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className={styles.miniBtn}
              disabled={!data || page >= data.pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
