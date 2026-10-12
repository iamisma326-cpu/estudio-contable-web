import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { MAX_FILE_SIZE, formatFileSize } from '../config/contact';

/**
 * Estado y validación del archivo adjunto del formulario de contacto.
 *
 * Un solo archivo, sin filtro de extensión (el `accept` del navegador oculta
 * tipos que el cliente necesita adjuntar): solo límite de tamaño. El input
 * queda oculto y lo abre un botón real vía `inputRef.current?.click()`.
 */
export default function useFileAttachment() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Fuerza el remount del input para poder volver a elegir el mismo archivo */
  const [inputKey, setInputKey] = useState(0);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;

    if (!picked) {
      setFile(null);
      setError(null);
      return;
    }

    if (picked.size > MAX_FILE_SIZE) {
      setFile(null);
      setError(`El archivo supera el máximo de ${formatFileSize(MAX_FILE_SIZE)}. Recorta o vuelve a escanearlo más liviano.`);
      setInputKey((k) => k + 1);
      return;
    }

    setError(null);
    setFile(picked);
  }, []);

  const clear = useCallback(() => {
    setFile(null);
    setError(null);
    setInputKey((k) => k + 1);
  }, []);

  /** Abre el selector de archivos. El click es síncrono dentro del handler
   *  del botón, que es lo que los navegadores exigen para que abra. */
  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  /**
   * Feature detection real de Web Share con archivos.
   * Sin esta prueba, share() lanzaría TypeError en navegadores que
   * comparten texto pero no archivos (p. ej. Firefox desktop).
   */
  const canShareFiles = useCallback((f: File | null): boolean => {
    if (!f) return false;
    try {
      return (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [f] })
      );
    } catch {
      return false;
    }
  }, []);

  return { file, error, inputKey, inputRef, handleChange, clear, openPicker, canShareFiles };
}
