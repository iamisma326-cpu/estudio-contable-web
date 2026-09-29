import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { MONTHLY_SCHEDULE_2026, MONTH_NAMES, paymentInfo, todayInLima } from '../data/sunatSchedule';
import styles from '../styles/SeasonBanner.module.css';

/**
 * Banner de temporada: avisa cuando la ventana de vencimientos del
 * período tributario actual está abierta ("Del 17 al 27 de octubre
 * vence el período Setiembre").
 *
 * La ventana se CALCULA desde el cronograma oficial (mínimo y máximo
 * de las fechas de todos los grupos), no se mantiene a mano: si la
 * tabla es correcta, el banner lo es.
 */

interface Window {
  /** Período en texto, ej. "Setiembre 2026" */
  period: string;
  /** Primer día de la ventana de vencimientos */
  from: Date;
  /** Último día de la ventana */
  to: Date;
  /** Días para el cierre de la ventana */
  daysToClose: number;
}

/** Ventana de vencimientos que incluye HOY; null si hoy no hay vencimientos */
function activeWindow(): Window | null {
  const today = todayInLima();

  for (const row of MONTHLY_SCHEDULE_2026) {
    const pay = paymentInfo(row.month);
    const dates = row.deadlines.map((d) => new Date(pay.year, pay.month, d));
    const from = new Date(Math.min(...dates.map((x) => x.getTime())));
    const to = new Date(Math.max(...dates.map((x) => x.getTime())));

    if (today >= from && today <= to) {
      const daysToClose = Math.round((to.getTime() - today.getTime()) / 86400000);
      return {
        period: `${MONTH_NAMES[row.month]} ${row.year}`,
        from,
        to,
        daysToClose,
      };
    }
  }
  return null;
}

/** "27 de octubre" */
function shortDate(d: Date): string {
  return `${d.getDate()} de ${MONTH_NAMES[d.getMonth()].toLowerCase()}`;
}

export default function SeasonBanner() {
  const win = useMemo(activeWindow, []);

  if (!win) return null;

  const isLastDays = win.daysToClose <= 5;

  return (
    <aside
      className={`${styles.banner} ${isLastDays ? styles.bannerUrgent : ''}`}
      role="note"
      aria-label="Aviso de vencimiento SUNAT"
      data-reveal="fade"
    >
      <AlertTriangle size={18} className={styles.icon} aria-hidden="true" />
      <p>
        <strong>
          {isLastDays
            ? `¡Últimos días! Vence el período ${win.period}`
            : `Vence el período ${win.period}`}
        </strong>{' '}
        Del {shortDate(win.from)} al {shortDate(win.to)} se vencen las declaraciones
        mensuales según el último dígito de tu RUC. Revisa tu fecha exacta en el
        cronograma.
      </p>
      <Link to="/recursos" className={styles.link}>
        Ver mi fecha
      </Link>
    </aside>
  );
}
