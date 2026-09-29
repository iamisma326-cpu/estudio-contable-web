import { useEffect, useState } from 'react';
import type { MonthRow } from '../data/sunatSchedule';

/**
 * Sincroniza el cronograma mensual con la fuente oficial.
 *
 * El módulo src/data/sunatSchedule.ts trae el cronograma embebido (para
 * primer render y respaldo). Este hook consulta /api/cronograma — que
 * parsea sunat.gob.pe en vivo — y si devuelve un ejercicio distinto
 * (nuevo año, o SUNAT corrigió fechas) reemplaza las filas y refresca.
 *
 * El resultado se comparte vía contexto de módulo: todas las vistas
 * (consultor, tabla, banner) leen del mismo estado sincronizado.
 */

export interface ScheduleData {
  /** Ejercicio del cronograma activo */
  ejercicio: number;
  /** Filas por período tributario */
  meses: MonthRow[];
  /** true mientras no se haya completado la primera sincronización */
  loading: boolean;
  /** true si los datos vienen del respaldo embebido (no de SUNAT en vivo) */
  fallback: boolean;
}

// Estado compartido a nivel módulo: un solo fetch por sesión
let cached: ScheduleData | null = null;
let fetchPromise: Promise<ScheduleData | null> | null = null;

async function fetchSchedule(): Promise<ScheduleData | null> {
  if (cached) return cached;
  if (!fetchPromise) {
    fetchPromise = fetch('/api/cronograma')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json: { ejercicio: number; meses: MonthRow[]; fuente: string }): ScheduleData => ({
        ejercicio: json.ejercicio,
        meses: json.meses,
        loading: false,
        fallback: json.fuente !== 'SUNAT',
      }))
      .catch(() => null)
      .then((data) => {
        // Respaldo silencioso: quien reciba null usa el embebido
        cached = data;
        fetchPromise = null;
        return data;
      });
  }
  return fetchPromise;
}

/**
 * Devuelve el cronograma activo (API en vivo, o embebido si falla).
 * Re-renderiza a los suscriptores cuando llega la respuesta remota.
 */
export function useSunatSchedule(): ScheduleData | null {
  const [data, setData] = useState<ScheduleData | null>(cached);

  useEffect(() => {
    let cancelled = false;
    fetchSchedule().then((remote) => {
      if (!cancelled && remote) setData(remote);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}

/** Invalida la caché en memoria (sólo para tests) */
export function __resetScheduleCache(): void {
  cached = null;
  fetchPromise = null;
}
