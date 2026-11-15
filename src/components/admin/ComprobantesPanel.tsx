/**
 * Bandeja de comprobantes: subir XML, revisar lo leído y confirmar.
 *
 * Es la cara visible del pipeline (XML → validar → asiento → base). El trabajo
 * pesado está en la API; aquí solo se muestra y se decide.
 *
 * Principio de la pantalla: el asistente ve SIEMPRE lo que se leyó antes de que
 * nada se guarde. Por eso subir y guardar son dos pasos — primero "Leer", que no
 * escribe nada, y luego "Guardar" cuando la lectura cuadra. Un comprobante con
 * errores no se puede guardar: el botón queda deshabilitado y se explica por qué.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';
import styles from '../../styles/AdminPage.module.css';

// --- Tipos que devuelve /api/comprobantes -----------------------------------

interface Hallazgo {
  codigo: string;
  gravedad: 'error' | 'aviso';
  campo?: string;
  mensaje: string;
}

interface ComprobanteLeido {
  tipo: string;
  operacion: 'venta' | 'compra';
  serie: string | null;
  numero: string | null;
  fechaEmision: string | null;
  rucEmisor: string | null;
  razonEmisor: string | null;
  moneda: string;
  tipoCambio: number | null;
  base: number;
  igv: number;
  exonerado: number;
  total: number;
  origen: string;
  confianza: number;
  estado: string;
  hallazgos: Hallazgo[];
  avisos: string[];
}

interface LecturaRespuesta {
  comprobante: ComprobanteLeido;
  resumen: string;
  yaExiste: boolean;
  guardado: boolean;
  error?: string;
  comprobanteId?: string;
}

interface FilaComprobante {
  id: string;
  tipo: string;
  operacion: string;
  serie: string | null;
  numero: string | null;
  fecha_emision: string | null;
  razon_emisor: string | null;
  ruc_emisor: string | null;
  moneda: string;
  total: string | number | null;
  estado: string;
  origen: string;
}

interface Totales {
  ventas: { base: number; igv: number; total: number; cantidad: number };
  compras: { base: number; igv: number; total: number; cantidad: number };
}

interface ListaRespuesta {
  comprobantes: FilaComprobante[];
  totales: Totales;
}

// --- Utilidades --------------------------------------------------------------

function money(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `S/ ${n.toFixed(2)}`;
}

function fecha(v: string | null): string {
  if (!v) return '—';
  return new Date(v + 'T00:00:00').toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function tipoLabel(t: string): string {
  const map: Record<string, string> = {
    factura: 'Factura',
    boleta: 'Boleta',
    nota_credito: 'Nota de crédito',
    nota_debito: 'Nota de débito',
  };
  return map[t] ?? t;
}

function estadoLabel(e: string): string {
  const map: Record<string, string> = {
    pendiente: 'Pendiente',
    revisado: 'Revisado',
    confirmado: 'Confirmado',
    descartado: 'Descartado',
  };
  return map[e] ?? e;
}

/**
 * Prepara el cuerpo del POST según el tipo de archivo.
 *
 * El XML se manda como texto. El PDF se manda en base64 porque el navegador no
 * puede extraer su texto sin cargar pdfjs en el bundle; el servidor ya lo tiene
 * para la herramienta de edición y lo procesa allí.
 */
async function prepararCuerpo(file: File): Promise<{ xml?: string; pdfBase64?: string }> {
  const esPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!esPDF) return { xml: await file.text() };

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binario = '';
  // Por bloques: String.fromCharCode(...bytes) con un PDF grande revienta la pila.
  const TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return { pdfBase64: btoa(binario) };
}

// --- Componente --------------------------------------------------------------

