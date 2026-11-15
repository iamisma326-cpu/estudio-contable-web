/**
 * Liquidación mensual: IGV (FD 0621) y pago a cuenta de renta.
 *
 * Es la pantalla que el asistente abre al cerrar el mes, y responde una sola
 * pregunta: cuánto se paga. Por eso el número grande es el resultado del IGV y
 * debajo va la resta completa —ventas, compras, saldo anterior— porque un total
 * sin su resta no se puede revisar.
 *
 * Los avisos no son decoración: si el período anterior no declara saldo a favor,
 * o hay comprobantes sin confirmar, el número de arriba está incompleto y hay
 * que saberlo antes de declarar, no después.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiDescargar, apiGet } from '../../lib/api';
import styles from '../../styles/AdminPage.module.css';

interface Concepto {
  baseGravada: number;
  igv: number;
  exonerado: number;
  inafecto: number;
  total: number;
  cantidad: number;
}

interface RespuestaLiquidacion {
  ok: boolean;
  cliente: { ruc: string; razonSocial: string; regimen: string };
  periodo: string;
  periodoEstado: string;
  igv: {
    ventas: Concepto;
    compras: Concepto;
    resultadoIGV: number;
    saldoAnterior: number;
    saldoAFavor: number;
    igvAPagar: number;
  };
  renta: { ingresosNetos: number; tasa: number; monto: number; criterio: string; regimen: string };
  uit: number;
  avisos: string[];
}

/** Soles con dos decimales. */
function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
}

const REGIMEN_NOMBRE: Record<string, string> = {
  RER: 'Régimen Especial (RER)',
  RMT: 'Régimen MYPE Tributario (RMT)',
  GENERAL: 'Régimen General',
};

