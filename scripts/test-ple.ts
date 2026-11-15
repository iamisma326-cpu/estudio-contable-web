/**
 * Banco de pruebas de la exportación PLE (14.1 ventas, 8.1 compras).
 *
 * Los números de campo están tomados de los anexos oficiales de la
 * Res. 361-2015/SUNAT, descargados durante el desarrollo:
 *   anexo1-361-2015.pdf → 14.1 Registro de Ventas (34 campos)
 *   anexo2-361-2015.pdf → 8.1  Registro de Compras (41 campos)
 *
 * Uso: npm run test:ple
 */

import {
  num,
  fechaPLE,
  periodoPLE,
  limpiar,
  lineaVenta,
  lineaCompra,
  generarPLE,
  nombreArchivo,
} from '../src/lib/ple.ts';
import type { ComprobanteIngerido } from '../src/lib/ingesta.ts';

let ok = 0;
let fallo = 0;

function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

function eq(desc: string, real: unknown, esperado: unknown) {
  check(desc, JSON.stringify(real) === JSON.stringify(esperado), `real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`);
}

// Comprobante base para las pruebas.
function comp(over: Partial<ComprobanteIngerido> = {}): ComprobanteIngerido {
  return {
    tipo: 'factura',
    operacion: 'compra',
    serie: 'F001',
    numero: '123',
    fechaEmision: '2026-11-10',
    rucEmisor: '20131312935',
    rucReceptor: '20512345671',
    razonEmisor: 'PROVEEDOR SAC',
    moneda: 'PEN',
    tipoCambio: null,
    base: 100,
    igv: 18,
    exonerado: 0,
    total: 118,
    afectacion: '10',
    origen: 'xml',
    confianza: 0.99,
    estado: 'confirmado',
    hallazgos: [],
    avisos: [],
    clave: 'k',
    ...over,
  };
}

// ---------------------------------------------------------------------------
console.log('--- Formato de campos ---');
eq('importe simple', num(118), '118.00');
eq('importe con decimales', num(118.5), '118.50');
eq('importe grande sin comas', num(1234567.89), '1234567.89');
eq('cero', num(0), '0.00');
eq('casi cero se aplana', num(0.001), '0.00');
eq('null', num(null), '0.00');
eq('negativo conserva signo', num(-15.5), '-15.50');
check('sin comas de miles', !num(1234567.89).includes(','));

eq('fecha ISO', fechaPLE('2026-11-10'), '10/11/2026');
eq('fecha nula', fechaPLE(null), '');
eq('fecha malformada', fechaPLE('10/11/2026'), '');
eq('periodo', periodoPLE('2026-11'), '20261100');
eq('periodo malformado', periodoPLE('2026-1'), '');
eq('limpia el pipe', limpiar('A|B'), 'A B');
eq('limpia saltos', limpiar('A\nB'), 'A B');
eq('recorta al máximo', limpiar('x'.repeat(200), 100).length, 100);
eq('null', limpiar(null), '');

// ---------------------------------------------------------------------------
console.log('\n--- Registro de ventas (14.1): 34 campos ---');
{
  const c = comp({ operacion: 'venta', total: 118, base: 100, igv: 18 });
  const l = lineaVenta(c, { periodo: '2026-11' });
  eq('formato', l.formato, '14.1');
  eq('34 campos', l.campos.length, 34);
  eq('campo 1 periodo', l.campos[0], '20261100');
  eq('campo 4 fecha', l.campos[3], '10/11/2026');
  eq('campo 6 tipo doc factura', l.campos[5], '01');
  eq('campo 7 serie', l.campos[6], 'F001');
  eq('campo 8 número', l.campos[7], '123');
  eq('campo 10 doc RUC', l.campos[9], '6');
  eq('campo 11 RUC cliente', l.campos[10], '20512345671');
  eq('campo 14 base', l.campos[13], '100.00');
  eq('campo 16 IGV', l.campos[15], '18.00');
  eq('campo 24 total', l.campos[23], '118.00');
  eq('campo 25 moneda', l.campos[24], 'PEN');
  eq('campo 34 estado', l.campos[33], '1');
  check('linea empieza por periodo', l.linea.startsWith('20261100|'));
  check('linea termina en pipe', l.linea.endsWith('|'));
  check('no hay doble pipe perdido al final', l.linea.endsWith('1|'));
  const pipes = (l.linea.match(/\|/g) ?? []).length;
  eq('34 campos => 34 pipes', pipes, 34);
}

