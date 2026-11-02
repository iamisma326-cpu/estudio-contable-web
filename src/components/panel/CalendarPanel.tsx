/**
 * Calendario tributario dentro del panel: consultor por dígito de RUC,
 * tabla completa del cronograma 2026 e hitos fijos del año.
 */

import { useCallback, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import DeadlineConsult from '../DeadlineConsult';
import DeadlineTable from '../DeadlineTable';
import styles from '../../styles/PanelPage.module.css';

/** Hitos que no dependen del dígito del RUC. */
const milestones = [
  { date: 'Mar-Abr 2026', title: 'DJ Anual de Renta — empresas', desc: 'Cronograma General SUNAT: del 26 de marzo al 13 de abril de 2026 según el último dígito del RUC, para empresas fuera del alcance de la Ley N° 31940.' },
  { date: 'May-Jun 2026', title: 'DJ Anual de Renta — personas y MYPE', desc: 'Cronograma ampliado (Ley N° 31940): del 27 de mayo al 10 de junio de 2026 para personas naturales y MYPE con ingresos hasta 1,700 UIT.' },
  { date: 'Mayo', title: 'CTS primer depósito', desc: 'Depósito semestral de la Compensación por Tiempo de Servicios en el banco elegido por el trabajador.' },
  { date: 'Julio', title: 'Gratificaciones de Fiestas Patrias', desc: 'Pago de la primera gratificación (julio) más la bonificación extraordinaria del 9 %, con su aporte a EsSalud.' },
  { date: 'Noviembre', title: 'CTS segundo depósito', desc: 'Segundo depósito semestral de la CTS (mayo y noviembre de cada año).' },
  { date: 'Diciembre', title: 'Gratificaciones de Navidad', desc: 'Segunda gratificación legal más bonificación del 9 %, antes del cierre del ejercicio contable.' },
];

export default function CalendarPanel() {
  const [activeDigit, setActiveDigit] = useState<number | null>(null);

  const handleDigitChange = useCallback((digit: number | null) => setActiveDigit(digit), []);

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <CalendarDays size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>Cronograma SUNAT 2026</h1>
          <p className={styles.sectionLead}>
            Tu vencimiento no es un día fijo del mes: depende del último dígito de
            tu RUC y cambia cada mes. Consulta tus fechas exactas aquí.
          </p>
        </div>
      </header>

      <div className={styles.panel}>
        <DeadlineConsult onDigitChange={handleDigitChange} />
      </div>

      <DeadlineTable activeDigit={activeDigit} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Hitos del año</h2>
        <p className={styles.panelNote}>Obligaciones que no dependen del dígito de tu RUC.</p>
        <div className={styles.timeline}>
          {milestones.map((m) => (
            <article key={m.title} className={styles.milestone}>
              <span className={styles.milestoneDate}>{m.date}</span>
              <h3 className={styles.milestoneTitle}>{m.title}</h3>
              <p className={styles.milestoneText}>{m.desc}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
