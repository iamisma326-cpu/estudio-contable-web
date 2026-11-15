/**
 * Pruebas de la liquidación de renta anual (DJ 710).
 *
 * Los casos están calculados a mano y puestos aquí con el resultado esperado, no
 * derivados del código. Un test que compara la función consigo misma siempre
 * pasa; lo que hay que fijar es el número que debería salir.
 *
 * Uso: npm run test:renta-anual
 */

import {
  liquidarRentaAnual,
  impuestoPorEscala,
  limiteGastosRecreativos,
} from '../api/_lib/renta-anual.ts';
import { UIT_2026 } from '../src/data/regimenes.ts';

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}
function eq(desc: string, real: number, esperado: number) {
  check(desc, Math.abs(real - esperado) < 0.005, `${real} != ${esperado}`);
}

const UIT = UIT_2026; // 5500

console.log('--- Escala del impuesto ---');
{
  // General: 29.5% plano sobre la renta neta.
  const g = impuestoPorEscala(100000, 'GENERAL', UIT);
  eq('General 29.5% de 100,000', g.impuesto, 29500);

  // RMT hasta 15 UIT: 10%. 15 UIT = 82,500.
  const r1 = impuestoPorEscala(50000, 'RMT', UIT);
  eq('RMT 10% de 50,000', r1.impuesto, 5000);

  // Exactamente en el límite: 15 UIT * 10% = 8,250.
  const r2 = impuestoPorEscala(82500, 'RMT', UIT);
  eq('RMT en el límite de 15 UIT', r2.impuesto, 8250);

  // Con exceso: 8,250 + 29.5% de (100,000 − 82,500) = 8,250 + 5,162.50.
  const r3 = impuestoPorEscala(100000, 'RMT', UIT);
  eq('RMT con exceso de 15 UIT', r3.impuesto, 13412.5);
  eq('RMT tasa efectiva sobre 100,000', r3.tasaEfectiva, 0.134125);

  // Renta cero o negativa: no hay impuesto.
  eq('renta cero', impuestoPorEscala(0, 'GENERAL', UIT).impuesto, 0);
  eq('renta negativa', impuestoPorEscala(-5000, 'GENERAL', UIT).impuesto, 0);

  // RER no determina impuesto sobre renta neta.
  eq('RER no calcula impuesto', impuestoPorEscala(100000, 'RER', UIT).impuesto, 0);
}

console.log('\n--- Límite de gastos recreativos ---');
{
  // 0.5% de 1,000,000 = 5,000; el tope de 40 UIT (220,000) no aplica.
  const a = limiteGastosRecreativos(1000000, 8000, UIT);
  eq('límite por ingresos', a.limite, 5000);
  eq('exceso a adicionar', a.exceso, 3000);

  // Ingresos altos: 0.5% de 100,000,000 = 500,000, pero el tope son 40 UIT.
  const b = limiteGastosRecreativos(100000000, 300000, UIT);
  eq('el tope de 40 UIT manda', b.limite, 40 * UIT);
  eq('exceso con tope', b.exceso, 300000 - 40 * UIT);

  // Gasto por debajo del límite: no hay exceso.
  const c = limiteGastosRecreativos(1000000, 1000, UIT);
  eq('sin exceso', c.exceso, 0);

  // Sin gastos recreativos.
  const d = limiteGastosRecreativos(1000000, 0, UIT);
  eq('sin gasto recreativo', d.limite, 0);

  // Caso resuelto publicado en la cartilla de SUNAT (ejercicio 2024, UIT 5,150):
  // ingresos 24,270,980 y gastos recreativos 132,055. El límite es 0.5% de los
  // ingresos (121,354.90) porque es menor que 40 UIT (206,000). El exceso
  // reparable es 10,700.10. Si este caso deja de dar eso, algo se movió.
  const oficial = limiteGastosRecreativos(24270980, 132055, 5150);
  eq('caso SUNAT: límite', oficial.limite, 121354.9);
  eq('caso SUNAT: exceso', oficial.exceso, 10700.1);
}

