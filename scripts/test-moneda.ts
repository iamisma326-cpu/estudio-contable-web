/**
 * Banco de pruebas de conversión de moneda (src/lib/moneda.ts).
 * Uso: npm run test:moneda
 */

import {
  convertirASoles,
  convertirComprobante,
  tipoCambioCorresponde,
} from '../src/lib/moneda.ts';

let ok = 0;
let fallo = 0;

function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) {
    ok++;
    console.log(`OK     ${desc}`);
  } else {
    fallo++;
    console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`);
  }
}

const TC = { fecha: '2026-11-10', compra: 3.4, venta: 3.42 };

// ---------------------------------------------------------------------------
// 1. Soles: no se toca nada
// ---------------------------------------------------------------------------
console.log('--- PEN ---');
const pen = convertirASoles(118, 'PEN', 'compra');
check('PEN no se convierte', pen.soles === 118);
check('PEN tipo de cambio 1', pen.tipoCambio === 1);
check('PEN sin avisos', pen.avisos.length === 0);
check('PEN sin TC no avisa', convertirASoles(118, 'PEN', 'compra', null).avisos.length === 0);
check('moneda ausente se asume PEN', convertirASoles(118, null, 'compra').tipoCambio === 1);
check('redondea a céntimos', convertirASoles(118.567, 'PEN', 'compra').soles === 118.57);

// ---------------------------------------------------------------------------
// 2. Criterio SUNAT: compra al venta, venta al compra
// ---------------------------------------------------------------------------
console.log('\n--- Criterio SUNAT ---');
const compraUSD = convertirASoles(100, 'USD', 'compra', TC);
check('compra usa tipo de cambio VENTA', compraUSD.criterio === 'venta', compraUSD.criterio);
check('compra: 100 USD * 3.42 = 342', compraUSD.soles === 342, String(compraUSD.soles));

const ventaUSD = convertirASoles(100, 'USD', 'venta', TC);
check('venta usa tipo de cambio COMPRA', ventaUSD.criterio === 'compra', ventaUSD.criterio);
check('venta: 100 USD * 3.40 = 340', ventaUSD.soles === 340, String(ventaUSD.soles));

// La diferencia entre ambas es real y va a la declaración.
check('compra y venta dan importes distintos', compraUSD.soles !== ventaUSD.soles);

// ---------------------------------------------------------------------------
// 3. Sin tipo de cambio
// ---------------------------------------------------------------------------
console.log('\n--- Sin TC ---');
const sinTC = convertirASoles(100, 'USD', 'compra', null);
check('sin TC deja el importe igual', sinTC.soles === 100);
check('sin TC avisa', sinTC.avisos.length > 0);
check('el aviso dice la moneda', sinTC.avisos[0].includes('USD'), sinTC.avisos[0]);
check('sin TC no inventa tasa', sinTC.tipoCambio === 0);

const tcMalo = convertirASoles(100, 'USD', 'compra', { fecha: '2026-11-10', compra: 0, venta: 0 });
check('TC cero se rechaza', tcMalo.tipoCambio === 0);
check('TC cero avisa', tcMalo.avisos.length > 0);

// ---------------------------------------------------------------------------
// 4. Coherencia importes al convertir
// ---------------------------------------------------------------------------
console.log('\n--- Coherencia ---');
const conv = convertirComprobante({ base: 100, igv: 18, exonerado: 0, total: 118 }, 'USD', 'compra', TC);
check('base convertida 342', conv.base === 342, String(conv.base));
check('IGV convertido 61.56', conv.igv === 61.56, String(conv.igv));
check('total convertido 403.56', conv.total === 403.56, String(conv.total));
check('la suma cuadra tras convertir', Math.abs(conv.base + conv.igv + conv.exonerado - conv.total) < 0.01,
  `${conv.base}+${conv.igv}+${conv.exonerado} vs ${conv.total}`);
check('la conversión deja aviso informativo', conv.avisos.some((a) => a.includes('PEN')));

// PEN pasa sin tocar
const convPen = convertirComprobante({ base: 100, igv: 18, exonerado: 0, total: 118 }, 'PEN', 'compra');
check('PEN no se convierte en bloque', convPen.total === 118 && convPen.tipoCambio === 1);
check('PEN no genera avisos', convPen.avisos.length === 0);

// Total ausente se reconstruye de las partes
const convSinTotal = convertirComprobante({ base: 100, igv: 18, exonerado: 0, total: null }, 'USD', 'compra', TC);
check('total ausente se reconstruye', convSinTotal.total === 403.56, String(convSinTotal.total));

// Aviso cuando el total no cuadra con las partes (descuento global)
const convDesc = convertirComprobante({ base: 100, igv: 18, exonerado: 0, total: 100 }, 'USD', 'compra', TC);
check('descuento global oculto avisa', convDesc.avisos.some((a) => a.includes('descuentos globales')), convDesc.avisos.join('|'));

// ---------------------------------------------------------------------------
// 5. Tasa correspondiente a la fecha
// ---------------------------------------------------------------------------
console.log('\n--- Fecha ---');
check('misma fecha ok', tipoCambioCorresponde('2026-11-10', TC).ok);
check('tasa anterior ok (fin de semana)', tipoCambioCorresponde('2026-11-12', TC).ok);
check('tasa futura se rechaza', !tipoCambioCorresponde('2026-11-01', TC).ok);
check('sin TC se rechaza', !tipoCambioCorresponde('2026-11-10', null).ok);
check('sin fecha se rechaza', !tipoCambioCorresponde(null, TC).ok);
check('el motivo menciona las fechas', tipoCambioCorresponde('2026-11-01', TC).motivo?.includes('2026-11-01') === true);

// ---------------------------------------------------------------------------
// 6. Otras monedas
// ---------------------------------------------------------------------------
console.log('\n--- Otras monedas ---');
const eur = convertirASoles(100, 'EUR', 'compra', { fecha: '2026-11-10', compra: 3.7, venta: 3.75 });
check('EUR se convierte al venta en compras', eur.soles === 375, String(eur.soles));
check('moneda en minúsculas se normaliza', convertirASoles(100, 'usd', 'compra', TC).soles === 342);
check('moneda desconocida se convierte igual', convertirASoles(100, 'GBP', 'compra', TC).soles === 342);

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);