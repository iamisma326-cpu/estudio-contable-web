/**
 * Detector de cambios en las fuentes de SUNAT.
 *
 * Regla que gobierna este archivo: un cambio de HTML NUNCA es una noticia.
 * Genera un borrador con título neutro y un enlace a la fuente. Nada se
 * envía hasta que un humano lo reescribe y pulsa publicar.
 *
 * Solo se comparan resultados en vivo (`fuente === 'SUNAT'`). Si la red falla
 * y el handler cae al respaldo embebido, no se crea un borrador: comparar
 * contra el respaldo produciría falsos positivos cada vez que SUNAT no
 * responde.
 */

import { query, queryOne } from '../../_db/db.js';
import { obtenerCronogramaMensual, obtenerRentaAnual } from '../sunat-cronogramas.js';
import { hashNormalizado, slugify } from './comun.js';

interface DefFuente {
  clave: string;
  fuente: 'cronograma' | 'renta-anual';
  titulo: (ejercicio: number) => string;
  resumen: (ejercicio: number) => string;
  cargar: () => Promise<{
    ejercicio: number;
    fuente: 'SUNAT' | 'respaldo';
    url: string;
    normalizado: unknown;
  }>;
}

const FUENTES: DefFuente[] = [
  {
    clave: 'cronograma-mensual',
    fuente: 'cronograma',
    titulo: (ejercicio) => `SUNAT actualizó el cronograma ${ejercicio}`,
    resumen: (ejercicio) =>
      `Detectamos un cambio en el cronograma mensual ${ejercicio}. Revisa la fuente y reescribe este borrador antes de publicarlo.`,
    cargar: async () => {
      const data = await obtenerCronogramaMensual();
      return {
        ejercicio: data.ejercicio,
        fuente: data.fuente,
        url: data.url,
        // Solo lo que importa: ejercicio y fechas. Sin HTML ni contadores.
        normalizado: { ejercicio: data.ejercicio, meses: data.meses },
      };
    },
  },
  {
    clave: 'renta-anual',
    fuente: 'renta-anual',
    titulo: (ejercicio) => `SUNAT actualizó el cronograma de renta anual ${ejercicio}`,
    resumen: (ejercicio) =>
      `Detectamos un cambio en el cronograma de la DJ Anual ${ejercicio}. Revisa la fuente y reescribe este borrador antes de publicarlo.`,
    cargar: async () => {
      const data = await obtenerRentaAnual();
      return {
        ejercicio: data.ejercicio,
        fuente: data.fuente,
        url: data.url,
        normalizado: {
          ejercicio: data.ejercicio,
          general: data.general,
          ampliado: data.ampliado,
        },
      };
    },
  },
];

/** Resume qué cambió sin inventar una interpretación. */
function resumirCambio(anterior: unknown, actual: unknown): string {
  try {
    const a = anterior as { meses?: unknown[]; general?: unknown[]; ampliado?: unknown[] } | null;
    const b = actual as { meses?: unknown[]; general?: unknown[]; ampliado?: unknown[] };
    const cuenta = (obj: typeof b | null) =>
      (obj?.meses?.length ?? 0) + (obj?.general?.length ?? 0) + (obj?.ampliado?.length ?? 0);
    const antes = cuenta(a);
    const despues = cuenta(b);
    if (antes === despues) return 'La estructura es la misma; cambiaron una o más fechas.';
    return `El número de filas pasó de ${antes} a ${despues}.`;
  } catch {
    return 'El contenido normalizado cambió.';
  }
}

export interface CambioDetectado {
  clave: string;
  accion: 'inicial' | 'sin-cambios' | 'borrador' | 'omitido';
  hash: string;
  noticiaId?: string;
  motivo?: string;
}

export async function detectarCambios(): Promise<CambioDetectado[]> {
  const resultados: CambioDetectado[] = [];

  for (const def of FUENTES) {
    try {
      const data = await def.cargar();
      if (data.fuente !== 'SUNAT') {
        resultados.push({
          clave: def.clave,
          accion: 'omitido',
          hash: '',
          motivo: 'SUNAT no respondió; se usa el respaldo y no se crea borrador.',
        });
        continue;
      }

      const hash = hashNormalizado(data.normalizado);
      const snapshot = await queryOne<{ hash: string; contenido: unknown }>(
        'SELECT hash, contenido FROM public.fuente_snapshots WHERE clave = $1 LIMIT 1',
        [def.clave]
      );

      if (!snapshot) {
        await query(
          `INSERT INTO public.fuente_snapshots (clave, hash, contenido, revisado_en)
           VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (clave) DO UPDATE
             SET hash = EXCLUDED.hash, contenido = EXCLUDED.contenido, revisado_en = now()`,
          [def.clave, hash, JSON.stringify(data.normalizado)]
        );
        resultados.push({ clave: def.clave, accion: 'inicial', hash });
        continue;
      }

      if (snapshot.hash === hash) {
        await query(
          'UPDATE public.fuente_snapshots SET revisado_en = now() WHERE clave = $1',
          [def.clave]
        );
        resultados.push({ clave: def.clave, accion: 'sin-cambios', hash });
        continue;
      }

      const titulo = def.titulo(data.ejercicio);
      const base = slugify(titulo) || def.clave;
      const slug = `${base}-${hash.slice(0, 8)}`;
      const resumen = def.resumen(data.ejercicio);
      const cuerpo = [
        'Este borrador lo generó el detector automático.',
        '',
        resumirCambio(snapshot.contenido, data.normalizado),
        `Fuente: ${data.url}`,
        '',
        'No se ha enviado nada. Revisa el cambio, reescribe el título y el resumen, y publica cuando esté listo.',
      ].join('\n');

      const creada = await queryOne<{ id: string }>(
        `INSERT INTO public.noticias
           (slug, titulo, resumen, cuerpo, categoria, fuente, fuente_url, estado)
         VALUES ($1, $2, $3, $4, 'sunat', $5, $6, 'borrador')
         ON CONFLICT (slug) DO NOTHING
         RETURNING id`,
        [slug, titulo, resumen, cuerpo, def.fuente, data.url]
      );

      // La huella se actualiza aunque el borrador ya existiera: así el
      // siguiente cron no vuelve a intentar crear el mismo borrador.
      await query(
        `UPDATE public.fuente_snapshots
            SET hash = $2,
                contenido = $3::jsonb,
                revisado_en = now(),
                cambiado_en = now()
          WHERE clave = $1`,
        [def.clave, hash, JSON.stringify(data.normalizado)]
      );

      resultados.push({
        clave: def.clave,
        accion: 'borrador',
        hash,
        noticiaId: creada?.id,
      });
    } catch (error) {
      resultados.push({
        clave: def.clave,
        accion: 'omitido',
        hash: '',
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return resultados;
}
