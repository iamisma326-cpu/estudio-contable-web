import { MONTH_NAMES, paymentInfo, columnIndex, type MonthRow } from '../data/sunatSchedule';
import { useSunatSchedule } from '../hooks/useSunatSchedule';
import styles from '../styles/DeadlineTable.module.css';

interface Props {
  /** Dígito elegido en el consultor (0-9 o 10 = BC) para resaltar su columna; null = sin resaltado */
  activeDigit: number | null;
}

/** Encabezados de columnas según la publicación oficial SUNAT */
const HEADERS = ['Período', '0', '1', '2 y 3', '4 y 5', '6 y 7', '8 y 9', 'Buenos Contrib. y UESP'];

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

export default function DeadlineTable({ activeDigit }: Props) {
  // Cronograma sincronizado con sunat.gob.pe; embebido 2026 como respaldo
  const schedule = useSunatSchedule();
  const rows: MonthRow[] = schedule?.meses ?? [];
  const ejercicio = schedule?.ejercicio ?? 2026;

  // Índice de columna de fechas resaltada para el dígito activo
  const activeCol = activeDigit === null ? null : columnIndex(activeDigit);

  return (
    <div className={styles.wrapper} data-reveal="fade">
      <div className={styles.scrollHint} aria-hidden="true">
        Desliza para ver todos los dígitos →
      </div>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Cronograma de obligaciones mensuales SUNAT 2026"
        tabIndex={0}
      >
        <table className={styles.table}>
          <caption className="sr-only">
            Cronograma de obligaciones mensuales del ejercicio 2026 según el último
            dígito del RUC. Fuente: SUNAT, Resolución de Superintendencia N° 281-2022.
          </caption>
          <thead>
            <tr>
              {HEADERS.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={activeCol !== null && i > 0 && i - 1 === activeCol ? styles.thActive : undefined}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pay = paymentInfo(row.month, rows);
              return (
                <tr key={row.month}>
                  <th scope="row">{`${MONTHS_SHORT[row.month]}-${row.year}`}</th>
                  {row.deadlines.map((day, i) => (
                    <td key={i} className={activeCol === i ? styles.tdActive : undefined}>
                      {day}{' '}
                      <span className={styles.tdMonth} aria-hidden="true">
                        {MONTHS_SHORT[pay.month]}
                        {pay.year > ejercicio ? ` ${pay.year}` : ''}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        Incluye vencimientos del ITF. Base legal: Anexo I — Resolución de Superintendencia
        N° 281-2022/SUNAT.{' '}
        <a
          href={`https://www.sunat.gob.pe/orientacion/cronogramas/${ejercicio}/cObligacionMensual${ejercicio}.html`}
          target="_blank"
          rel="noreferrer"
        >
          Ver fuente oficial en sunat.gob.pe
        </a>
      </p>
    </div>
  );
}