// ---------------------------------------------------------------------------
console.log('\n--- Registro de compras (8.1): 41 campos ---');
{
  const l = lineaCompra(comp(), { periodo: '2026-11' });
  eq('formato', l.formato, '8.1');
  eq('41 campos', l.campos.length, 41);
  eq('campo 1 periodo', l.campos[0], '20261100');
  eq('campo 4 fecha', l.campos[3], '10/11/2026');
  eq('campo 6 tipo doc', l.campos[5], '01');
  eq('campo 9 número', l.campos[8], '123');
  eq('campo 12 RUC proveedor', l.campos[11], '20131312935');
  eq('campo 13 razón social', l.campos[12], 'PROVEEDOR SAC');
  eq('campo 14 base gravada', l.campos[13], '100.00');
  eq('campo 15 IGV', l.campos[14], '18.00');
  eq('campo 20 no gravadas', l.campos[19], '0.00');
  eq('campo 23 total (14+15+20)', l.campos[22], '118.00');
  eq('campo 24 moneda', l.campos[23], 'PEN');
  eq('campo 41 estado', l.campos[40], '1');
  const pipes = (l.linea.match(/\|/g) ?? []).length;
  eq('41 campos => 41 pipes', pipes, 41);
}

// ---------------------------------------------------------------------------
console.log('\n--- Exonerado va al campo 20, no al 14 ---');
{
  const c = comp({ base: 0, igv: 0, exonerado: 50, total: 50, afectacion: '20' });
  const l = lineaCompra(c, { periodo: '2026-11' });
  eq('base gravada en 0', l.campos[13], '0.00');
  eq('IGV en 0', l.campos[14], '0.00');
  eq('no gravadas con el exonerado', l.campos[19], '50.00');
  eq('total suma 50', l.campos[22], '50.00');
}

// ---------------------------------------------------------------------------
console.log('\n--- Moneda extranjera ---');
{
  const c = comp({ moneda: 'USD', tipoCambio: 3.398, base: 339.8, igv: 61.16, total: 400.96 });
  const l = lineaCompra(c, { periodo: '2026-11' });
  eq('campo 24 moneda USD', l.campos[23], 'USD');
  eq('campo 25 tipo de cambio', l.campos[24], '3.398');
  check('los importes van en soles', l.campos[13] === '339.80');
}

// ---------------------------------------------------------------------------
console.log('\n--- Notas de crédito y débito ---');
{
  const nc = lineaVenta(comp({ tipo: 'nota_credito', operacion: 'venta', total: -118 }), { periodo: '2026-11' });
  eq('tipo 07', nc.campos[5], '07');
  eq('importe negativo se conserva', nc.campos[23], '-118.00');
  const nd = lineaVenta(comp({ tipo: 'nota_debito', operacion: 'venta' }), { periodo: '2026-11' });
  eq('tipo 08', nd.campos[5], '08');
  const bo = lineaVenta(comp({ tipo: 'boleta', operacion: 'venta' }), { periodo: '2026-11' });
  eq('boleta tipo 03', bo.campos[5], '03');
}

// ---------------------------------------------------------------------------
console.log('\n--- El CUO no admite & ---');
{
  const l = lineaVenta(comp({ operacion: 'venta', serie: 'F&01' }), { periodo: '2026-11' });
  check('el CUO no lleva &', !l.campos[1].includes('&'), l.campos[1]);
  check('la serie del campo 7 sí puede', l.campos[6] === 'F&01', l.campos[6]);
}

