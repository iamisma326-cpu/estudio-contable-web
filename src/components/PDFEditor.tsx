/**
 * PDFEditor — herramienta principal de la página admin.
 *
 * Flujo:
 *   1. Usuario sube un PDF (drag&drop o file picker).
 *   2. Lo previsualizamos embebido con <iframe> + descarga posterior.
 *   3. Usuario escribe una instrucción en lenguaje claro.
 *   4. Debounce de 600ms: mandamos al LLM (Google → Groq).
 *   5. Mostramos los reemplazos propuestos en una lista editable (puede
 *      confirmar/editar/eliminar cada uno antes de aplicar).
 *   6. Botón "Aplicar al PDF": POST /api/pdf-render → PDF binario → descarga
 *      automática.
 *
 * Decisiones:
 *   - El "preview en tiempo real" es del PDF original mientras el usuario
 *     tipea (no se reescribe hasta "Aplicar"). Es honesto: el LLM no es
 *     instantáneo y un preview vivo podría mostrar estados intermedios.
 *   - Mostrar el JSON de ops permite al dueño corregir antes de aplicar —
 *     el LLM no es infalible y para documentos contables la precisión
 *     importa más que la magia.
 *   - Si el LLM no devuelve nada útil, mostramos sus notes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  Upload,
  FileText,
  Wand2,
  Download,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react';
import styles from '../styles/PDFEditor.module.css';

interface ReplaceOp {
  page: number;
  find: string;
  replace: string;
  cover?: boolean;
}

interface EditResponse {
  ok: boolean;
  provider?: 'google' | 'groq';
  replaces?: ReplaceOp[];
  notes?: string;
  error?: string;
}

const DEBOUNCE_MS = 600;
// Techo real en Vercel: el body viaja como base64 (×4/3) y Vercel rechaza
// payloads >4.5 MB (413 FUNCTION_PAYLOAD_TOO_LARGE). 3 MB de PDF ≈ 4 MB de
// payload, dentro del límite con margen.
const MAX_BYTES = 3 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Error de lectura'));
    reader.readAsDataURL(file);
  });
}

export default function PDFEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string>('');
  const [pdfDataUrl, setPdfDataUrl] = useState<string>('');
  const [instruction, setInstruction] = useState('');
  const [pageHint, setPageHint] = useState('');
  const [replaces, setReplaces] = useState<ReplaceOp[]>([]);
  const [notes, setNotes] = useState('');
  const [provider, setProvider] = useState<'google' | 'groq' | null>(null);
  const [busy, setBusy] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const latestReqRef = useRef(0);

  const acceptFile = useCallback(async (f: File) => {
    setError(null);
    setFileError(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      setFileError('El archivo debe ser un PDF.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`El PDF supera el límite (${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
      return;
    }
    const b64 = await readFileAsBase64(f);
    setFile(f);
    setPdfBase64(b64);
    setPdfDataUrl(`data:application/pdf;base64,${b64}`);
    setReplaces([]);
    setNotes('');
  }, []);

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void acceptFile(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void acceptFile(f);
  };

  // Debounce: cada vez que instruction o pageHint cambian, esperamos 600ms
  // y mandamos al endpoint.
  useEffect(() => {
    if (!pdfBase64 || !instruction.trim()) {
      setReplaces([]);
      setNotes('');
      setProvider(null);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void runEdit(pdfBase64, instruction.trim(), pageHint.trim() || undefined);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruction, pageHint, pdfBase64]);

  const runEdit = useCallback(async (b64: string, instr: string, hint?: string) => {
    const reqId = ++latestReqRef.current;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pdf-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pdfBase64: b64, instruction: instr, pageHint: hint }),
      });
      if (reqId !== latestReqRef.current) return; // respuesta obsoleta
      const data = (await res.json()) as EditResponse;
      if (res.status === 401) {
        setError('Sesión expirada. Vuelve a iniciar sesión.');
        setReplaces([]);
        return;
      }
      if (!data.ok) {
        setError(data.error || 'El modelo no pudo procesar la instrucción.');
        setReplaces([]);
        setNotes('');
        return;
      }
      setReplaces(Array.isArray(data.replaces) ? data.replaces : []);
      setNotes(data.notes || '');
      setProvider(data.provider || null);
    } catch {
      if (reqId !== latestReqRef.current) return;
      setError('Error de red. Comprueba tu conexión.');
    } finally {
      if (reqId === latestReqRef.current) setBusy(false);
    }
  }, []);

  const applyChanges = useCallback(async () => {
    if (!pdfBase64 || replaces.length === 0) return;
    setRendering(true);
    setError(null);
    try {
      const res = await fetch('/api/pdf-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pdfBase64, ops: replaces }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setError(detail.error || 'No se pudo generar el PDF.');
        return;
      }
      const data = await res.json();
      // /api/pdf-render devuelve JSON { ok, base64 } o error.
      if (!data.ok || typeof data.base64 !== 'string') {
        setError(data.error || 'No se pudo generar el PDF.');
        return;
      }
      // Disparar descarga
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${data.base64}`;
      const originalName = file?.name?.replace(/\.pdf$/i, '') || 'documento';
      link.download = `${originalName}-editado.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError('Error de red al generar el PDF.');
    } finally {
      setRendering(false);
    }
  }, [file, pdfBase64, replaces]);

  const removeOp = (idx: number) => {
    setReplaces((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateOp = (idx: number, patch: Partial<ReplaceOp>) => {
    setReplaces((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const stats = useMemo(() => {
    return replaces.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.pages.add(r.page);
        return acc;
      },
      { count: 0, pages: new Set<number>() }
    );
  }, [replaces]);

  return (
    <div className={styles.shell}>
      {/* ===== Columna izquierda: archivo + instrucción ===== */}
      <div className={styles.col}>
          <div
            className={`${styles.dropzone} ${file ? styles.dropzoneFilled : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFileInput}
              className={styles.fileInput}
            />
            <label htmlFor="pdf-input" className={styles.dropzoneInner}>
              {file ? (
                <>
                  <FileText size={28} />
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileMeta}>
                    {Math.round(file.size / 1024)} KB · listo para editar
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      setPdfBase64('');
                      setPdfDataUrl('');
                      setReplaces([]);
                      setNotes('');
                      setError(null);
                    }}
                    className={styles.replaceBtn}
                  >
                    Reemplazar
                  </button>
                </>
              ) : (
                <>
                  <Upload size={32} />
                  <span className={styles.dropzoneTitle}>Suelta el PDF aquí</span>
                  <span className={styles.dropzoneHint}>
                    o haz clic para elegir un archivo · máx. 3 MB
                  </span>
                </>
              )}
            </label>
            {fileError && <p className={styles.fileError}>{fileError}</p>}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="instruction" className={styles.label}>
              <Wand2 size={16} />
              ¿Qué quieres modificar?
            </label>
            <textarea
              id="instruction"
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ej.: Cambia el RUC 20123456789 por 20987654321 y la fecha 2025-03-01 por 2025-04-15."
              className={styles.textarea}
              disabled={!file}
            />
            <span className={styles.helper}>
              Mientras escribes, la IA propone los reemplazos (debounce ~600 ms).
            </span>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="page-hint" className={styles.label}>
              Pista de página (opcional)
            </label>
            <input
              id="page-hint"
              type="text"
              value={pageHint}
              onChange={(e) => setPageHint(e.target.value)}
              placeholder="Ej.: página 2, sección 'Datos del cliente'"
              className={styles.input}
              disabled={!file}
            />
          </div>

          <div className={styles.statusRow}>
            {busy ? (
              <span className={styles.statusBusy}>
                <RefreshCw size={14} className={styles.spinIcon} />
                Analizando…
              </span>
            ) : provider ? (
              <span className={styles.statusOk}>
                <CheckCircle2 size={14} />
                {provider === 'google' ? 'Google' : 'Groq'} · {stats.count} reemplazo
                {stats.count === 1 ? '' : 's'}
              </span>
            ) : (
              <span className={styles.statusIdle}>Esperando instrucción…</span>
            )}
          </div>
        </div>

      {/* ===== Columna derecha: preview + ops ===== */}
      <div className={styles.col}>
        <div className={styles.previewWrap}>
          {pdfDataUrl ? (
            <iframe
              key={pdfDataUrl.length}
              src={pdfDataUrl}
              title="Vista previa del PDF"
              className={styles.preview}
            />
          ) : (
            <div className={styles.previewEmpty}>
              <FileText size={36} />
              <p>Sube un PDF para ver la vista previa aquí.</p>
            </div>
          )}
        </div>

        <div className={styles.opsPanel}>
          <header className={styles.opsHeader}>
            <h2 className={styles.opsTitle}>Cambios propuestos</h2>
            {replaces.length > 0 && (
              <button
                type="button"
                onClick={applyChanges}
                disabled={rendering}
                className={styles.applyBtn}
              >
                <Download size={15} />
                {rendering ? 'Generando…' : 'Aplicar y descargar'}
              </button>
            )}
          </header>

          {error && (
            <p className={styles.errorBox}>
              <AlertTriangle size={14} />
              {error}
            </p>
          )}

          {notes && !error && (
            <p className={styles.notes}>{notes}</p>
          )}

          {replaces.length === 0 && !busy && !error && (
            <p className={styles.empty}>
              Aún no hay reemplazos. Escribe una instrucción para empezar.
            </p>
          )}

          <ul className={styles.opsList}>
            {replaces.map((op, idx) => (
              <li key={idx} className={styles.opItem}>
                <div className={styles.opHead}>
                  <span className={styles.opPage}>Pág. {op.page}</span>
                  <button
                    type="button"
                    onClick={() => removeOp(idx)}
                    className={styles.opRemove}
                    aria-label="Quitar este reemplazo"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className={styles.opFields}>
                  <label className={styles.opField}>
                    <span>Buscar</span>
                    <input
                      type="text"
                      value={op.find}
                      onChange={(e) => updateOp(idx, { find: e.target.value })}
                      className={styles.opInput}
                    />
                  </label>
                  <label className={styles.opField}>
                    <span>Reemplazar por</span>
                    <input
                      type="text"
                      value={op.replace}
                      onChange={(e) => updateOp(idx, { replace: e.target.value })}
                      className={styles.opInput}
                    />
                  </label>
                  <label className={styles.opCover}>
                    <input
                      type="checkbox"
                      checked={op.cover === true}
                      onChange={(e) => updateOp(idx, { cover: e.target.checked })}
                    />
                    Tapar el texto previo (recomendado si la cadena cambia de largo)
                  </label>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}