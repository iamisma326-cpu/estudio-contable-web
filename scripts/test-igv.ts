/**
 * Banco de pruebas de la liquidación mensual de IGV y del pago a cuenta.
 *
 * Uso: npm run test:igv
 */

import {
  resumir,
  liquidarIGV,
  pagoACuenta,
  ingresosNetosDeVentas,
  signo,
} from '../src/lib/igv-mensual.ts';
import type { ComprobanteTributario } from '../src/lib/igv-mensual.ts';

let ok = 0;
let fallo = 0;

function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

function eq(desc: string, real: unknown, esperado: unknown) {
  const a = typeof real === 'number' ? real.toFixed(2) : JSON.stringify(real);
  const b = typeof esperado === 'number' ? esperado.toFixed(2) : JSON.stringify(esperado);
  check(desc, a === b, `real=${a} esperado=${b}`);
}

function c(over: Partial<ComprobanteTributario> = {}): ComprobanteTributario {
  return {
    tipo: 'factura',
    operacion: 'compra',
    afectacion: '10',
    base: 100,
    igv: 18,
    exonerado: 0,
    inafecto: 0,
    total: 118,
    serie: 'F001',
    numero: '1',
    ...over,
  };
}

// ---------------------------------------------------------------------------
console.log('--- Signo de las notas de crédito ---');
eq('factura suma', signo('factura'), 1);
eq('boleta suma', signo('boleta'), 1);
eq('nota de débito suma', signo('nota_debito'), 1);
eq('nota de crédito resta', signo('nota_credito'), -1);

// ---------------------------------------------------------------------------
console.log('\n--- Resumen de un comprobante gravado ---');
{
  const { resumen } = resumir([c()]);
  eq('base gravada', resumen.baseGravada, 100);
  eq('IGV', resumen.igv, 18);
  eq('total', resumen.total, 118);
  eq('cantidad', resumen.cantidad, 1);
  eq('exonerado 0', resumen.exonerado, 0);
}

// ---------------------------------------------------------------------------
console.log('\n--- Exonerado e inafecto no dan crédito ---');
{
  const { resumen } = resumir([
    c({ afectacion: '20', base: 0, igv: 0, exonerado: 50, total: 50 }),
    c({ afectacion: '30', base: 0, igv: 0, inafecto: 80, total: 80 }),
  ]);
  eq('nada de base gravada', resumen.baseGravada, 0);
  eq('nada de IGV', resumen.igv, 0);
  eq('exonerado 50', resumen.exonerado, 50);
  eq('inafecto 80', resumen.inafecto, 80);
  eq('total 130', resumen.total, 130);
}

// ---------------------------------------------------------------------------
console.log('\n--- Exonerado sin importe separado usa el total ---');
{
  // Un PDF antiguo puede dejar base/igv en 0 y solo el total.
  const { resumen } = resumir([c({ afectacion: '20', base: 0, igv: 0, exonerado: 0, total: 200 })]);
  eq('recupera el importe del total', resumen.exonerado, 200);
}

// ---------------------------------------------------------------------------
console.log('\n--- Nota de crédito resta base e IGV ---');
{
  const { resumen } = resumir([
    c({ base: 1000, igv: 180, total: 1180 }),
    c({ tipo: 'nota_credito', base: 100, igv: 18, total: 118 }),
  ]);
  eq('base neta', resumen.baseGravada, 900);
  eq('IGV neto', resumen.igv, 162);
  eq('total neto', resumen.total, 1062);
  eq('cuenta los dos documentos', resumen.cantidad, 2);
}

// ---------------------------------------------------------------------------
console.log('\n--- Afectaciones especiales se avisan, no se suman mal ---');
{
  const { resumen, avisos } = resumir([c({ afectacion: '17', base: 500, igv: 0, total: 500 })]);
  eq('no entra en base gravada', resumen.baseGravada, 0);
  eq('no entra en IGV', resumen.igv, 0);
  eq('sí cuenta el total', resumen.total, 500);
  check('avisa de la afectación', avisos.some((a) => /'17'/.test(a)), avisos.join(' | '));
}

// ---------------------------------------------------------------------------
console.log('\n--- Liquidación sin saldo anterior ---');
{
  const ventas = [c({ base: 1000, igv: 180, total: 1180 })];
  const compras = [c({ base: 500, igv: 90, total: 590 })];
  const r = liquidarIGV(ventas, compras);
  eq('IGV ventas', r.ventas.igv, 180);
  eq('IGV compras', r.compras.igv, 90);
  eq('resultado', r.resultadoIGV, 90);
  eq('a pagar', r.igvAPagar, 90);
  eq('nada a favor', r.saldoAFavor, 0);
}

// ---------------------------------------------------------------------------
console.log('\n--- Crédito mayor que débito deja saldo a favor ---');
{
  const ventas = [c({ base: 200, igv: 36, total: 236 })];
  const compras = [c({ base: 1000, igv: 180, total: 1180 })];
  const r = liquidarIGV(ventas, compras);
  eq('resultado negativo', r.resultadoIGV, -144);
  eq('saldo a favor', r.saldoAFavor, 144);
  eq('no se paga nada', r.igvAPagar, 0);
}

