/**
 * Guía y glosario: actualidad tributaria y términos explicados en lenguaje
 * sencillo, dentro del panel del cliente.
 */

import { useEffect, useState } from 'react';
import { BookMarked } from 'lucide-react';
import Glossary from './Glossary';
import { apiGet } from '../../lib/api';
import type { FeedNoticia } from '../../lib/noticiasTypes';
import styles from '../../styles/PanelPage.module.css';

/**
 * Respaldo si la API falla: el panel nunca queda vacío. Es el mismo contenido
 * que la migración siembra en `noticias`, de modo que en producción la lista
 * llega de la base y puede crecer sin tocar código.
 */
const articles = [
  {
    date: 'Sep 2026',
    tag: 'SUNAT',
    title: 'SIRE Integral: SUNAT amplía su uso obligatorio',
    excerpt: 'Más contribuyentes deben llevar el Registro de Compras y Ventas por el sistema en línea. Verifica si tu RUC entra en el nuevo cronograma.',
  },
  {
    date: 'Ene 2026',
    tag: 'Normativo',
    title: 'La UIT 2026 sube a S/ 5,500',
    excerpt: 'El incremento ajusta los umbrales de los regímenes: el RER sigue en S/ 525,000 y el RMT llega a S/ 9,350,000 de ingresos anuales.',
  },
  {
    date: 'Ago 2026',
    tag: 'Laboral',
    title: 'Gratificaciones: errores que cuestan multas',
    excerpt: 'Pagar fuera de fecha u omitir la bonificación extraordinaria del 9 % es de lo más fiscalizado por el MTPE y SUNAT.',
  },
  {
    date: 'Jul 2026',
    tag: 'Tributario',
    title: 'Pagos en efectivo: topes de detección',
    excerpt: 'Las operaciones en efectivo por montos altos quedan sujetas a control de SUNAT. Recomendamos usar canales bancarios para cobros importantes.',
  },
];

const ETIQUETAS: Record<string, string> = {
  sunat: 'SUNAT',
  tributario: 'Tributario',
  laboral: 'Laboral',
  estudio: 'Estudio',
};

function fechaCorta(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
}

export default function GuidePanel() {
  const [feed, setFeed] = useState<FeedNoticia[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<{ ok: boolean; noticias: FeedNoticia[] }>('/api/noticias');
      if (!cancelled && res.ok && res.data?.noticias?.length) setFeed(res.data.noticias);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lista = feed
    ? feed.map((n) => ({
        key: n.id,
        slug: n.slug,
        date: fechaCorta(n.publicada_en),
        tag: ETIQUETAS[n.categoria] || n.categoria,
        title: n.titulo,
        excerpt: n.resumen,
        href: n.fuente_url,
      }))
    : articles.map((a, i) => ({
        key: `fallback-${i}`,
        slug: '',
        date: a.date,
        tag: a.tag,
        title: a.title,
        excerpt: a.excerpt,
        href: null,
      }));

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <BookMarked size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>Guía y glosario</h1>
          <p className={styles.sectionLead}>
            Lo que está cambiando en SUNAT, MTPE y la normativa laboral, y los
            términos que escuchas cada mes, explicados sin tecnicismos.
          </p>
        </div>
      </header>

      <section>
        <h2 className={styles.panelTitle}>Actualidad tributaria</h2>
        <div className={styles.articleGrid}>
          {lista.map((a) => (
            <article
              key={a.key}
              id={a.slug ? `noticia-${a.slug}` : undefined}
              className={styles.articleCard}
            >
              <div className={styles.articleMeta}>
                <span className={styles.articleDate}>{a.date}</span>
                <span className={styles.tag}>{a.tag}</span>
              </div>
              <h3 className={styles.articleTitle}>{a.title}</h3>
              <p className={styles.articleText}>{a.excerpt}</p>
              {a.href && (
                <a
                  className={styles.inlineLink}
                  href={a.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver la fuente oficial
                </a>
              )}
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className={styles.panelTitle}>Glosario contable</h2>
        <Glossary />
      </section>
    </div>
  );
}
