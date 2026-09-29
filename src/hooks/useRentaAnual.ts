import { useEffect, useState } from 'react';
import { RENTA_GENERAL_2025, RENTA_AMPLIADO_2025, fechasDesdeFilas, type RentaRow } from '../data/sunatSchedule';

/**
 * Sincroniza los cronogramas de la DJ Anual de Renta con la fuente oficial.
 *
 * Módulo embebido = primer render y respaldo; /api/renta-anual parsea
 * sunat.gob.pe en vivo y si trae un ejercicio más reciente lo sirve.
 * Caché por sesión: un solo fetch para consultor y página /renta-anual-2025.
 */

export interface RentaData {
  ejercicio: number;
  fuente: 'SUNAT' | 'respaldo';
  url: string;
  general: Date[];
  ampliado: Date[];
}

let cached: RentaData | null = null;
let fetchPromise: Promise<RentaData | null> | null = null;

const EMBEBIDO: RentaData = {
  ejercicio: 2025,
  fuente: 'respaldo',
  url: 'https://www.sunat.gob.pe/orientacion/cronogramas/2026/cRenta2025.html',
  general: RENTA_GENERAL_2025,
  ampliado: RENTA_AMPLIADO_2025,
};

async function fetchRenta(): Promise<RentaData | null> {
  if (cached) return cached;
  if (!fetchPromise) {
    fetchPromise = fetch('/api/renta-anual')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(
        (json: { ejercicio: number; fuente: 'SUNAT' | 'respaldo'; url: string; general: RentaRow[]; ampliado: RentaRow[] }): RentaData => ({
          ejercicio: json.ejercicio,
          fuente: json.fuente,
          url: json.url,
          general: fechasDesdeFilas(json.general),
          ampliado: fechasDesdeFilas(json.ampliado),
        })
      )
      .catch(() => null)
      .then((data) => {
        cached = data;
        fetchPromise = null;
        return data;
      });
  }
  return fetchPromise;
}

/**
 * Cronogramas de renta activos (API en vivo, o embebido si falla).
 * Re-renderiza al suscriptores cuando llega la respuesta remota.
 */
export function useRentaAnual(): RentaData {
  const [data, setData] = useState<RentaData>(cached ?? EMBEBIDO);

  useEffect(() => {
    let cancelled = false;
    fetchRenta().then((remote) => {
      if (!cancelled && remote && remote.ejercicio >= EMBEBIDO.ejercicio) {
        setData(remote);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}

/** Invalida la caché en memoria (sólo para tests) */
export function __resetRentaCache(): void {
  cached = null;
  fetchPromise = null;
}