// ---------------------------------------------------------------------------
console.log('\n--- Arrastre del saldo a favor del mes anterior ---');
{
  const ventas = [c({ base: 1000, igv: 180, total: 1180 })];
  const compras = [c({ base: 500, igv: 90, total: 590 })];
  const r = liquidarIGV(ventas, compras, 100);
  eq('resultado con arrastre', r.resultadoIGV, -10);
  eq('pasa a favor del siguiente', r.saldoAFavor, 10);
  eq('no se paga', r.igvAPagar, 0);

  const r2 = liquidarIGV(ventas, compras, 50);
  eq('con 50 de arrastre queda 40 a pagar', r2.igvAPagar, 40);
}

// ---------------------------------------------------------------------------
console.log('\n--- El saldo anterior negativo se corrige ---');
{
  const r = liquidarIGV([c()], [c()], -30);
  eq('se toma 0', r.saldoAnterior, 0);
  check('lo avisa', r.avisos.some((a) => /negativo/.test(a)));
}

// ---------------------------------------------------------------------------
console.log('\n--- Sin ventas ---');
{
  const r = liquidarIGV([], [c()]);
  eq('crédito íntegro a favor', r.saldoAFavor, 18);
  check('avisa que faltan ventas', r.avisos.some((a) => /No hay ventas/.test(a)));
  check('avisa del crédito sin ventas', r.avisos.some((a) => /crédito fiscal/.test(a)));
}

// ---------------------------------------------------------------------------
console.log('\n--- Caso completo con tres tipos de comprobante ---');
{
  const ventas = [
    c({ base: 10000, igv: 1800, total: 11800 }),
    c({ afectacion: '20', base: 0, igv: 0, exonerado: 2000, total: 2000 }),
    c({ tipo: 'nota_credito', base: 1000, igv: 180, total: 1180 }),
  ];
  const compras = [
    c({ base: 4000, igv: 720, total: 4720 }),
    c({ afectacion: '20', base: 0, igv: 0, exonerado: 500, total: 500 }),
  ];
  const r = liquidarIGV(ventas, compras);
  eq('base gravada neta', r.ventas.baseGravada, 9000);
  eq('IGV ventas neto', r.ventas.igv, 1620);
  eq('exonerado de ventas', r.ventas.exonerado, 2000);
  eq('IGV compras', r.compras.igv, 720);
  eq('IGV a pagar', r.igvAPagar, 900);
  eq('ingresos netos (base + exonerado)', ingresosNetosDeVentas(r.ventas), 11000);
}

// ---------------------------------------------------------------------------
console.log('\n--- Redondeo a céntimos ---');
{
  const compras = [
    c({ base: 0.1, igv: 0.1, total: 0.2 }),
    c({ base: 0.2, igv: 0.2, total: 0.4 }),
  ];
  const r = resumir(compras).resumen;
  eq('la suma no arrastra cola de float', r.baseGravada, 0.3);
  eq('IGV igual', r.igv, 0.3);
  const l = liquidarIGV([c({ base: 1, igv: 0.3, total: 1.3 })], compras);
  eq('resultado limpio', l.resultadoIGV, 0);
}

// ---------------------------------------------------------------------------
console.log('\n--- Pago a cuenta de renta ---');
{
  const p = pagoACuenta(10000, { tasa: 0.015 });
  eq('1.5% de 10000', p.monto, 150);
  eq('criterio tasa', p.criterio, 'tasa');
  eq('ingresos', p.ingresosNetos, 10000);
}
{
  const p = pagoACuenta(10000, { tasa: 0.01 });
  eq('RMT 1%', p.monto, 100);
}
{
  // Régimen general: el coeficiente mayor que el 1.5% manda.
  const p = pagoACuenta(10000, { tasa: 0.015, coeficiente: 0.02 });
  eq('se paga el mayor', p.monto, 200);
  eq('criterio coeficiente', p.criterio, 'coeficiente');
}
{
  const p = pagoACuenta(10000, { tasa: 0.015, coeficiente: 0.01 });
  eq('si el coeficiente es menor, se paga el 1.5%', p.monto, 150);
  eq('criterio tasa', p.criterio, 'tasa');
}
{
  const p = pagoACuenta(0, { tasa: 0.015 });
  eq('sin ingresos no se paga', p.monto, 0);
  check('lo avisa', p.avisos.some((a) => /Sin ingresos/.test(a)));
}
{
  const p = pagoACuenta(-500, { tasa: 0.015 });
  eq('ingreso negativo se aplana a 0', p.ingresosNetos, 0);
}

// ---------------------------------------------------------------------------
console.log('\n--- La base del pago a cuenta NO lleva IGV ---');
{
  const ventas = [c({ base: 1000, igv: 180, total: 1180 })];
  const { resumen } = resumir(ventas);
  const netos = ingresosNetosDeVentas(resumen);
  eq('ingresos netos = base, no el total', netos, 1000);
  check('no coincide con el total facturado', netos !== resumen.total);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