console.log('\n--- Liquidación del Régimen General ---');
{
  // Ingresos 1,000,000; gastos 700,000; renta neta 300,000.
  // Impuesto: 300,000 * 29.5% = 88,500. Pagos a cuenta 60,000 => paga 28,500.
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'GENERAL',
    ingresosNetos: 1000000,
    gastosDeducibles: 700000,
    pagosACuenta: 60000,
  }, UIT);

  eq('renta bruta', r.rentaBruta, 1000000);
  eq('renta neta', r.rentaNeta, 300000);
  eq('renta neta imponible', r.rentaNetaImponible, 300000);
  eq('impuesto calculado', r.impuestoCalculado, 88500);
  eq('créditos', r.creditos, 60000);
  eq('por regularizar', r.porRegularizar, 28500);
  eq('sin saldo a favor', r.saldoAFavor, 0);
  check('sin avisos', r.avisos.length === 0, r.avisos.join(' | '));
}

console.log('\n--- RMT con escala progresiva ---');
{
  // Ingresos 500,000; gastos 400,000; renta neta 100,000.
  // Impuesto: 8,250 + 29.5% * 17,500 = 8,250 + 5,162.50 = 13,412.50.
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'RMT',
    ingresosNetos: 500000,
    gastosDeducibles: 400000,
    pagosACuenta: 10000,
  }, UIT);

  eq('renta neta', r.rentaNeta, 100000);
  eq('impuesto con escala', r.impuestoCalculado, 13412.5);
  eq('por regularizar', r.porRegularizar, 3412.5);
}

console.log('\n--- Adiciones y gastos recreativos ---');
{
  // Ingresos 1,000,000; gastos 700,000; recreativos 8,000 contabilizados.
  // Límite: 0.5% de 1,000,000 = 5,000. Exceso 3,000.
  // Si los 700,000 de gastos ya incluyen los 8,000, la renta neta es 300,000
  // y se adiciona solo el exceso: 300,000 + 3,000 = 303,000.
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'GENERAL',
    ingresosNetos: 1000000,
    gastosDeducibles: 700000,
    gastosRecreativos: 8000,
    pagosACuenta: 0,
  }, UIT);

  eq('límite recreativo', r.limiteRecreativo ?? 0, 5000);
  eq('exceso adicionado', r.excesoRecreativo, 3000);
  eq('adiciones totales', r.adiciones, 3000);
  eq('renta neta imponible', r.rentaNetaImponible, 303000);
  eq('impuesto', r.impuestoCalculado, 303000 * 0.295);
  check('avisa del exceso', r.avisos.some((a) => /recreativ/i.test(a)), r.avisos.join(' | '));
}

console.log('\n--- Pérdidas de ejercicios anteriores ---');
{
  // Renta neta 100,000; pérdidas 150,000: se compensan solo hasta 100,000.
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'GENERAL',
    ingresosNetos: 500000,
    gastosDeducibles: 400000,
    perdidasAnteriores: 150000,
  }, UIT);

  eq('renta neta', r.rentaNeta, 100000);
  eq('pérdidas aplicadas', r.perdidasAnteriores, 100000);
  eq('renta imponible cero', r.rentaNetaImponible, 0);
  eq('sin impuesto', r.impuestoCalculado, 0);

  // Pérdidas mayores que la renta: no dejan imponible negativo.
  const r2 = liquidarRentaAnual({
    anio: 2026,
    regimen: 'GENERAL',
    ingresosNetos: 100000,
    gastosDeducibles: 200000,
    perdidasAnteriores: 50000,
  }, UIT);
  eq('renta imponible no es negativa', r2.rentaNetaImponible, 0);
  check('avisa que no se aplican', r2.avisos.some((a) => /pérdidas/i.test(a)), r2.avisos.join(' | '));
}

