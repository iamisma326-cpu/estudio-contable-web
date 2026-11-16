/**
 * Consultor de vencimientos: dígito del RUC y tabla del cronograma.
 *
 * Vive aparte de CalendarPanel porque la biblioteca abre esta misma herramienta
 * sin el encabezado de la pestaña. El estado del dígito es local a la
 * herramienta, así que cada sitio que la monta tiene la suya.
 */

import { useCallback, useState } from 'react';
import DeadlineConsult from '../DeadlineConsult';
import DeadlineTable from '../DeadlineTable';
import styles from '../../styles/PanelPage.module.css';

export default function DeadlineTool() {
  const [activeDigit, setActiveDigit] = useState<number | null>(null);

  const handleDigitChange = useCallback((digit: number | null) => setActiveDigit(digit), []);

  return (
    <>
      <div className={styles.panel}>
        <DeadlineConsult onDigitChange={handleDigitChange} />
      </div>

      <DeadlineTable activeDigit={activeDigit} />
    </>
  );
}