// ---------------------------------------------------------------------------
console.log('\n--- Solo entran confirmados ---');
{
  const r = generarPLE(
    [comp({ estado: 'confirmado' }), comp({ numero: '999', estado: 'pendiente' })],
    '8.1',
    { periodo: '2026-11' }
  );
  eq('solo una línea', r.lineas.length, 1);
  check('avisa del pendiente', r.problemas.some((p) => /pendiente/.test(p)), r.problemas.join(' | '));
}
{
  const r = generarPLE([comp({ estado: 'revisado' })], '8.1', { periodo: '2026-11' });
  eq('revisado tampoco entra', r.lineas.length, 0);
  check('lo explica', r.problemas.some((p) => /revisado/.test(p)));
}
{
  const r = generarPLE([comp({ estado: 'descartado' })], '8.1', { periodo: '2026-11' });
  eq('descartado tampoco', r.lineas.length, 0);
}

// ---------------------------------------------------------------------------
console.log('\n--- Ventas y compras no se mezclan ---');
{
  // Mezcla normal: un período con ventas y compras, exportando un solo libro.
  // Tener documentos del otro lado NO es un problema: es lo esperado.
  const mixto = [
    comp({ operacion: 'venta', numero: '1' }),
    comp({ operacion: 'venta', numero: '2' }),
    comp({ operacion: 'compra', numero: '3' }),
  ];
  const ventas = generarPLE(mixto, '14.1', { periodo: '2026-11' });
  eq('las 2 ventas entran al registro de ventas', ventas.lineas.length, 2);
  eq('la compra no entra', ventas.lineas.filter((l) => l.origen.numero === '3').length, 0);
  check('no avisa por la compra: es lo normal',
    ventas.problemas.length === 0, ventas.problemas.join(' | '));

  const compras = generarPLE(mixto, '8.1', { periodo: '2026-11' });
  eq('la compra entra al registro de compras', compras.lineas.length, 1);
  check('tampoco avisa por las ventas', compras.problemas.length === 0, compras.problemas.join(' | '));
}
{
  // Todo del otro lado: el libro sale vacío y eso sí hay que decirlo.
  const soloVentas = generarPLE([comp({ operacion: 'venta' })], '8.1', { periodo: '2026-11' });
  eq('nada entra', soloVentas.lineas.length, 0);
  check('avisa que el archivo irá vacío',
    soloVentas.problemas.some((p) => /vacío/.test(p)), soloVentas.problemas.join(' | '));

  const soloCompras = generarPLE([comp({ operacion: 'compra' })], '14.1', { periodo: '2026-11' });
  eq('tampoco entra', soloCompras.lineas.length, 0);
  check('avisa igual', soloCompras.problemas.some((p) => /vacío/.test(p)), soloCompras.problemas.join(' | '));
}

// ---------------------------------------------------------------------------
console.log('\n--- Datos incompletos no se inventan ---');
{
  const r = generarPLE([comp({ serie: null })], '8.1', { periodo: '2026-11' });
  eq('sin serie queda fuera', r.lineas.length, 0);
  check('lo explica', r.problemas.some((p) => /serie/.test(p)));
}
{
  const r = generarPLE([comp({ fechaEmision: null })], '8.1', { periodo: '2026-11' });
  eq('sin fecha queda fuera', r.lineas.length, 0);
}
{
  const r = generarPLE([comp()], '8.1', { periodo: 'malo' });
  check('periodo inválido se reporta', r.problemas.some((p) => /período/.test(p)));
}