export default function LiquidacionPanel() {
  const [clientes, setClientes] = useState<Array<{ id: string; ruc: string; razon_social: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [datos, setDatos] = useState<RespuestaLiquidacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);

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
    if (!clienteId || !periodo) {
      setDatos(null);
      return;
    }
    setCargando(true);
    setError(null);
    const r = await apiGet<RespuestaLiquidacion>(
      `/api/liquidacion?clienteId=${encodeURIComponent(clienteId)}&periodo=${encodeURIComponent(periodo)}`
    );
    if (r.ok && r.data) setDatos(r.data);
    else setError('No se pudo calcular la liquidación.');
    setCargando(false);
  }, [clienteId, periodo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Descarga el libro del mes. El nombre lo pone el servidor.
   *
   * Se descarga desde esta pantalla y no desde la de comprobantes porque es
   * aquí donde el asistente ya tiene los números a la vista: bajar el Excel
   * desde el sitio donde se revisa el resultado evita el salto a otra pestaña.
   */
  async function descargarLibro() {
    setDescargando(true);
    setErrorExcel(null);
    try {
      const r = await apiDescargar(
        `/api/libro?clienteId=${encodeURIComponent(clienteId)}&periodo=${encodeURIComponent(periodo)}&descargar=1`
      );
      if (!r.ok || !r.blob) {
        setErrorExcel(
          r.status === 403 ? 'No tienes permiso para descargar el libro.' : 'No se pudo generar el Excel.'
        );
        return;
      }
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.nombre ?? `libro-${periodo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  const l = datos;
  const aPagar = l ? l.igv.igvAPagar + l.renta.monto : 0;

  return (
    <div>
      <div className={styles.filters}>
        <select className={styles.select} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Elige cliente…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razon_social} ({c.ruc})
            </option>
          ))}
        </select>
        <input className={styles.input} type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
      </div>

      {error && <p className={styles.alert}>{error}</p>}
      {cargando && <p className={styles.muted}>Calculando…</p>}

      {!clienteId && !cargando && (
        <p className={styles.muted} style={{ marginTop: 16 }}>
          Elige un cliente para ver su liquidación del mes.
        </p>
      )}

      {l && !cargando && (
        <>
          <div className={styles.panel} style={{ marginTop: 16 }}>
            <h3 className={styles.panelTitle}>
              Total a pagar · {l.periodo}
              {l.periodoEstado === 'cerrado' && ' · período cerrado'}
            </h3>
            <div className={styles.cards} style={{ marginTop: 12 }}>
              <div className={styles.card}>
                <span className={styles.cardLabel}>IGV a pagar</span>
                <span className={styles.cardValue}>{money(l.igv.igvAPagar)}</span>
                <span className={styles.cardHint}>
                  {l.igv.saldoAFavor > 0 ? `Saldo a favor: ${money(l.igv.saldoAFavor)}` : 'Formulario 0621'}
                </span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Pago a cuenta de renta</span>
                <span className={styles.cardValue}>{money(l.renta.monto)}</span>
                <span className={styles.cardHint}>
                  {(l.renta.tasa * 100).toFixed(1)}% de {money(l.renta.ingresosNetos)}
                  {l.renta.criterio === 'coeficiente' && ' · coeficiente'}
                </span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Total del mes</span>
                <span className={styles.cardValue}>{money(aPagar)}</span>
                <span className={styles.cardHint}>{REGIMEN_NOMBRE[l.cliente.regimen] ?? l.cliente.regimen}</span>
              </div>
            </div>

            {errorExcel && <p className={styles.alert}>{errorExcel}</p>}
            <button
              type="button"
              className={styles.miniBtn}
              style={{ marginTop: 12 }}
              disabled={descargando}
              onClick={() => void descargarLibro()}
            >
              {descargando ? 'Generando…' : 'Descargar Excel del mes'}
            </button>
            <p className={styles.muted} style={{ marginTop: 8 }}>
              Cinco hojas: Ventas, Compras, Diario, Resumen y Pendientes (las facturas que no
              entraron al libro).
            </p>
          </div>

          {/* La resta completa, para poder revisarla. */}
          <div className={styles.panel} style={{ marginTop: 16 }}>
            <h3 className={styles.panelTitle}>Cómo sale el IGV</h3>
            <div className={styles.tableWrap} style={{ marginTop: 12 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th style={{ textAlign: 'right' }}>Base</th>
                    <th style={{ textAlign: 'right' }}>IGV</th>
                    <th style={{ textAlign: 'right' }}>Docs.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Ventas del mes</td>
                    <td style={{ textAlign: 'right' }}>{money(l.igv.ventas.baseGravada)}</td>
                    <td style={{ textAlign: 'right' }}>{money(l.igv.ventas.igv)}</td>
                    <td style={{ textAlign: 'right' }}>{l.igv.ventas.cantidad}</td>
                  </tr>
                  <tr>
                    <td>Compras (crédito fiscal)</td>
                    <td style={{ textAlign: 'right' }}>{money(l.igv.compras.baseGravada)}</td>
                    <td style={{ textAlign: 'right' }}>−{money(l.igv.compras.igv)}</td>
                    <td style={{ textAlign: 'right' }}>{l.igv.compras.cantidad}</td>
                  </tr>
                  <tr>
                    <td>Saldo a favor del mes anterior</td>
                    <td style={{ textAlign: 'right' }} />
                    <td style={{ textAlign: 'right' }}>−{money(l.igv.saldoAnterior)}</td>
                    <td style={{ textAlign: 'right' }} />
                  </tr>
                  <tr>
                    <td>
                      <strong>Resultado</strong>
                    </td>
                    <td style={{ textAlign: 'right' }} />
                    <td style={{ textAlign: 'right' }}>
                      <strong>{money(l.igv.resultadoIGV)}</strong>
                    </td>
                    <td style={{ textAlign: 'right' }} />
                  </tr>
                </tbody>
              </table>
            </div>

            {(l.igv.ventas.exonerado > 0 || l.igv.ventas.inafecto > 0) && (
              <p className={styles.muted} style={{ marginTop: 12 }}>
                Además, ventas sin IGV: exonerado {money(l.igv.ventas.exonerado)}, inafecto{' '}
                {money(l.igv.ventas.inafecto)}. Suman al total facturado pero no generan impuesto.
              </p>
            )}

            {l.igv.resultadoIGV < 0 && (
              <p className={styles.muted} style={{ marginTop: 8 }}>
                El resultado es negativo: no se paga IGV este mes y {money(l.igv.saldoAFavor)} quedan a favor
                para el mes siguiente.
              </p>
            )}
          </div>

          {l.avisos.length > 0 && (
            <div className={styles.panel} style={{ marginTop: 16 }}>
              <h3 className={styles.panelTitle}>Antes de declarar</h3>
              <ul style={{ margin: '12px 0 0', paddingLeft: 20 }}>
                {l.avisos.map((a, i) => (
                  <li key={i} className={styles.muted} style={{ marginBottom: 6 }}>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className={styles.muted} style={{ marginTop: 16 }}>
            Este cálculo no presenta nada ante SUNAT. Se llena el Formulario 0621 en SUNAT Operaciones en
            Línea con estos números, después de revisar los avisos.
          </p>
        </>
      )}
    </div>
  );
}
