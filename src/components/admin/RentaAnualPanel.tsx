/**
 * Renta anual del ejercicio (DJ 710).
 *
 * Es la pantalla del cierre: responde cuánto se paga con la declaración jurada
 * anual. A diferencia de la liquidación mensual, aquí el asistente tiene que
 * aportar datos que no están en los comprobantes —gastos deducibles aceptados,
 * pagos a cuenta, pérdidas de años anteriores—, así que la pantalla tiene dos
 * mitades: los números que salen de la base y los que se escriben a mano.
 *
 * Las líneas se muestran en el mismo orden que el formulario. Un importe a pagar
 * sin su desglose no se puede revisar, y esto es lo que se presenta ante SUNAT.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';
import styles from '../../styles/AdminPage.module.css';

interface Linea {
  concepto: string;
  importe: number;
  detalle?: string;
}

interface RespuestaAnual {
  ok: boolean;
  cliente: { ruc: string; razonSocial: string; regimen: string };
  anio: number;
  uit: number;
  ingresosNetos: number;
  comprobantes: { ventas: number; compras: number };
  igv: { ventas: { total: number }; compras: { total: number } };
  datosContador: {
    gastosDeducibles: number;
    adiciones: number;
    perdidasAnteriores: number;
    pagosACuenta: number;
    retenciones: number;
    saldoAFavorAnterior: number;
    gastosRecreativos: number;
  };
  liquidacion: {
    rentaBruta: number;
    rentaNeta: number;
    adiciones: number;
    rentaNetaImponible: number;
    tasaEfectiva: number;
    impuestoCalculado: number;
    creditos: number;
    porRegularizar: number;
    saldoAFavor: number;
    limiteRecreativo: number | null;
    excesoRecreativo: number;
    lineas: Linea[];
    avisos: string[];
  };
  faltantes: string[];
}

/** Soles con dos decimales. */
function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
}

