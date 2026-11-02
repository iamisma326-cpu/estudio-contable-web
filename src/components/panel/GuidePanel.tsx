/**
 * Guía y glosario: actualidad tributaria y términos explicados en lenguaje
 * sencillo, dentro del panel del cliente.
 */

import { useState } from 'react';
import { BookMarked, Search } from 'lucide-react';
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

const glossary = [
  { term: 'UIT', def: 'Unidad Impositiva Tributaria. Para 2026 vale S/ 5,500 y es la base de los umbrales de regímenes e impuestos.' },
  { term: 'IGV', def: 'Impuesto General a las Ventas: 18 % (incluye 2 % de promoción municipal) que se cobra en cada venta y se paga mensualmente a SUNAT.' },
  { term: 'PDT 621', def: 'Programa informático con el que se declara el IGV y el Impuesto a la Renta mensual de tercera categoría.' },
  { term: 'RMT', def: 'Régimen MYPE Tributario: para empresas con ingresos hasta 1,700 UIT. IR del 10 % hasta 15 UIT de renta neta.' },
  { term: 'PLE', def: 'Programa de Libros Electrónicos: sistema para presentar los libros contables de forma digital ante SUNAT.' },
  { term: 'T-Registro', def: 'Registro virtual de trabajadores ante el MTPE, obligatorio al iniciar y finalizar contratos laborales.' },
  { term: 'CTS', def: 'Compensación por Tiempo de Servicios: beneficio social que se deposita en mayo y noviembre.' },
  { term: 'PCGE', def: 'Plan Contable General Empresarial: catálogo de cuentas obligatorio para la contabilidad completa.' },
];

export default function GuidePanel() {
  const [query, setQuery] = useState('');

  const filtered = glossary.filter(
    (g) =>
      g.term.toLowerCase().includes(query.toLowerCase()) ||
      g.def.toLowerCase().includes(query.toLowerCase())
  );

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
        <label className={styles.searchField}>
          <Search size={16} className={styles.searchIcon} aria-hidden="true" />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Buscar término… (ej. IGV, CTS, UIT)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar término en el glosario"
          />
        </label>

        <dl className={styles.glossaryGrid}>
          {filtered.map((g) => (
            <div key={g.term} className={styles.termCard}>
              <dt className={styles.termTitle}>{g.term}</dt>
              <dd className={styles.termText}>{g.def}</dd>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className={styles.termCard}>
              <dt className={styles.termTitle}>Sin resultados</dt>
              <dd className={styles.termText}>
                No encontramos ese término. Escríbenos y te lo explicamos
                personalmente.
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
