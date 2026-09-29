import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { compararRegimenes, formatSoles, REGIMENES } from '../data/regimenes';
import { whatsappLink } from '../config/contact';
import { IconWhatsApp } from './icons/BrandIcons';
import styles from '../styles/RegimeCalculator.module.css';

/**
 * Calculadora comparativa de regímenes tributarios 2026 (RER / RMT / General).
 * Estimación referencial: el resultado exacto depende de la deducibilidad
 * real de cada gasto, coeficientes de pagos a cuenta y otros factores.
 */
export default function RegimeCalculator() {
  const [ingresos, setIngresos] = useState('');
  const [gastos, setGastos] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const ingNum = Number(ingresos.replace(/,/g, '')) || 0;
  const gasNum = Number(gastos.replace(/,/g, '')) || 0;
  const valid = ingNum > 0;
  const results = submitted && valid ? compararRegimenes(ingNum, gasNum) : null;

  // El más barato entre los elegibles
  const mejor =
    results?.filter((r) => r.elegible && r.impuestoAnual !== null).sort((a, b) => (a.impuestoAnual ?? 0) - (b.impuestoAnual ?? 0))[0] ?? null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) setSubmitted(true);
  }

  const waMsg = `Hola Sánchez Delgado & Asociados, usé la calculadora de regímenes en su web (ingresos ${formatSoles(ingNum)}, gastos ${formatSoles(gasNum)}) y quiero una evaluación profesional de mi situación.`;

  return (
    <div className={styles.card}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Ventas netas anuales <small>(sin IGV)</small>
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej. 360000"
              value={ingresos}
              onChange={(e) => {
                setIngresos(e.target.value.replace(/[^\d.,]/g, ''));
                setSubmitted(false);
              }}
              className={styles.input}
              aria-describedby="regime-note"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Gastos deducibles anuales <small>(sin IGV)</small>
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej. 280000"
              value={gastos}
              onChange={(e) => {
                setGastos(e.target.value.replace(/[^\d.,]/g, ''));
                setSubmitted(false);
              }}
              className={styles.input}
              aria-describedby="regime-note"
            />
          </label>
        </div>

        <button type="submit" className={styles.submitBtn} disabled={!valid}>
          Comparar mis regímenes <ArrowRight size={16} />
        </button>
        <p className={styles.note} id="regime-note">
          Estimación referencial para tercera categoría (empresas y negocios),
          ejercicio 2026. No considera tu régimen actual, coeficientes ni
          deducciones limitadas.
        </p>
      </form>

      {results && (
        <div className={styles.results} aria-live="polite">
          <div className={styles.resultsGrid}>
            {results.map((r) => (
              <div
                key={r.key}
                className={`${styles.resultCard} ${mejor?.key === r.key ? styles.resultBest : ''} ${!r.elegible ? styles.resultOff : ''}`}
              >
                <div className={styles.resultHead}>
                  <h4>{r.nombre}</h4>
                  {mejor?.key === r.key && r.elegible && <span className={styles.bestTag}>Más económico</span>}
                </div>
                {!r.elegible ? (
                  <p className={styles.off}>{r.motivoInelegible}</p>
                ) : (
                  <>
                    <p className={styles.mainValue}>
                      <strong>{formatSoles(r.impuestoAnual ?? 0)}</strong>
                      <span>impuesto a la renta anual estimado</span>
                    </p>
                    <p className={styles.pac}>
                      {r.pagoACuentaMensual !== null
                        ? `Pagos a cuenta: ${formatSoles(r.pagoACuentaMensual)}/mes aprox.`
                        : 'Sin declaración anual: el pago mensual es definitivo.'}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className={styles.ctaRow}>
            <Link to="/contacto" className={styles.ctaDark}>
              Evaluación profesional completa <ArrowRight size={15} />
            </Link>
            <a href={whatsappLink(waMsg)} target="_blank" rel="noreferrer" className={styles.ctaWa}>
              <IconWhatsApp size={16} /> Consultar por WhatsApp
            </a>
          </div>
          <p className={styles.finePrint}>
            Cálculo basado en las tasas vigentes 2026: RER 1.5% de ingresos (≤ S/ 525,000),
            RMT 10% hasta 15 UIT de renta neta + 29.5% por el exceso (≤ 1,700 UIT de
            ingresos), General 29.5% de la renta neta. UIT 2026: S/ 5,500.{' '}
            <Link to="/servicios" className={styles.fineLink}>
              Ver servicios de asesoría tributaria
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