/** Porcentaje con dos decimales, sin ceros de relleno a la derecha. */
function pct(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

const REGIMEN_NOMBRE: Record<string, string> = {
  RER: 'Régimen Especial (RER)',
  RMT: 'Régimen MYPE Tributario (RMT)',
  GENERAL: 'Régimen General',
};

/** Los campos que aporta el contador, en el orden en que se piden. */
const CAMPOS: Array<{ key: keyof RespuestaAnual['datosContador']; label: string; ayuda: string }> = [
  {
    key: 'gastosDeducibles',
    label: 'Gastos deducibles aceptados',
    ayuda: 'Costo computable y gastos del giro. No incluir el IGV que se usa como crédito fiscal.',
  },
  {
    key: 'gastosRecreativos',
    label: 'Gastos recreativos (contabilizados)',
    ayuda: 'El sistema aplica el límite: el menor entre 0.5% de los ingresos y 40 UIT.',
  },
  {
    key: 'adiciones',
    label: 'Otras adiciones',
    ayuda: 'Gastos no deducibles, excesos de límites, diferencias permanentes.',
  },
  {
    key: 'perdidasAnteriores',
    label: 'Pérdidas de ejercicios anteriores',
    ayuda: 'Solo se aplica hasta el monto de la renta del ejercicio.',
  },
  {
    key: 'pagosACuenta',
    label: 'Pagos a cuenta del año',
    ayuda: 'Total efectivamente pagado por los pagos a cuenta mensuales.',
  },
  {
    key: 'retenciones',
    label: 'Retenciones y percepciones',
    ayuda: 'Retenciones del Impuesto a la Renta que le hicieron al cliente.',
  },
  {
    key: 'saldoAFavorAnterior',
    label: 'Saldo a favor de años anteriores',
    ayuda: 'Solo si no se pidió devolución y la declaración no está impugnada.',
  },
];

export default function RentaAnualPanel() {
  const [clientes, setClientes] = useState<Array<{ id: string; ruc: string; razon_social: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [anio, setAnio] = useState(() => String(new Date().getFullYear() - 1));
  const [datos, setDatos] = useState<RespuestaAnual | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Borrador de los campos manuales; se envía con el botón. */
  const [borrador, setBorrador] = useState<Record<string, string>>({});

  const cargarClientes = useCallback(async () => {
    const r = await apiGet<{ clientes: Array<{ id: string; ruc: string; razon_social: string }> }>('/api/clientes');
    if (r.ok && r.data?.clientes) {
      setClientes(r.data.clientes);
      if (r.data.clientes.length === 1) setClienteId(r.data.clientes[0].id);
    }
  }, []);

  useEffect(() => {
    void cargarClientes();
  }, [cargarClientes]);

  const cargar = useCallback(async () => {
    if (!clienteId || !anio) {
      setDatos(null);
      return;
    }
    setCargando(true);
    setError(null);
    const r = await apiGet<RespuestaAnual>(
      `/api/renta-ejercicio?clienteId=${encodeURIComponent(clienteId)}&anio=${encodeURIComponent(anio)}`
    );
    if (r.ok && r.data) {
      setDatos(r.data);
      // El borrador se rellena con lo guardado, para no reescribir cada vez.
      const d = r.data.datosContador;
      const inicial: Record<string, string> = {};
      for (const c of CAMPOS) inicial[c.key] = d[c.key] ? String(d[c.key]) : '';
      setBorrador(inicial);
    } else {
      setError('No se pudo calcular la renta anual.');
    }
    setCargando(false);
  }, [clienteId, anio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Guarda los datos manuales y recalcula.
   *
   * Se envía todo el bloque junto, no campo por campo: los números del
   * formulario dependen unos de otros, y guardar a medias deja una declaración
   * que no cuadra.
   */
  async function guardar() {
    setGuardando(true);
    setError(null);
    setAviso(null);
    const cuerpo: Record<string, unknown> = { clienteId, anio: Number(anio) };
    for (const c of CAMPOS) {
      const v = borrador[c.key];
      // Vacío = cero, no un valor inventado.
      cuerpo[c.key] = v === '' || v === undefined ? 0 : Number(v.replace(',', '.'));
    }
    const r = await apiSend<RespuestaAnual>('/api/renta-ejercicio', 'POST', cuerpo);
    if (r.ok && r.data) {
      setDatos(r.data);
      setAviso('Datos guardados y liquidación recalculada.');
    } else {
      setError('No se pudieron guardar los datos.');
    }
    setGuardando(false);
  }

  const liquidacion = datos?.liquidacion;
  const aPagar = (liquidacion?.porRegularizar ?? 0) > 0;

  return (
    <div className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Renta anual (DJ 710)</h2>
        <p className={styles.muted}>
          Impuesto a la renta del ejercicio. Los ingresos salen de los comprobantes confirmados;
          lo demás lo completa el contador.
        </p>
      </header>

      <div className={styles.filters}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Cliente</span>
          <select className={styles.select} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">— Elegir cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ruc} · {c.razon_social}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Ejercicio</span>
          <input
            className={styles.input}
            type="number"
            min={2000}
            max={2100}
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          />
        </label>
      </div>

      {error && <p className={styles.alert}>{error}</p>}
      {aviso && <p className={`${styles.alert} ${styles.success}`}>{aviso}</p>}
      {cargando && <p className={styles.muted}>Calculando…</p>}

      {!cargando && !datos && clienteId && (
        <p className={styles.muted}>No hay datos para ese ejercicio.</p>
      )}

      {datos && liquidacion && (
        <>
          <div className={styles.cards}>
            <div className={styles.card}>
              <span className={styles.cardLabel}>
                {aPagar ? 'Impuesto por regularizar' : 'Saldo a favor del ejercicio'}
              </span>
              <strong className={styles.cardValue}>
                {money(aPagar ? liquidacion.porRegularizar : liquidacion.saldoAFavor)}
              </strong>
              <span className={styles.cardHint}>
                {REGIMEN_NOMBRE[datos.cliente.regimen] ?? datos.cliente.regimen} · ejercicio {datos.anio}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Renta neta imponible</span>
              <strong className={styles.cardValue}>{money(liquidacion.rentaNetaImponible)}</strong>
              <span className={styles.cardHint}>tasa efectiva {pct(liquidacion.tasaEfectiva)}</span>
            </div>
            <div className={styles.card}>
              <span className={styles.cardLabel}>Impuesto calculado</span>
              <strong className={styles.cardValue}>{money(liquidacion.impuestoCalculado)}</strong>
              <span className={styles.cardHint}>créditos {money(liquidacion.creditos)}</span>
            </div>
          </div>

          {liquidacion.avisos.length > 0 && (
            <ul className={styles.alert} style={{ paddingLeft: 30 }}>
              {liquidacion.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          {datos.faltantes.length > 0 && (
            <ul className={styles.alert} style={{ paddingLeft: 30 }}>
              {datos.faltantes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}

          <h3 className={styles.sectionTitle}>Determinación del impuesto</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {liquidacion.lineas.map((l, i) => (
                <tr key={`${l.concepto}-${i}`}>
                  <td>
                    {l.concepto}
                    {l.detalle && <small className={styles.muted}> · {l.detalle}</small>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{money(l.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {datos && (
        <>
          <h3 className={styles.sectionTitle}>Datos que aporta el contador</h3>
          <p className={styles.muted}>
            No salen de los comprobantes. Se guardan para el ejercicio {datos.anio}.
          </p>
          <div className={styles.form}>
            <div className={styles.formRow} style={{ alignItems: 'end' }}>
              {CAMPOS.map((c) => (
                <label key={c.key} className={styles.fileField} style={{ height: '100%', justifyContent: 'flex-end' }}>
                  <span className={styles.fileLabel}>{c.label}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={borrador[c.key] ?? ''}
                    placeholder="0.00"
                    onChange={(e) => setBorrador((b) => ({ ...b, [c.key]: e.target.value }))}
                  />
                  <small className={styles.muted}>{c.ayuda}</small>
                </label>
              ))}
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="button" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar y recalcular'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