export default function ComprobantesPanel() {
  // Clientes: un comprobante pertenece siempre a un contribuyente.
  const [clientes, setClientes] = useState<Array<{ id: string; ruc: string; razon_social: string }>>([]);
  const [clienteId, setClienteId] = useState('');
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));

  // Lectura del XML (paso 1, no escribe nada).
  const [lectura, setLectura] = useState<LecturaRespuesta | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lista del período (paso 2).
  const [lista, setLista] = useState<ListaRespuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const cargarClientes = useCallback(async () => {
    const r = await apiGet<{ clientes: Array<{ id: string; ruc: string; razon_social: string }> }>(
      '/api/clientes'
    );
    if (r.ok && r.data?.clientes) {
      setClientes(r.data.clientes);
      // Si hay un solo cliente, se elige solo: evita un clic inútil.
      if (r.data.clientes.length === 1) setClienteId(r.data.clientes[0].id);
    }
  }, []);

  useEffect(() => {
    void cargarClientes();
  }, [cargarClientes]);

  /**
   * El endpoint lista por periodoId (uuid), no por año-mes. Se busca el período
   * en la lista del cliente; si no existe todavía, la lista está vacía y no se
   * pide nada (no hay nada que listar).
   */
  const cargarLista = useCallback(async () => {
    if (!clienteId || !periodo) {
      setLista(null);
      return;
    }
    setCargando(true);
    setErrorLista(null);
    const p = await apiGet<{ periodos: Array<{ id: string; anio: number; mes: number }> }>(
      `/api/periodos?clienteId=${encodeURIComponent(clienteId)}`
    );
    if (!p.ok) {
      setErrorLista('No se pudieron cargar los períodos.');
      setCargando(false);
      return;
    }
    const [anio, mes] = periodo.split('-').map(Number);
    const encontrado = p.data?.periodos?.find((x) => x.anio === anio && x.mes === mes);
    if (!encontrado) {
      // Sin período creado no hay comprobantes: es un estado normal, no un error.
      setLista({ comprobantes: [], totales: { ventas: { base: 0, igv: 0, total: 0, cantidad: 0 }, compras: { base: 0, igv: 0, total: 0, cantidad: 0 } } });
      setCargando(false);
      return;
    }
    const r = await apiGet<ListaRespuesta>(`/api/comprobantes?periodoId=${encontrado.id}`);
    if (r.ok && r.data) setLista(r.data);
    else setErrorLista('No se pudo cargar la lista de comprobantes.');
    setCargando(false);
  }, [clienteId, periodo]);

  useEffect(() => {
    void cargarLista();
  }, [cargarLista]);

  /** Paso 1: leer el archivo. No guarda nada. */
  async function leerArchivo(file: File) {
    setErrorLectura(null);
    setLectura(null);
    if (!clienteId) {
      setErrorLectura('Elige primero el cliente.');
      return;
    }
    setLeyendo(true);
    try {
      const cuerpo = await prepararCuerpo(file);
      const r = await apiSend<LecturaRespuesta>('/api/comprobantes', 'POST', { clienteId, periodo, ...cuerpo });
      if (r.data) setLectura(r.data);
      if (!r.ok) {
        setErrorLectura(r.data?.error ?? 'No se pudo leer el comprobante.');
      }
    } catch {
      setErrorLectura('No se pudo leer el archivo.');
    } finally {
      setLeyendo(false);
    }
  }

  /** Paso 2: guardar lo que ya se revisó. */
  async function guardar() {
    if (!fileRef.current?.files?.[0]) return;
    setLeyendo(true);
    try {
      const cuerpo = await prepararCuerpo(fileRef.current.files[0]);
      const r = await apiSend<LecturaRespuesta & { comprobanteId?: string }>(
        '/api/comprobantes',
        'POST',
        { clienteId, periodo, ...cuerpo, guardar: true, guardarAsiento: true }
      );
      if (r.ok) {
        setLectura(null);
        if (fileRef.current) fileRef.current.value = '';
        await cargarLista();
      } else {
        setErrorLectura(r.data?.error ?? 'No se pudo guardar el comprobante.');
      }
    } finally {
      setLeyendo(false);
    }
  }

  async function accion(id: string, action: 'confirmar' | 'descartar') {
    setOcupadoId(id);
    const r = await apiSend(`/api/comprobantes`, 'PATCH', { id, action });
    if (!r.ok) setErrorLista(r.data && typeof r.data === 'object' && 'error' in r.data
      ? String((r.data as { error: string }).error)
      : 'No se pudo actualizar el comprobante.');
    await cargarLista();
    setOcupadoId(null);
  }

  const hayErrores = lectura?.comprobante.hallazgos.some((h) => h.gravedad === 'error') ?? false;
  const puedeGuardar = !!lectura && !hayErrores && !lectura.yaExiste && !lectura.guardado;

  return (
    <div>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Comprobantes</h2>
        <p className={styles.muted}>
          Sube el XML o el PDF que envió el proveedor. Se lee y se valida antes de guardar nada.
        </p>
      </div>

      {/* --- Filtros: cliente y período --- */}
      <div className={styles.filters}>
        <select
          className={styles.select}
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
        >
          <option value="">Elige cliente…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razon_social} ({c.ruc})
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        />
      </div>

      {/* --- Subida y lectura --- */}
      <div className={styles.panel} style={{ marginTop: 16 }}>
        <h3 className={styles.panelTitle}>Subir factura (XML o PDF)</h3>
        <div className={styles.formRow}>
          <input
            ref={fileRef}
            className={styles.fileInput}
            type="file"
            accept=".xml,.pdf,text/xml,application/xml,application/pdf"
            disabled={!clienteId || leyendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void leerArchivo(f);
            }}
          />
        </div>

        {errorLectura && <p className={styles.alert}>{errorLectura}</p>}
        {leyendo && <p className={styles.muted}>Leyendo…</p>}

        {lectura && !lectura.guardado && (
          <div style={{ marginTop: 16 }}>
            <p className={styles.cellTitle}>{lectura.resumen}</p>

            <div className={styles.cards} style={{ marginTop: 12 }}>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Base</span>
                <span className={styles.cardValue}>{money(lectura.comprobante.base)}</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardLabel}>IGV</span>
                <span className={styles.cardValue}>{money(lectura.comprobante.igv)}</span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Total</span>
                <span className={styles.cardValue}>{money(lectura.comprobante.total)}</span>
              </div>
              {lectura.comprobante.tipoCambio && (
                <div className={styles.card}>
                  <span className={styles.cardLabel}>Tipo de cambio</span>
                  <span className={styles.cardValue}>{lectura.comprobante.tipoCambio}</span>
                  <span className={styles.cardHint}>{lectura.comprobante.moneda} → PEN</span>
                </div>
              )}
            </div>

            <p className={styles.listMeta} style={{ marginTop: 12 }}>
              {tipoLabel(lectura.comprobante.tipo)} · {lectura.comprobante.serie}-{lectura.comprobante.numero} ·{' '}
              {fecha(lectura.comprobante.fechaEmision)} ·{' '}
              {lectura.comprobante.operacion === 'venta' ? 'Venta' : 'Compra'}
            </p>

            {lectura.yaExiste && (
              <p className={styles.alert}>Este comprobante ya está registrado en el período.</p>
            )}

            {lectura.comprobante.hallazgos.length > 0 && (
              <ul className={styles.list} style={{ marginTop: 12 }}>
                {lectura.comprobante.hallazgos.map((h, i) => (
                  <li key={i} className={styles.listItem}>
                    <div className={styles.listMain}>
                      <span className={h.gravedad === 'error' ? styles.alert : styles.muted}>
                        {h.gravedad === 'error' ? 'Error' : 'Aviso'}: {h.mensaje}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {lectura.comprobante.avisos.length > 0 && (
              <ul className={styles.list}>
                {lectura.comprobante.avisos.map((a, i) => (
                  <li key={i} className={styles.listItem}>
                    <span className={styles.muted}>{a}</span>
                  </li>
                ))}
              </ul>
            )}

            {hayErrores && (
              <p className={styles.alert}>
                Corrige los errores antes de guardar: un comprobante mal registrado es peor que uno ausente.
              </p>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!puedeGuardar || leyendo}
                onClick={() => void guardar()}
              >
                {leyendo ? 'Guardando…' : 'Guardar con asiento'}
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => {
                  setLectura(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Lista del período --- */}
      <div className={styles.panel} style={{ marginTop: 24 }}>
        <h3 className={styles.panelTitle}>Registrados en {periodo}</h3>

        {errorLista && <p className={styles.alert}>{errorLista}</p>}
        {cargando && <p className={styles.muted}>Cargando…</p>}

        {lista && (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Compras</span>
                <span className={styles.cardValue}>{money(lista.totales.compras.total)}</span>
                <span className={styles.cardHint}>
                  {lista.totales.compras.cantidad} doc. · IGV {money(lista.totales.compras.igv)}
                </span>
              </div>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Ventas</span>
                <span className={styles.cardValue}>{money(lista.totales.ventas.total)}</span>
                <span className={styles.cardHint}>
                  {lista.totales.ventas.cantidad} doc. · IGV {money(lista.totales.ventas.igv)}
                </span>
              </div>
            </div>

            {lista.comprobantes.length === 0 ? (
              <p className={styles.muted} style={{ marginTop: 16 }}>
                No hay comprobantes en este período.
              </p>
            ) : (
              <div className={styles.tableWrap} style={{ marginTop: 16 }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Fecha</th>
                      <th>Emisor</th>
                      <th>Total</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.comprobantes.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className={styles.cellTitle}>
                            {c.serie}-{c.numero}
                          </span>
                          <span className={styles.cellSub}>
                            {tipoLabel(c.tipo)} · {c.operacion === 'venta' ? 'Venta' : 'Compra'}
                          </span>
                        </td>
                        <td>{fecha(c.fecha_emision)}</td>
                        <td>
                          <span className={styles.cellTitle}>{c.razon_emisor || '—'}</span>
                          <span className={styles.cellSub}>{c.ruc_emisor || ''}</span>
                        </td>
                        <td>
                          {money(c.total)}
                          {c.moneda !== 'PEN' && <span className={styles.cellSub}>{c.moneda}</span>}
                        </td>
                        <td>
                          <span
                            className={
                              c.estado === 'confirmado' ? styles.badge : c.estado === 'pendiente' ? styles.badgeNeutral : styles.badge
                            }
                          >
                            {estadoLabel(c.estado)}
                          </span>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            {c.estado !== 'confirmado' && c.estado !== 'descartado' && (
                              <button
                                type="button"
                                className={styles.miniBtn}
                                disabled={ocupadoId === c.id}
                                onClick={() => void accion(c.id, 'confirmar')}
                              >
                                Confirmar
                              </button>
                            )}
                            {c.estado !== 'confirmado' && c.estado !== 'descartado' && (
                              <button
                                type="button"
                                className={styles.miniBtnDanger}
                                disabled={ocupadoId === c.id}
                                onClick={() => void accion(c.id, 'descartar')}
                              >
                                Descartar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
