/**
 * Renta anual del ejercicio (solo staff).
 *
 * GET  /api/renta-anual?clienteId=&anio=          → liquidación con las líneas del 710
 * POST /api/renta-anual                            → guarda datos que no están en
 *                                                    los comprobantes (gastos deducibles,
 *                                                    pagos a cuenta, pérdidas)
 *
 * Los ingresos y el IGV salen de los comprobantes confirmados del año, sumando
 * mes a mes la misma liquidación mensual que usa /api/liquidacion. Así el anual
 * y lo que se declaró cada mes no pueden discrepar.
 *
 * Lo que NO se puede deducir de los comprobantes (gastos deducibles aceptados,
 * pagos a cuenta, pérdidas de años anteriores, adiciones) viene del cuerpo del
 * POST o de la fila guardada. No se inventa: si falta, se informa como faltante
 * y la liquidación sale con lo que haya, diciendo qué falta.
 */

import { query, queryOne } from '../_db/db.js';
import type { ReqLike, ResLike } from '../_auth/http.js';
import { applyCors, methodNotAllowed, queryParam, readJsonBody } from '../_auth/http.js';
import { requireStaff } from '../_auth/guard.js';
import { liquidarIGV, ingresosNetosDeVentas, type ComprobanteTributario } from '../_lib/igv-mensual.js';
import { liquidarRentaAnual, type DatosAnuales, type RegimenAnual } from '../_lib/renta-anual.js';
import { UIT_2026 } from '../../src/data/regimenes.js';

/** Lo que el contador aporta y no está en los comprobantes. */
interface DatosContador {
  gastosDeducibles: number;
  adiciones: number;
  perdidasAnteriores: number;
  pagosACuenta: number;
  retenciones: number;
  saldoAFavorAnterior: number;
  gastosRecreativos: number;
}

const CERO: DatosContador = {
  gastosDeducibles: 0,
  adiciones: 0,
  perdidasAnteriores: 0,
  pagosACuenta: 0,
  retenciones: 0,
  saldoAFavorAnterior: 0,
  gastosRecreativos: 0,
};

const CAMPOS = `tipo, operacion, serie, numero, afectacion, base, igv, exonerado, total`;

/** Comprobantes confirmados del año, en forma tributaria. */
async function comprobantesDelAnio(clienteId: string, anio: number): Promise<ComprobanteTributario[]> {
  const filas = await query<Record<string, unknown>>(
    `SELECT ${CAMPOS} FROM public.comprobantes c
       JOIN public.periodos p ON p.id = c.periodo_id
      WHERE c.cliente_id = $1 AND p.anio = $2 AND c.estado = 'confirmado'`,
    [clienteId, anio]
  );
  return filas.map((f) => ({
    tipo: String(f.tipo ?? 'factura') as ComprobanteTributario['tipo'],
    operacion: f.operacion === 'venta' ? 'venta' : 'compra',
    afectacion: (f.afectacion as string) ?? '10',
    base: Number(f.base ?? 0),
    igv: Number(f.igv ?? 0),
    exonerado: Number(f.exonerado ?? 0),
    inafecto: 0,
    total: Number(f.total ?? 0),
    serie: (f.serie as string) ?? null,
    numero: (f.numero as string) ?? null,
  })) as ComprobanteTributario[];
}

/** Cuenta el estado de los períodos del año, para saber si el año está cerrado. */
async function estadoDelAnio(
  clienteId: string,
  anio: number
): Promise<{ periodos: number; sinConfirmar: number }> {
  const fila = await queryOne<{ periodos: string; sin_confirmar: string }>(
    `SELECT count(DISTINCT p.id)::text AS periodos,
            count(c.id) FILTER (WHERE c.estado <> 'confirmado')::text AS sin_confirmar
       FROM public.periodos p
       LEFT JOIN public.comprobantes c ON c.periodo_id = p.id
      WHERE p.cliente_id = $1 AND p.anio = $2`,
    [clienteId, anio]
  );
  return {
    periodos: Number(fila?.periodos ?? 0),
    sinConfirmar: Number(fila?.sin_confirmar ?? 0),
  };
}

