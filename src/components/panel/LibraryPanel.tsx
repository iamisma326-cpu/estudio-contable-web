/**
 * Biblioteca del cliente: catálogo que administra el estudio desde /admin.
 *
 * El bucket de adjuntos es privado, así que la descarga pide una URL firmada
 * (5 min) a la API en vez de exponer el archivo.
 *
 * Una herramienta de la biblioteca se abre AQUÍ, en la propia pestaña, y no en
 * una ventana nueva: el cliente venía de un clic en la biblioteca y perder el
 * panel en otra pestaña le obligaba a volver a buscar dónde estaba. La
 * herramienta abierta vive en `?recurso=`, así que el botón de retroceso del
 * navegador, el enlace compartido y el "Volver a la biblioteca" devuelven todos
 * al catálogo.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Download, FileText, Wrench } from 'lucide-react';
import ExchangeRate from '../ExchangeRate';
import RegimeCalculator from '../RegimeCalculator';
import MultaCalculator from '../MultaCalculator';
import DeadlineTool from './DeadlineTool';
import Glossary from './Glossary';
import { apiGet, apiSend } from '../../lib/api';
import styles from '../../styles/PanelPage.module.css';

interface Resource {
  id: string;
  slug: string | null;
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

/** Envuelve una herramienta suelta en la tarjeta blanca que usa el panel. */
function enPanel(Herramienta: ComponentType) {
  return function HerramientaEnPanel() {
    return (
      <div className={styles.panel}>
        <Herramienta />
      </div>
    );
  };
}

/**
 * Herramientas que se pueden abrir dentro de la biblioteca.
 *
 * Se indexan por slug y por el ancla del href porque los enlaces antiguos
 * apuntan a `/recursos#tipo-cambio` mientras el slug dice `tipo-de-cambio`.
 * Quien administra puede cambiar el href sin romper la tarjeta.
 */
const HERRAMIENTAS: Record<string, ComponentType> = {
  'tipo-de-cambio': enPanel(ExchangeRate),
  'tipo-cambio': enPanel(ExchangeRate),
  regimenes: enPanel(RegimeCalculator),
  multas: enPanel(MultaCalculator),
  'cronograma-sunat': DeadlineTool,
  cronograma: DeadlineTool,
  glosario: Glossary,
};

/** Clave estable del recurso en la URL: el slug, o el id si no tiene. */
function claveDe(resource: Resource): string {
  return resource.slug || resource.id;
}

/** Reconoce la herramienta por el slug o por el ancla del href. */
function herramientaDe(resource: Resource): ComponentType | null {
  const claves = [resource.slug, resource.href?.split('#')[1]];
  for (const clave of claves) {
    const normalizada = clave?.trim().toLowerCase();
    if (normalizada && HERRAMIENTAS[normalizada]) return HERRAMIENTAS[normalizada];
  }
  return null;
}

export default function LibraryPanel() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [downloading, setDownloading] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

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

  /** Deja registro de la visita para las métricas. */
  const registrarApertura = useCallback((resource: Resource) => {
    void apiSend('/api/resources', 'POST', { id: resource.id });
  }, []);

  /** Vuelve al catálogo sin apilar otra entrada de historial. */
  const volver = useCallback(() => {
    setParams({ tab: 'biblioteca' }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setParams]);

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

  const activo = params.get('recurso');
  const seleccionado = activo
    ? state.resources.find((r) => claveDe(r) === activo)
    : undefined;

  // `?recurso=` apunta a un recurso que ya no existe (despublicado o borrado):
  // se muestra el catálogo en vez de una pantalla vacía.
  if (activo && seleccionado) {
    const Herramienta = herramientaDe(seleccionado);
    return (
      <div className={styles.stack}>
        <button type="button" className={styles.libraryBack} onClick={volver}>
          <ArrowLeft size={16} aria-hidden="true" /> Volver a la biblioteca
        </button>

        <header className={styles.sectionHead}>
          <span className={styles.sectionIcon}>
            <Wrench size={22} />
          </span>
          <div>
            <h1 className={styles.sectionTitle}>{seleccionado.title}</h1>
            <p className={styles.sectionLead}>{seleccionado.description}</p>
          </div>
        </header>

        {Herramienta ? (
          <Herramienta />
        ) : (
          <p className={styles.panel}>
            Esta herramienta se abre en otra página del sitio y no se puede
            mostrar aquí. Vuelve a la biblioteca para elegir otra.
          </p>
        )}
      </div>
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
          {state.resources.map((resource) => {
            const Herramienta = herramientaDe(resource);
            return (
              <article key={resource.id} className={styles.libraryCard}>
                <span className={styles.tag}>{resource.category}</span>
                <h2 className={styles.libraryTitle}>
                  {resource.href && Herramienta ? (
                    // Herramienta conocida: se abre en la biblioteca. Es un
                    // enlace real para que se pueda compartir y para que el
                    // retroceso del navegador funcione.
                    <Link
                      to={`/panel?tab=biblioteca&recurso=${encodeURIComponent(claveDe(resource))}`}
                      onClick={() => registrarApertura(resource)}
                    >
                      {resource.title}
                    </Link>
                  ) : resource.href ? (
                    // Enlace externo o no reconocido: misma pestaña, sin
                    // `target="_blank"`.
                    <a href={resource.href} onClick={() => registrarApertura(resource)}>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