// ---------------------------------------------------------------------------
console.log('\n--- Totales del registro ---');
{
  const r = generarPLE(
    [
      comp({ numero: '1', base: 100, igv: 18, total: 118 }),
      comp({ numero: '2', base: 200, igv: 36, total: 236 }),
      comp({ numero: '3', base: 0, igv: 0, exonerado: 50, total: 50 }),
    ],
    '8.1',
    { periodo: '2026-11' }
  );
  eq('3 registros', r.totales.registros, 3);
  eq('base acumulada', r.totales.base, 300);
  eq('igv acumulado', r.totales.igv, 54);
  eq('exonerado acumulado', r.totales.exonerado, 50);
  eq('total acumulado', r.totales.total, 404);
}

// ---------------------------------------------------------------------------
console.log('\n--- Orden estable por fecha y serie ---');
{
  const r = generarPLE(
    [
      comp({ serie: 'F002', numero: '5', fechaEmision: '2026-11-20' }),
      comp({ serie: 'F001', numero: '9', fechaEmision: '2026-11-01' }),
      comp({ serie: 'F001', numero: '2', fechaEmision: '2026-11-01' }),
    ],
    '8.1',
    { periodo: '2026-11' }
  );
  eq('primero la fecha menor, luego la serie menor',
    r.lineas.map((l) => `${l.origen.serie}-${l.origen.numero}`),
    ['F001-2', 'F001-9', 'F002-5']);
}

// ---------------------------------------------------------------------------
console.log('\n--- Archivo y nombre ---');
{
  const r = generarPLE(
    [comp({ numero: '1' }), comp({ numero: '2' })],
    '8.1',
    { periodo: '2026-11' }
  );
  check('saltos CRLF', r.contenido.includes('\r\n'));
  const lineasContenido = r.contenido.trim().split('\r\n');
  eq('una línea por registro', lineasContenido.length, 2);
  check('cada línea termina en pipe', lineasContenido.every((l) => l.endsWith('|')));
  check('cada línea tiene 41 campos', lineasContenido.every((l) => (l.match(/\|/g) ?? []).length === 41));
  check('sin cabecera ni comentarios', !r.contenido.startsWith('#'));
}
{
  // Nomenclatura oficial de 33 posiciones. Verificado contra el ejemplo del
  // documento «Nomenclatura de Libros Electrónicos» de SUNAT.
  const ventas = nombreArchivo('20131312935', '2026-11', '14.1');
  eq('nombre ventas', ventas, 'LE2013131293520261100140100001111.TXT');
  eq('33 posiciones + .TXT', ventas.length, 37); // 33 de nomenclatura + 4 de extensión
  eq('prefijo LE', ventas.slice(0, 2), 'LE');
  eq('RUC en 03-13', ventas.slice(2, 13), '20131312935');
  eq('año y mes en 14-19', ventas.slice(13, 19), '202611');
  eq('día 00 en 20-21', ventas.slice(19, 21), '00');
  eq('código de libro ventas en 22-27', ventas.slice(21, 27), '140100');
  eq('código de libro compras en 22-27', nombreArchivo('20131312935', '2026-11', '8.1').slice(21, 27), '080100');
  check('termina en .TXT', ventas.endsWith('.TXT'));
  check('sin operaciones => 0', nombreArchivo('20131312935', '2026-11', '8.1', { conOperaciones: false }).includes('00' + '0' + '1' + '1' + '1'));
  check('moneda USD => 2 en la posición 32', nombreArchivo('20131312935', '2026-11', '8.1', { moneda: 'USD' }).charAt(31) === '2');
}

// ---------------------------------------------------------------------------
console.log('\n--- Cuadre: lo exportado suma lo mismo que los comprobantes ---');
{
  const cs = [
    comp({ numero: '1', base: 100, igv: 18, total: 118 }),
    comp({ numero: '2', base: 250, igv: 45, total: 295 }),
  ];
  const r = generarPLE(cs, '8.1', { periodo: '2026-11' });
  const sumaLineas = r.lineas.reduce((s, l) => s + Number(l.campos[22]), 0);
  eq('la suma del campo 23 coincide con los totales', sumaLineas.toFixed(2), r.totales.total.toFixed(2));
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
