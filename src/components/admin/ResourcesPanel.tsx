/**
 * Catálogo de recursos del área privada: alta, edición, publicación, adjunto
 * privado y baja. Lo que se publica aquí es exactamente lo que ve el cliente
 * en el panel del cliente (/panel, pestaña Biblioteca).
 *
 * El uso real es mantenimiento (renombrar "Cronograma SUNAT 2026" a 2027,
 * ocultar lo que ya no aplica). Por eso el formulario está plegado: la
 * tabla manda y solo se abre al editar o al crear un recurso nuevo.
 *
 * Los adjuntos van a Object Storage (bucket privado): se sube con un PUT
 * prefirmado y la descarga se firma al momento, nunca por URL pública.
 */

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { apiGet, apiSend } from '../../lib/api';
import type { AdminResource, ResourcesResponse } from '../../lib/adminTypes';
import styles from '../../styles/AdminPage.module.css';

interface FormState {
  title: string;
  description: string;
  category: string;
  href: string;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: 'herramienta',
  href: '',
  sort_order: '0',
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ResourcesPanel() {
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // null = formulario cerrado. '' = creando. id = editando ese recurso.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiGet<ResourcesResponse>('/api/admin/resources');
    if (res.ok && res.data) setResources(res.data.resources);
    else setError('No se pudo cargar el catálogo.');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId('');
    setForm(EMPTY_FORM);
    setFile(null);
    setFormOpen(true);
    setError(null);
    setNotice(null);
  }

  function startEdit(resource: AdminResource) {
    setEditingId(resource.id);
    setForm({
      title: resource.title,
      description: resource.description,
      category: resource.category,
      href: resource.href ?? '',
      sort_order: String(resource.sort_order),
    });
    setFile(null);
    setFormOpen(true);
    setError(null);
    setNotice(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setFormOpen(false);
  }

  /** Sube el binario al bucket privado y lo vincula al recurso. */
  async function uploadFile(resourceId: string, selected: File): Promise<boolean> {
    const preset = await apiSend<{ ok: boolean; key: string; uploadUrl: string }>(
      '/api/admin/resource-file',
      'POST',
      {
        id: resourceId,
        fileName: selected.name,
        contentType: selected.type || 'application/octet-stream',
        size: selected.size,
      }
    );

    if (!preset.ok || !preset.data?.uploadUrl) {
      setError('No se pudo preparar la subida del archivo.');
      return false;
    }

    // PUT directo a storage: sin cabecera Authorization (la firma va en la URL).
    const put = await fetch(preset.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': selected.type || 'application/octet-stream' },
      body: selected,
    });
    if (!put.ok) {
      setError('La subida al almacenamiento falló.');
      return false;
    }

    const linked = await apiSend('/api/admin/resources', 'PATCH', {
      id: resourceId,
      file_key: preset.data.key,
      file_name: selected.name,
      file_size: selected.size,
    });
    if (!linked.ok) {
      setError('El archivo subió pero no se pudo vincular al recurso.');
      return false;
    }
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (form.title.trim().length < 3) {
      setError('El título debe tener al menos 3 caracteres.');
      return;
    }

    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim() || 'herramienta',
      href: form.href.trim(),
      sort_order: Number(form.sort_order) || 0,
    };

    const isEdit = Boolean(editingId);
    const res = isEdit
      ? await apiSend<{ resource: AdminResource }>('/api/admin/resources', 'PATCH', {
          id: editingId,
          ...payload,
        })
      : await apiSend<{ resource: AdminResource }>('/api/admin/resources', 'POST', payload);

    if (!res.ok || !res.data?.resource) {
      setSaving(false);
      setError('No se pudo guardar el recurso.');
      return;
    }

    const savedId = res.data.resource.id;
    if (file) {
      const uploaded = await uploadFile(savedId, file);
      if (!uploaded) {
        setSaving(false);
        await load();
        return;
      }
    }

