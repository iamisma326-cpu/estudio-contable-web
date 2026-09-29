import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { IconWhatsApp } from './icons/BrandIcons';
import {
  upcomingDeadlines,
  groupLabelFor,
  formatLongDate,
  rentaAnual,
  daysUntil,
  type UpcomingDeadline,
} from '../data/sunatSchedule';
import { useSunatSchedule } from '../hooks/useSunatSchedule';
import { useRentaAnual } from '../hooks/useRentaAnual';
import { whatsappLink } from '../config/contact';
import styles from '../styles/DeadlineConsult.module.css';

/** Valor persistido: "3" (dígito) … "10" (Buenos Contribuyentes) */
const STORAGE_KEY = 'sd-digit';
const BC_VALUE = '10';

const DIGIT_OPTIONS = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
  { value: '8', label: '8' },
  { value: '9', label: '9' },
  { value: BC_VALUE, label: 'Buenos Contribuyentes' },
];

/** RUC válido: 11 dígitos numéricos (el último determina el grupo) */
function isValidRuc(value: string): boolean {
  return /^\d{11}$/.test(value);
}

interface Props {
  /** Callback opcional para que la tabla se resalte con el dígito elegido */
  onDigitChange?: (digit: number | null) => void;
}

export default function DeadlineConsult({ onDigitChange }: Props) {
  const [ruc, setRuc] = useState('');
  const [error, setError] = useState('');
  const [digit, setDigit] = useState<number | null>(null);
  const schedule = useSunatSchedule();
  const rentaData = useRentaAnual();

  // Dígito guardado de una visita anterior
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null && DIGIT_OPTIONS.some((o) => o.value === saved)) {
      const d = Number(saved);
      setDigit(Number.isNaN(d) ? null : d);
    }
  }, []);

  // Sincroniza el resaltado de la tabla con el dígito activo
  useEffect(() => {
    onDigitChange?.(digit);
  }, [digit, onDigitChange]);

  const upcoming = useMemo<UpcomingDeadline[]>(
    () => (digit === null ? [] : upcomingDeadlines(digit, 3, schedule?.meses)),
    [digit, schedule]
  );

  function commit(nextDigit: number | null) {
    setDigit(nextDigit);
    if (nextDigit === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(nextDigit));
    }
  }

  function handleRucSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = ruc.trim();
    if (!isValidRuc(value)) {
      setError('Escribe un RUC de 11 dígitos (solo números).');
      return;
    }
    setError('');
    commit(Number(value[10]));
  }

  function handleRucChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, '').slice(0, 11);
    setRuc(value);
    if (error) setError('');
  }

  function handleDigitClick(value: string) {
    commit(value === BC_VALUE ? 10 : Number(value));
  }

  function handleReset() {
    setRuc('');
    setError('');
    commit(null);
  }

  const waMessage =
    digit === null
      ? undefined
      : `Hola Sánchez Delgado & Asociados, mi RUC termina en ${groupLabelFor(digit)}. ¿Me confirman mi cronograma de vencimientos?`;

  const renta = useMemo(
    () => (digit === null ? null : rentaAnual(digit, rentaData.general, rentaData.ampliado)),
    [digit, rentaData]
  );

  return (
    <div className={styles.card}>
      <div className={styles.controls}>
        <form className={styles.rucForm} onSubmit={handleRucSubmit}>
          <label className={styles.rucLabel} htmlFor="ruc-input">
            Escribe tu RUC
          </label>
          <div className={styles.rucField}>
            <input
              id="ruc-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej. 20512345678"
              value={ruc}
              onChange={handleRucChange}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'ruc-error' : undefined}
              className={styles.rucInput}
            />
            <button type="submit" className={styles.rucBtn}>
              Ver mis fechas <ArrowRight size={16} />
            </button>
          </div>
          {error && (
            <p className={styles.rucError} id="ruc-error" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className={styles.orDivider}>
          <span>o elige el último dígito</span>
        </div>

        <div className={styles.digitPicker} role="group" aria-label="Último dígito del RUC">
          {DIGIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.digitBtn} ${digit !== null && String(digit) === opt.value ? styles.digitBtnActive : ''}`}
              aria-pressed={digit !== null && String(digit) === opt.value}
              onClick={() => handleDigitClick(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {digit !== null && (
        <div className={styles.result} aria-live="polite">
          <div className={styles.resultHead}>
            <p className={styles.resultGroup}>
              <Check size={15} /> Grupo <strong>{groupLabelFor(digit)}</strong>
            </p>
            <button type="button" className={styles.resetBtn} onClick={handleReset}>
              <RotateCcw size={14} /> Cambiar dígito
            </button>
          </div>

          {upcoming.length > 0 ? (
            <>
              <ul className={styles.deadlineList}>
                {upcoming.map((d, i) => (
                  <li key={d.periodLabel} className={i === 0 ? styles.deadlineMain : undefined}>
                    <div className={styles.deadlineInfo}>
                      <span className={styles.deadlinePeriod}>
                        {i === 0 ? 'Próximo período: ' : ''}
                        {d.periodLabel}
                      </span>
                      <span className={styles.deadlineDate}>{formatLongDate(d.dueDate)}</span>
                    </div>
                    <span
                      className={i === 0 ? styles.countdownMain : styles.countdown}
                      aria-label={`Faltan ${d.daysLeft} días`}
                    >
                      {d.daysLeft === 0 ? '¡Hoy!' : `${d.daysLeft} días`}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                className={styles.waBtn}
                href={whatsappLink(waMessage)}
                target="_blank"
                rel="noreferrer"
              >
                <IconWhatsApp size={17} /> Confirma tu cronograma completo por WhatsApp
              </a>
            </>
          ) : (
            <p className={styles.finishedNote}>
              El ejercicio 2026 ya venció por completo para tu grupo. Escríbenos y te
              ayudamos a ponerte al día.
            </p>
          )}

          {renta && (
            <div className={styles.rentaBlock}>
              <h4 className={styles.rentaTitle}>
                <Link to="/renta-anual-2025">Declaración Anual de Renta {rentaData.ejercicio} →</Link>
              </h4>
              <div className={styles.rentaGrid}>
                <div className={styles.rentaCard}>
                  <span className={styles.rentaLabel}>Empresas · Cronograma General</span>
                  <strong className={daysUntil(renta.general) < 0 ? styles.rentaPast : undefined}>
                    {formatLongDate(renta.general)}
                  </strong>
                  <span className={styles.rentaHint}>Fuera del alcance de la Ley N° 31940</span>
                </div>
                <div className={styles.rentaCard}>
                  <span className={styles.rentaLabel}>Personas y MYPE · Ampliado</span>
                  <strong className={daysUntil(renta.ampliado) < 0 ? styles.rentaPast : undefined}>
                    {formatLongDate(renta.ampliado)}
                  </strong>
                  <span className={styles.rentaHint}>Ley N° 31940, ingresos hasta 1,700 UIT</span>
                </div>
              </div>
              <p className={styles.rentaNote}>
                Cuál te aplica depende de tu régimen: las empresas fuera del alcance de
                la Ley N° 31940 declaran en el cronograma general; las personas naturales
                y las MYPE con ingresos {rentaData.ejercicio - 1} de hasta 1,700 UIT, en
                el ampliado. El Formulario 710 suele estar disponible desde inicios de
                enero y el 709 desde fines de marzo — confirmamos disponibilidad de cada
                año en la{' '}
                <Link to="/renta-anual-2025" className={styles.rentaNoteLink}>
                  guía de Renta Anual
                </Link>
                .
              </p>
            </div>
          )}

          <p className={styles.legalNote}>
            Incluye PDT 621, PLAME, SIRE/PLE e ITF. Fuente: cronograma oficial SUNAT 2026
            (RS 281-2022). Las fechas pueden variar por disposiciones posteriores.
          </p>
        </div>
      )}
    </div>
  );
}
