/**
 * Saldo a favor del IGV que trae el mes anterior.
 *
 * Vive aquí y no en el endpoint de liquidación porque lo consultan dos sitios:
 * la pantalla que muestra el impuesto y la exportación a Excel. Si cada uno
 * hiciera su propia consulta podrían dar cifras distintas para el mismo mes, y
 * el asistente no tendría forma de saber cuál creer.
 */

import { queryOne } from '../_db/db.js';

export interface SaldoAnterior {
  /** Saldo que se arrastra. 0 si el período anterior existe pero no declara. */
  saldo: number;
  /** Qué pasó, para poder avisar con precisión. */
  origen: 'declarado' | 'periodo_sin_declarar' | 'sin_periodo_anterior';
}

/**
 * El saldo a favor del mes anterior.
 *
 * Tres situaciones distintas, que no son lo mismo aunque todas acaben en 0:
 *
 *   'declarado'            el mes anterior está cerrado y declara un saldo
 *   'periodo_sin_declarar' el mes anterior existe pero nadie lo cerró: el saldo
 *                          puede ser cualquiera, y suponer 0 es arriesgado
 *   'sin_periodo_anterior' el cliente no operaba el mes anterior: 0 es correcto
 *
 * Se distinguen porque el aviso al asistente es distinto en cada caso.
 */
export async function saldoAnterior(
  clienteId: string,
  anio: number,
  mes: number
): Promise<SaldoAnterior> {
  const previoAnio = mes === 1 ? anio - 1 : anio;
  const previoMes = mes === 1 ? 12 : mes - 1;

  const fila = await queryOne<{ saldo: string | null }>(
    `SELECT saldo_a_favor_igv::text AS saldo
       FROM public.periodos
      WHERE cliente_id = $1 AND anio = $2 AND mes = $3`,
    [clienteId, previoAnio, previoMes]
  );

  if (!fila) return { saldo: 0, origen: 'sin_periodo_anterior' };
  if (fila.saldo === null) return { saldo: 0, origen: 'periodo_sin_declarar' };
  return { saldo: Number(fila.saldo), origen: 'declarado' };
}