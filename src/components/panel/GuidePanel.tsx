/**
 * Guía y glosario: actualidad tributaria y términos explicados en lenguaje
 * sencillo, dentro del panel del cliente.
 */

import { BookMarked } from 'lucide-react';
import Glossary from './Glossary';
import styles from '../../styles/PanelPage.module.css';

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

export default function GuidePanel() {
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
          {articles.map((a) => (
            <article key={a.title} className={styles.articleCard}>
              <div className={styles.articleMeta}>
                <span className={styles.articleDate}>{a.date}</span>
                <span className={styles.tag}>{a.tag}</span>
              </div>
              <h3 className={styles.articleTitle}>{a.title}</h3>
              <p className={styles.articleText}>{a.excerpt}</p>
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