console.log('\n--- Saldo a favor en vez de pago ---');
{
  // Impuesto 29,500 pero pagó 40,000 a cuenta: queda a favor 10,500.
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'GENERAL',
    ingresosNetos: 500000,
    gastosDeducibles: 400000,
    pagosACuenta: 40000,
  }, UIT);

  eq('impuesto', r.impuestoCalculado, 29500);
  eq('por regularizar', r.porRegularizar, 0);
  eq('saldo a favor', r.saldoAFavor, 10500);
  check('la última línea dice saldo a favor',
    /saldo a favor/i.test(r.lineas[r.lineas.length - 1].concepto),
    r.lineas[r.lineas.length - 1].concepto);
}

console.log('\n--- Créditos variados ---');
{
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'GENERAL',
    ingresosNetos: 1000000,
    gastosDeducibles: 700000,
    pagosACuenta: 50000,
    retenciones: 10000,
    saldoAFavorAnterior: 5000,
  }, UIT);

  eq('créditos sumados', r.creditos, 65000);
  eq('por regularizar', r.porRegularizar, 88500 - 65000);
}

console.log('\n--- Avisos de la declaración ---');
{
  // RMT con ingresos por encima de 1,700 UIT: no corresponde el régimen.
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'RMT',
    ingresosNetos: 1700 * UIT + 100000,
    gastosDeducibles: 0,
  }, UIT);
  check('avisa que excede el RMT', r.avisos.some((a) => /1,700 UIT/i.test(a)), r.avisos.join(' | '));

  const rer = liquidarRentaAnual({
    anio: 2026, regimen: 'RER', ingresosNetos: 400000, gastosDeducibles: 300000,
  }, UIT);
  check('avisa que el RER no usa esta liquidación',
    rer.avisos.some((a) => /Régimen Especial/i.test(a)), rer.avisos.join(' | '));

  // Gastos mayores que ingresos: renta negativa, hay que mirarlo.
  const perdida = liquidarRentaAnual({
    anio: 2026, regimen: 'GENERAL', ingresosNetos: 100000, gastosDeducibles: 150000,
  }, UIT);
  check('avisa de gastos mayores que ingresos',
    perdida.avisos.some((a) => /superan a los ingresos/i.test(a)), perdida.avisos.join(' | '));
}

console.log('\n--- Las líneas cuadran entre sí ---');
{
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'RMT',
    ingresosNetos: 800000,
    gastosDeducibles: 600000,
    gastosRecreativos: 6000,
    adiciones: 2000,
    perdidasAnteriores: 10000,
    pagosACuenta: 8000,
  }, UIT);

  // La suma de las líneas de resultado debe dar el importe final.
  const final = r.lineas[r.lineas.length - 1].importe;
  check('la última línea coincide con el resultado',
    Math.abs(Math.abs(final) - Math.max(r.porRegularizar, r.saldoAFavor)) < 0.005,
    `${final} vs ${r.porRegularizar}/${r.saldoAFavor}`);

  // Cada línea debe traer su importe numérico, sin NaN.
  check('ninguna línea tiene NaN',
    r.lineas.every((l) => Number.isFinite(l.importe)),
    JSON.stringify(r.lineas.filter((l) => !Number.isFinite(l.importe))));

  // La renta imponible debe ser la de sus componentes.
  eq('renta imponible = neta + adiciones − pérdidas',
    r.rentaNetaImponible, r.rentaNeta + r.adiciones - r.perdidasAnteriores);
}

console.log('\n--- Céntimos, no fracciones flotantes ---');
{
  // Un importe con céntimos no debe arrastrar 0.000000001.
  const r = liquidarRentaAnual({
    anio: 2026,
    regimen: 'GENERAL',
    ingresosNetos: 123456.78,
    gastosDeducibles: 98765.43,
  }, UIT);
  const dec = String(r.impuestoCalculado).split('.')[1] ?? '';
  check('el impuesto tiene a lo sumo dos decimales', dec.length <= 2, String(r.impuestoCalculado));
  check('no arrastra ruido flotante', Number.isFinite(r.impuestoCalculado), String(r.impuestoCalculado));
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
