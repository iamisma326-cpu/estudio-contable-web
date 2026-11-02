/**
 * Herramientas de cálculo del cliente: tipo de cambio SUNAT, comparador de
 * regímenes y calculadora de multas.
 */

import { Calculator, Scale } from 'lucide-react';
import ExchangeRate from '../ExchangeRate';
import RegimeCalculator from '../RegimeCalculator';
import MultaCalculator from '../MultaCalculator';
import styles from '../../styles/PanelPage.module.css';

export default function ToolsPanel() {
  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <Calculator size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>Herramientas del día a día</h1>
          <p className={styles.sectionLead}>
            Datos oficiales y estimaciones rápidas para tus decisiones de hoy.
          </p>
        </div>
      </header>

      <div className={styles.toolGrid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Tipo de cambio SUNAT</h2>
          <p className={styles.panelNote}>
            Compra y venta oficiales del dólar, referencia para tus facturaciones
            y regularizaciones en moneda extranjera.
          </p>
          <ExchangeRate />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>¿Qué régimen te conviene?</h2>
          <p className={styles.panelNote}>
            Compara el impuesto anual estimado entre RER, RMT y Régimen General
            con tus ventas y gastos del año.
          </p>
          <RegimeCalculator />
        </section>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          <Scale size={17} /> ¿Cuánto cuesta tu multa?
        </h2>
        <p className={styles.panelNote}>
          Las sanciones de SUNAT se expresan en UIT y casi todas se rebajan si
          subsanas a tiempo. Elige la infracción y la etapa en la que estás: te
          decimos el monto según las Tablas I y II del Código Tributario y su
          reglamento de gradualidad.
        </p>
        <MultaCalculator />
      </section>
    </div>
  );
}