    setSaving(false);
    setNotice(isEdit ? 'Recurso actualizado.' : 'Recurso creado.');
    resetForm();
    await load();
  }

  async function toggleActive(resource: AdminResource) {
    setBusyId(resource.id);
    const res = await apiSend('/api/admin/resources', 'PATCH', {
      id: resource.id,
      is_active: !resource.is_active,
    });
    setBusyId(null);
    if (!res.ok) {
      setError('No se pudo cambiar la publicación.');
      return;
    }
    await load();
  }

  async function removeFile(resource: AdminResource) {
    if (!window.confirm(`¿Quitar el adjunto de "${resource.title}"?`)) return;
    setBusyId(resource.id);
    const res = await apiSend(`/api/admin/resource-file?id=${resource.id}`, 'DELETE');
    setBusyId(null);
    if (!res.ok) {
      setError('No se pudo quitar el archivo.');
      return;
    }
    await load();
  }

  async function remove(resource: AdminResource) {
    const warning = resource.file_name
      ? `¿Eliminar "${resource.title}" del catálogo? También se borrará su archivo adjunto.`
      : `¿Eliminar "${resource.title}" del catálogo?`;
    if (!window.confirm(warning)) return;
    setBusyId(resource.id);
    const res = await apiSend<{ ok: boolean; fileRemoved?: boolean }>(
      `/api/admin/resources?id=${resource.id}`,
      'DELETE'
    );
    setBusyId(null);
    if (!res.ok) {
      setError('No se pudo eliminar el recurso.');
      return;
    }
    if (res.data?.fileRemoved === false) {
      setError('El recurso se eliminó, pero su archivo no pudo borrarse del almacenamiento.');
    }
    if (editingId === resource.id) resetForm();
    await load();
  }

  const isEdit = Boolean(editingId);

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.muted}>
          Lo que está publicado aquí es lo que el cliente ve en su Biblioteca.
        </p>
        <button type="button" className={styles.primaryBtn} onClick={openCreate}>
          Nuevo recurso
        </button>
      </div>

      {error && <p className={styles.alert}>{error}</p>}
      {notice && <p className={styles.alert + ' ' + styles.success}>{notice}</p>}

      {formOpen && (
        <form className={styles.form} onSubmit={onSubmit}>
          <h3 className={styles.formTitle}>
            {isEdit ? 'Editar recurso' : 'Nuevo recurso'}
          </h3>

          <div className={styles.formRow}>
            <input
              className={styles.input}
              placeholder="Título del recurso"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              aria-label="Título"
              required
            />
            <input
              className={styles.input}
              placeholder="Categoría (herramienta, guía…)"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              aria-label="Categoría"
            />
          </div>

          <input
            className={styles.input}
            placeholder="Descripción breve"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            aria-label="Descripción"
          />

          <details className={styles.advanced}>
            <summary>Opciones avanzadas (enlace, orden, adjunto)</summary>
            <div className={styles.formRow}>
              <input
                className={styles.input}
                placeholder="Enlace (/panel?tab=herramientas o URL)"
                value={form.href}
                onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
                aria-label="Enlace"
              />
              <input
                className={styles.input}
                type="number"
                placeholder="Orden"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                aria-label="Orden"
              />
            </div>
            <label className={styles.fileField}>
              <span className={styles.fileLabel}>Adjunto privado (opcional, máx. 25 MB)</span>
              <input
                type="file"
                className={styles.fileInput}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.png,.jpg,.jpeg"
              />
            </label>
          </details>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryBtn} disabled={saving}>
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear recurso'}
            </button>
            <button type="button" className={styles.miniBtn} onClick={resetForm}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Recurso</th>
              <th>Categoría</th>
              <th>Orden</th>
              <th>Adjunto</th>
              <th>Estado</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  Cargando catálogo…
                </td>
              </tr>
            )}
            {resources.map((resource) => (
              <tr key={resource.id}>
                <td>
                  <span className={styles.cellTitle}>{resource.title}</span>
                  <span className={styles.cellSub}>{resource.href || 'sin enlace'}</span>
                </td>
                <td>{resource.category}</td>
                <td>{resource.sort_order}</td>
                <td>
                  {resource.file_name ? (
                    <>
                      <span className={styles.cellSub}>{resource.file_name}</span>
                      <span className={styles.cellSub}>{formatSize(resource.file_size)}</span>
                    </>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
                <td>
                  <span className={resource.is_active ? styles.badge : styles.badgeNeutral + ' ' + styles.badge}>
                    {resource.is_active ? 'Publicado' : 'Oculto'}
                  </span>
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.miniBtn} onClick={() => startEdit(resource)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      disabled={busyId === resource.id}
                      onClick={() => toggleActive(resource)}
                    >
                      {resource.is_active ? 'Ocultar' : 'Publicar'}
                    </button>
                    {resource.file_name && (
                      <button
                        type="button"
                        className={styles.miniBtn}
                        disabled={busyId === resource.id}
                        onClick={() => removeFile(resource)}
                      >
                        Quitar adjunto
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                      disabled={busyId === resource.id}
                      onClick={() => remove(resource)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && resources.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  El catálogo está vacío.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
