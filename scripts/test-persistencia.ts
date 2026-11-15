/**
 * Prueba de persistencia contra la base real.
 *
 * Crea un cliente de prueba, guarda comprobantes con y sin asiento, comprueba
 * la atomicidad y los totales, y borra todo al terminar. El borrado del
 * cliente arrastra períodos, comprobantes y asientos por CASCADE.
 *
 * Uso: node --env-file=.env --experimental-strip-types scripts/test-persistencia.ts
 */

import { neon } from '@neondatabase/serverless';
import {
  asegurarPeriodo,
  existeComprobante,
  guardarComprobante,
  listarComprobantes,
  confirmarComprobante,
  descartarComprobante,
  totalesPeriodo,
  type Consultas,
} from '../api/_db/comprobantes.ts';
import type { ComprobanteIngerido } from '../src/lib/ingesta.ts';
import { generarAsiento } from '../src/lib/asientos.ts';

const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
const db: Consultas = {
  query: async (text, params = []) => (await sql.query(text, params)) as never,
  queryOne: async (text, params = []) => {
    const r = (await sql.query(text, params)) as unknown as unknown[];
    return (r[0] ?? null) as never;
  },
};

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

const comp = (n: string, total = 118): ComprobanteIngerido => ({
  tipo: 'factura', operacion: 'compra', serie: 'F001', numero: n,
  fechaEmision: '2026-11-10', rucEmisor: '20131312955', rucReceptor: '20503644968',
  razonEmisor: 'PROVEEDOR SAC', moneda: 'PEN', tipoCambio: null,
  base: 100, igv: 18, exonerado: 0, total, afectacion: '10',
  origen: 'xml', confianza: 0.99, estado: 'revisado',
  hallazgos: [], avisos: [], clave: `|20131312955|F001|${n}`,
});

let clienteId = '';

