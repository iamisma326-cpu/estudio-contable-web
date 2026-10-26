import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RotateCcw } from 'lucide-react';
import {
  ETAPAS,
  GRUPOS,
  INFRACCIONES,
  REGIMENES_MULTA,
  calcularMulta,
  distinguePago,
  escalonesDe,
  infraccionPorId,
  type Escalon,
  type RegimenId,
} from '../data/multas';
import { UIT_2026, formatSoles } from '../data/regimenes';
import { whatsappLink } from '../config/contact';
import { IconWhatsApp } from './icons/BrandIcons';
import styles from '../styles/MultaCalculator.module.css';

/**
 * Calculadora de multas de SUNAT.
 *
 * Elige la infracción, tu régimen y la etapa en la que estás: devuelve la
 * sanción que fija la tabla del Código Tributario y cuánto queda después de
 * la gradualidad. Las tasas y los porcentajes de rebaja viven en
 * `src/data/multas.ts`, con la fuente de cada uno.
 */
export default function MultaCalculator() {
  const [infraccionId, setInfraccionId] = useState(INFRACCIONES[0].id);
  const [regimen, setRegimen] = useState<RegimenId>('general');
  const [ingresos, setIngresos] = useState('');
  const [tributo, setTributo] = useState('');
  const [escalonId, setEscalonId] = useState<string | null>(null);
  const [conPago, setConPago] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const infraccion = infraccionPorId(infraccionId) ?? INFRACCIONES[0];
  const esFrecuencia = infraccion.sancion.tipo === 'frecuencia';
  const ingNum = Number(ingresos.replace(/[^\d]/g, '')) || 0;
  const tribNum = Number(tributo.replace(/[^\d]/g, '')) || 0;

  const pideIngresos = infraccion.sancion.tipo === 'ingresos' || Boolean(infraccion.tramos);
  const pideTributo = infraccion.sancion.tipo === 'tributo';

  const { tramo, escalones } = useMemo(
    () => escalonesDe(infraccion, regimen, ingNum),
    [infraccion, regimen, ingNum]
  );

  const escalon = escalones.find((e) => e.id === escalonId) ?? null;

  const valido =
    (!pideIngresos || ingNum > 0) &&
    (!pideTributo || tribNum > 0) &&
    (!esFrecuencia || escalon !== null);

  const resultado = useMemo(
    () =>
      submitted && valido
        ? calcularMulta({
            infraccionId: infraccion.id,
            regimen,
            ingresosNetos: ingNum,
            tributo: tribNum,
            escalonId,
            conPago,
          })
        : null,
    [submitted, valido, infraccion.id, regimen, ingNum, tribNum, escalonId, conPago]
  );

  /** Cambiar de infracción reinicia la etapa elegida (los montos se conservan) */
  function handleInfraccion(id: string) {
    const next = infraccionPorId(id);
    setInfraccionId(id);
    setEscalonId(next?.sancion.tipo === 'frecuencia' ? next.escalones?.[0].id ?? null : null);
    setConPago(true);
    setSubmitted(false);
  }

  function handleReset() {
    setInfraccionId(INFRACCIONES[0].id);
    setRegimen('general');
    setIngresos('');
    setTributo('');
    setEscalonId(null);
    setConPago(true);
    setSubmitted(false);
  }

  const nombreRegimen = REGIMENES_MULTA.find((r) => r.id === regimen)?.nombre ?? '';
  const waMessage = `Hola Sánchez Delgado & Asociados, usé la calculadora de multas de su web (${infraccion.referencia}, ${nombreRegimen}${
    escalon ? `, ${ETAPAS[escalon.etapa].toLowerCase()}` : ''
  }). Quiero la revisión de mi caso.`;

  const porGrupo = GRUPOS.map((g) => ({
    ...g,
    items: INFRACCIONES.filter((i) => i.grupo === g.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div className={styles.card}>
      {/* El formulario se mantiene a la vista para poder probar otros escenarios */}
      <form
        className={styles.form}
        onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        }}
      >
        {/* 1. Infracción */}
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="multa-infraccion">
            ¿Qué infracción te notificó SUNAT?
          </label>
          <select
            id="multa-infraccion"
            className={styles.select}
            value={infraccionId}
            onChange={(e) => handleInfraccion(e.target.value)}
          >
            {porGrupo.map((g) => (
              <optgroup key={g.id} label={g.nombre}>
                {g.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.titulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className={styles.infraccionMeta}>
            <span className={styles.referencia}>{infraccion.referencia}</span>
            {infraccion.detalle}
          </p>
        </div>

        {/* 2. Régimen */}
        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tu régimen tributario</span>
            <select
              className={styles.select}
              value={regimen}
              onChange={(e) => {
                setRegimen(e.target.value as RegimenId);
                setSubmitted(false);
              }}
            >
              {REGIMENES_MULTA.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>

          {pideIngresos && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Ingresos netos anuales <small>(ejercicio anterior, sin IGV)</small>
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={styles.input}
                placeholder="Ej. 320000"
                value={ingresos}
                onChange={(e) => {
                  setIngresos(e.target.value.replace(/[^\d.,]/g, ''));
                  setSubmitted(false);
                }}
              />
            </label>
          )}

          {pideTributo && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {infraccion.id === 'pago-178-4' ? 'Tributo retenido o percibido no pagado' : 'Tributo por pagar omitido'}{' '}
                <small>(sin intereses)</small>
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={styles.input}
                placeholder="Ej. 18000"
                value={tributo}
                onChange={(e) => {
                  setTributo(e.target.value.replace(/[^\d.,]/g, ''));
                  setSubmitted(false);
                }}
              />
            </label>
          )}
        </div>

        {/* 3. Etapa de subsanación */}
        <fieldset className={styles.etapas}>
          <legend className={styles.fieldLabel}>
            {esFrecuencia ? '¿Cuántas veces te han sancionado por lo mismo?' : '¿En qué etapa estás?'}
          </legend>

          {!esFrecuencia && (
            <label className={`${styles.etapa} ${escalonId === null ? styles.etapaActive : ''}`}>
              <input
                type="radio"
                name="escalon"
                checked={escalonId === null}
                onChange={() => {
                  setEscalonId(null);
                  setSubmitted(false);
                }}
              />
              <span className={styles.etapaBody}>
                <strong>Aún no subsané nada</strong>
                <span className={styles.etapaDetalle}>
                  La multa completa de la tabla, sin ninguna rebaja. Útil para saber cuánto te costaría no hacer nada.
                </span>
              </span>
            </label>
          )}

          {escalones.map((e: Escalon) => (
            <label key={e.id} className={`${styles.etapa} ${escalonId === e.id ? styles.etapaActive : ''}`}>
              <input
                type="radio"
                name="escalon"
                checked={escalonId === e.id}
                onChange={() => {
                  setEscalonId(e.id);
                  setSubmitted(false);
                }}
              />
              <span className={styles.etapaBody}>
                <strong>{e.titulo}</strong>
                <span className={styles.etapaDetalle}>{e.detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* 4. Pago */}
        {escalon && distinguePago(escalon) && (
          <label className={styles.pagoToggle}>
            <input
              type="checkbox"
              checked={conPago}
              onChange={(e) => {
                setConPago(e.target.checked);
                setSubmitted(false);
              }}
            />
            <span>
              Pagaría la multa rebajada dentro del plazo <small>(el pago es requisito para la rebaja)</small>
            </span>
          </label>
        )}

        <div className={styles.actions}>
        <button type="submit" className={styles.submitBtn} disabled={!valido}>
          Calcular mi multa <ArrowRight size={16} />
        </button>
        <button type="button" className={styles.resetBtn} onClick={handleReset}>
          <RotateCcw size={15} /> Empezar de nuevo
        </button>
        </div>

        <p className={styles.note}>
        Estimación referencial con la UIT {new Date().getFullYear()} de {formatSoles(UIT_2026)}. El monto exacto
        depende de la UIT vigente al momento en que se cometió la infracción, de las fechas de cada notificación y
        del criterio de SUNAT sobre la etapa en que te encuentras.
        </p>
      </form>

      {resultado && (
        <div className={styles.results} aria-live="polite">
          <div className={styles.resultHead}>
            <div>
              <span className={styles.resultTag}>{resultado.infraccion.referencia}</span>
              <h4 className={styles.resultTitle}>{resultado.infraccion.titulo}</h4>
            </div>
          </div>

          <p className={styles.resultMain}>
            <strong>{formatSoles(resultado.multa)}</strong>
            <span>multa estimada a pagar</span>
          </p>

          <dl className={styles.breakdown}>
            <div className={styles.breakdownRow}>
              <dt>Sanción según la tabla</dt>
              <dd>
                {formatSoles(resultado.sancion)}
                <span className={styles.breakdownNote}>
                  {resultado.sancionDetalle}
                  {resultado.topeBase === 'minimo' && ' · se aplicó el tope mínimo legal'}
                  {resultado.topeBase === 'maximo' && ' · se aplicó el tope máximo legal'}
                </span>
              </dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>Etapa</dt>
              <dd>
                {resultado.escalon ? ETAPAS[resultado.escalon.etapa] : 'Sin acogerme a la gradualidad'}
                {resultado.escalon && <span className={styles.breakdownNote}>{resultado.escalon.titulo}</span>}
              </dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>Rebaja aplicada</dt>
              <dd>
                {resultado.rebaja} %{resultado.ahorro > 0 && <span className={styles.breakdownNote}>Ahorras {formatSoles(resultado.ahorro)}</span>}
              </dd>
            </div>
            {resultado.tramo && (
              <div className={styles.breakdownRow}>
                <dt>Tramo de ingresos</dt>
                <dd>{resultado.tramo.etiqueta}</dd>
              </div>
            )}
            <div className={styles.breakdownRow}>
              <dt>Tabla aplicable</dt>
              <dd>
                Tabla {resultado.tabla} del Código Tributario
                <span className={styles.breakdownNote}>{nombreRegimen}</span>
              </dd>
            </div>
          </dl>

          {resultado.bajoMinimo && (
            <p className={styles.warning}>
              El monto queda por debajo del 5 % de la UIT. Ese piso se aplica cuando pagas la multa después de que surta
              efecto la notificación de la resolución de multa: si pagas antes, la rebaja se mantiene tal cual.
            </p>
          )}

          {resultado.infraccion.notas.length > 0 && (
            <ul className={styles.notesList}>
              {resultado.infraccion.notas.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <p className={styles.fuente}>Fuente: {resultado.infraccion.fuente}</p>

          <div className={styles.ctaRow}>
            <Link to="/contacto" className={styles.ctaDark}>
              Que revisemos tu caso <ArrowRight size={15} />
            </Link>
            <a href={whatsappLink(waMessage)} target="_blank" rel="noreferrer" className={styles.ctaWa}>
              <IconWhatsApp size={16} /> Consultar por WhatsApp
            </a>
          </div>

          <p className={styles.finePrint}>
            Esta estimación no reemplaza el análisis del expediente: los plazos de cada etapa sí cambian el resultado y
            hay supuestos (comiso, cierre, tributo omitido por tipo de tributo) que requieren revisar tus
            declaraciones.{' '}
            <Link to="/servicios" className={styles.fineLink}>
              Ver servicios de asesoría tributaria
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