function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  applyCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    methodNotAllowed(res);
    return;
  }

  const user = await requireStaff(req, res);
  if (!user) return;

  const body = req.method === 'POST' ? ((await readJsonBody(req)) as Record<string, unknown> | null) : null;

  const clienteId = queryParam(req, 'clienteId') ?? (body?.clienteId as string | undefined);
  const anioRaw = queryParam(req, 'anio') ?? (body?.anio as string | number | undefined);

  if (!clienteId) {
    res.status(400).json({ ok: false, error: 'Falta clienteId.' });
    return;
  }
  const anio = Number(anioRaw);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    res.status(400).json({ ok: false, error: 'Falta el año del ejercicio (por ejemplo 2026).' });
    return;
  }

  const cliente = await queryOne<{ ruc: string; razon_social: string; regimen: string }>(
    `SELECT ruc, razon_social, regimen FROM public.clientes WHERE id = $1`,
    [clienteId]
  );
  if (!cliente) {
    res.status(404).json({ ok: false, error: 'El cliente no existe.' });
    return;
  }

  // Los datos del contador se guardan en clientes.datos_anuales (jsonb) por año.
  const guardado = await queryOne<{ datos: unknown }>(
    `SELECT datos_anuales -> $2 AS datos FROM public.clientes WHERE id = $1`,
    [clienteId, String(anio)]
  );
  const previos = (guardado?.datos as Partial<DatosContador> | null) ?? {};

  const entrantes: Partial<DatosContador> = {};
  if (body) {
    for (const k of Object.keys(CERO) as Array<keyof DatosContador>) {
      if (body[k] !== undefined) entrantes[k] = numero(body[k]);
    }
  }

  const datos: DatosContador = { ...CERO, ...previos, ...entrantes };

  if (req.method === 'POST') {
    // Se guarda solo lo que el contador manda, fusionado con lo que había.
    const fusion = { ...previos, ...entrantes };
    await query(
      `UPDATE public.clientes
          SET datos_anuales = jsonb_set(
            coalesce(datos_anuales, '{}'::jsonb), ARRAY[$2], $3::jsonb, true)
        WHERE id = $1`,
      [clienteId, String(anio), JSON.stringify(fusion)]
    );
  }

  const tributarios = await comprobantesDelAnio(clienteId, anio);
  const ventas = tributarios.filter((c) => c.operacion === 'venta');
  const compras = tributarios.filter((c) => c.operacion === 'compra');

  const igv = liquidarIGV(ventas, compras, 0);
  const ingresosNetos = ingresosNetosDeVentas(igv.ventas);

  const regimen = (cliente.regimen === 'RMT' || cliente.regimen === 'RER'
    ? cliente.regimen
    : 'GENERAL') as RegimenAnual;

  const liquidacion = liquidarRentaAnual(
    {
      anio,
      regimen,
      ingresosNetos,
      gastosDeducibles: datos.gastosDeducibles,
      adiciones: datos.adiciones,
      perdidasAnteriores: datos.perdidasAnteriores,
      pagosACuenta: datos.pagosACuenta,
      retenciones: datos.retenciones,
      saldoAFavorAnterior: datos.saldoAFavorAnterior,
      gastosRecreativos: datos.gastosRecreativos,
    } satisfies DatosAnuales,
    UIT_2026
  );

  const estado = await estadoDelAnio(clienteId, anio);
  const faltantes: string[] = [];
  if (datos.gastosDeducibles === 0) {
    faltantes.push('No se han registrado los gastos deducibles del ejercicio: la renta neta sale igual a los ingresos.');
  }
  if (datos.pagosACuenta === 0) {
    faltantes.push('No se han registrado los pagos a cuenta del año: el impuesto por regularizar sale más alto de lo real.');
  }
  if (estado.sinConfirmar > 0) {
    faltantes.push(`Hay ${estado.sinConfirmar} comprobante(s) sin confirmar en el año: no entran en los ingresos.`);
  }
  if (estado.periodos === 0) {
    faltantes.push('No hay períodos abiertos para ese año.');
  }

  res.status(200).json({
    ok: true,
    cliente: { ruc: cliente.ruc, razonSocial: cliente.razon_social, regimen: cliente.regimen },
    anio,
    uit: UIT_2026,
    ingresosNetos,
    comprobantes: { ventas: ventas.length, compras: compras.length },
    igv: { ventas: igv.ventas, compras: igv.compras },
    datosContador: datos,
    liquidacion,
    faltantes,
  });
}