try {
  // -------------------------------------------------------------------------
  // Preparación: cliente de prueba
  // -------------------------------------------------------------------------
  const cli = await db.queryOne<{ id: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen)
     VALUES ('20999999991', 'CLIENTE DE PRUEBA (borrar)', 'RMT') RETURNING id`
  );
  clienteId = cli!.id;
  check('cliente de prueba creado', !!clienteId);

  // -------------------------------------------------------------------------
  // 1. Período idempotente
  // -------------------------------------------------------------------------
  console.log('\n--- Período ---');
  const p1 = await asegurarPeriodo(db, clienteId, 2026, 11);
  const p2 = await asegurarPeriodo(db, clienteId, 2026, 11);
  check('asegurarPeriodo crea el período', !!p1);
  check('asegurarPeriodo es idempotente', p1 === p2, `${p1} vs ${p2}`);

  // -------------------------------------------------------------------------
  // 2. Guardar sin asiento
  // -------------------------------------------------------------------------
  console.log('\n--- Guardar ---');
  const sinAsiento = await guardarComprobante(db, clienteId, p1, comp('1'), null);
  check('guarda comprobante sin asiento', !!sinAsiento.comprobanteId);
  check('sin asiento => asientoId null', sinAsiento.asientoId === null);

  // -------------------------------------------------------------------------
  // 3. Guardar con asiento (atómico)
  // -------------------------------------------------------------------------
  const a = generarAsiento({
    tipo: 'factura', serie: 'F001', numero: '2', fechaEmision: '2026-11-10',
    rucEmisor: '20131312955', razonSocialEmisor: 'PROVEEDOR SAC',
    base: 100, igv: 18, exonerado: 0, total: 118, operacion: 'compra',
  });
  const conAsiento = await guardarComprobante(db, clienteId, p1, comp('2'), a);
  check('guarda comprobante con asiento', !!conAsiento.comprobanteId);
  check('devuelve el id del asiento', !!conAsiento.asientoId);

  const lineas = await db.query<{ cuenta: string; debe: string; haber: string }>(
    `SELECT cuenta, debe::text, haber::text FROM public.asiento_lineas WHERE asiento_id = $1 ORDER BY cuenta`,
    [conAsiento.asientoId]
  );
  check('escribió las líneas del asiento', lineas.length === a.lineas.length, `${lineas.length} de ${a.lineas.length}`);
  const sumaDebe = lineas.reduce((s, l) => s + Number(l.debe), 0);
  const sumaHaber = lineas.reduce((s, l) => s + Number(l.haber), 0);
  check('las líneas guardadas cuadran', Math.abs(sumaDebe - sumaHaber) < 0.01, `${sumaDebe} vs ${sumaHaber}`);

  // -------------------------------------------------------------------------
  // 4. Rechazo de asiento descuadrado antes de tocar la base
  // -------------------------------------------------------------------------
  const roto = { ...a, lineas: a.lineas.map((l) => ({ ...l, haber: l.haber + 10 })) };
  let rechazado = false;
  try {
    await guardarComprobante(db, clienteId, p1, comp('99'), roto);
  } catch { rechazado = true; }
  check('rechaza un asiento descuadrado', rechazado);

  const noDebeExistir = await existeComprobante(db, clienteId, '20131312955', 'F001', '99');
  check('el comprobante rechazado no se escribió', !noDebeExistir);

  // -------------------------------------------------------------------------
  // 5. Duplicado lo impide la base
  // -------------------------------------------------------------------------
  console.log('\n--- Duplicado ---');
  check('existeComprobante detecta el 1', await existeComprobante(db, clienteId, '20131312955', 'F001', '1'));
  check('existeComprobante distingue el serie', !(await existeComprobante(db, clienteId, '20131312955', 'F002', '1')));
  check('existeComprobante sin datos => false', !(await existeComprobante(db, clienteId, null, 'F001', '1')));

  let dupRechazado = false;
  try { await guardarComprobante(db, clienteId, p1, comp('1'), null); } catch { dupRechazado = true; }
  check('la base rechaza el duplicado', dupRechazado);

  // -------------------------------------------------------------------------
  // 6. Listar / confirmar / descartar
  // -------------------------------------------------------------------------
  console.log('\n--- Estado ---');
  const lista = await listarComprobantes(db, p1);
  check('lista el período', lista.length === 2, String(lista.length));
  check('lista trae el asiento correcto', lista.some((c) => c.id === conAsiento.comprobanteId));

  const confirmado = await confirmarComprobante(db, sinAsiento.comprobanteId, clienteId);
  check('confirma el comprobante', confirmado);
  const filaConf = (await listarComprobantes(db, p1, 'confirmado')).find((c) => c.id === sinAsiento.comprobanteId);
  check('queda en estado confirmado', filaConf?.estado === 'confirmado', filaConf?.estado);

  const negativo = await confirmarComprobante(db, '00000000-0000-0000-0000-000000000000', clienteId);
  check('no confirma un id inexistente', !negativo);

  const descartado = await descartarComprobante(db, conAsiento.comprobanteId);
  check('descarta el comprobante', descartado);
  const noDescartaConfirmado = await descartarComprobante(db, sinAsiento.comprobanteId);
  check('no descarta uno ya confirmado', !noDescartaConfirmado);

  // -------------------------------------------------------------------------
  // 7. Totales
  // -------------------------------------------------------------------------
  console.log('\n--- Totales ---');
  const t = await totalesPeriodo(db, p1);
  // El descartado no suma: queda solo el confirmado (base 100, igv 18, total 118).
  check('totales excluyen descartados', t.compras.cantidad === 1, String(t.compras.cantidad));
  check('total base correcto', t.compras.base === 100, String(t.compras.base));
  check('total IGV correcto', t.compras.igv === 18, String(t.compras.igv));
  check('total importe correcto', t.compras.total === 118, String(t.compras.total));
  check('no hay ventas', t.ventas.cantidad === 0);
  check('los totales son números, no strings', typeof t.compras.total === 'number');

  const pVacio = await asegurarPeriodo(db, clienteId, 2026, 12);
  const tVacio = await totalesPeriodo(db, pVacio);
  check('período vacío devuelve ceros', tVacio.compras.total === 0 && tVacio.ventas.total === 0);

} finally {
  // -------------------------------------------------------------------------
  // Limpieza: borrar el cliente arrastra todo por CASCADE
  // -------------------------------------------------------------------------
  if (clienteId) {
    await db.query(`DELETE FROM public.clientes WHERE id = $1`, [clienteId]);
    const resto = await db.queryOne<{ c: string }>(
      `SELECT count(*)::text AS c FROM public.comprobantes WHERE cliente_id = $1`, [clienteId]
    );
    console.log(`\nlimpieza: ${resto?.c} comprobantes restantes del cliente de prueba`);
  }
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);