/**
 * Biblioteca del cliente: catálogo que administra el estudio desde /admin.
 *
 * El bucket de adjuntos es privado, así que la descarga pide una URL firmada
 * (5 min) a la API en vez de exponer el archivo.
 */

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Download, FileText } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import styles from '../../styles/PanelPage.module.css';

interface Resource {
  id: string;
  title: string;
  description: string;
  category: string;
  href: string | null;
  has_file: boolean;
  file_name: string | null;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; resources: Resource[] }
  | { status: 'error' };

export default function LibraryPanel() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<{ resources: Resource[] }>('/api/resources');
      if (cancelled) return;
      setState(res.ok && res.data ? { status: 'ready', resources: res.data.resources } : { status: 'error' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Abre un recurso y deja registro de la visita para las métricas. */
  const open = useCallback((resource: Resource) => {
    void apiSend('/api/resources', 'POST', { id: resource.id });
  }, []);

  const download = useCallback(async (id: string) => {
    setDownloading(id);
    try {
      const res = await apiGet<{ url: string }>(`/api/resources?id=${id}`);
      if (res.ok && res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setDownloading(null);
    }
  }, []);

  if (state.status === 'loading') {
    return (
      <div className={styles.state} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <p>Cargando biblioteca…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className={styles.alert} role="alert">
        No se pudo cargar la biblioteca. Recarga la página e inténtalo de nuevo.
      </p>
    );
  }

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <BookOpen size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>Biblioteca de recursos</h1>
          <p className={styles.sectionLead}>
            Guías y materiales que el estudio publica para ti. Los adjuntos se
            descargan con un enlace privado que caduca en 5 minutos.
          </p>
        </div>
      </header>

      {state.resources.length === 0 ? (
        <p className={styles.panel}>
          Todavía no hay recursos publicados. En cuanto el estudio suba material
          aparecerá aquí.
        </p>
      ) : (
        <div className={styles.libraryGrid}>
          {state.resources.map((resource) => (
            <article key={resource.id} className={styles.libraryCard}>
              <span className={styles.tag}>{resource.category}</span>
              <h2 className={styles.libraryTitle}>
                {resource.href ? (
                  <a
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => open(resource)}
                  >
                    {resource.title}
                  </a>
                ) : (
                  resource.title
                )}
              </h2>
              <p className={styles.libraryText}>{resource.description}</p>
              {resource.has_file && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={downloading === resource.id}
                  onClick={() => void download(resource.id)}
                >
                  <Download size={15} />
                  {downloading === resource.id ? 'Preparando…' : 'Descargar adjunto'}
                </button>
              )}
              {resource.file_name && (
                <span className={styles.fileHint}>
                  <FileText size={13} /> {resource.file_name}
                </span>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
