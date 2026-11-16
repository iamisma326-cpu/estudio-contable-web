/**
 * Glosario contable con buscador.
 *
 * Se extrajo de GuidePanel porque la biblioteca de recursos abre el glosario
 * como herramienta propia: duplicar la lista en dos archivos terminaría en dos
 * glosarios que se contradicen.
 */

import { useState } from 'react';
import { Search } from 'lucide-react';
import styles from '../../styles/PanelPage.module.css';

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

export default function Glossary() {
  const [query, setQuery] = useState('');

  const filtered = glossary.filter(
    (g) =>
      g.term.toLowerCase().includes(query.toLowerCase()) ||
      g.def.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
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
    </>
  );
}
