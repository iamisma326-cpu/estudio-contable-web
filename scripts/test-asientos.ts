/**
 * Banco de pruebas de la generación de asientos (src/lib/asientos.ts).
 * Uso: npm run test:asientos
 */

import {
  asientoCompra,
  asientoVenta,
  generarAsiento,
  invertir,
  cuadra,
  asientoCostoVenta,
  CUENTAS,
  type AsientoGenerado,
  type ComprobanteContable,
} from '../src/lib/asientos.ts';

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

/** Suma el saldo de una cuenta en el asiento (debe - haber). */
function saldo(a: AsientoGenerado, cuenta: string): number {
  return a.lineas
    .filter((l) => l.cuenta === cuenta)
    .reduce((s, l) => s + l.debe - l.haber, 0);
}

function lanza(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

const compraBase: ComprobanteContable = {
  tipo: 'factura',
  serie: 'F001',
  numero: '123',
  fechaEmision: '2026-11-10',
  rucEmisor: '20131312955',
  razonSocialEmisor: 'PROVEEDOR SAC',
  base: 100,
  igv: 18,
  exonerado: 0,
  total: 118,
  operacion: 'compra',
};

const ventaBase: ComprobanteContable = { ...compraBase, operacion: 'venta' };

// ---------------------------------------------------------------------------
// 1. Compra
// ---------------------------------------------------------------------------
console.log('\n--- Compra ---');
const cp = asientoCompra(compraBase);
check('compra cuadra', cuadra(cp), `${cp.totalDebe} vs ${cp.totalHaber}`);
check('compra: debe = 118', cp.totalDebe === 118);
check('compra: 60 Compras al debe por 100', saldo(cp, '60') === 100);
check('compra: 40112 IGV crédito fiscal al debe por 18', saldo(cp, '40112') === 18);
check('compra: 42 CxP al haber por 118', saldo(cp, '42') === -118);
check('compra: no toca ventas', saldo(cp, '70') === 0);
check('compra: glosa incluye serie-número', cp.glosa.includes('F001-123'));
check('compra: glosa incluye proveedor', cp.glosa.includes('PROVEEDOR SAC'));

// Compra exonerada
const exo = asientoCompra({ ...compraBase, base: 0, igv: 0, exonerado: 200, total: 200 });
check('compra exonerada cuadra', cuadra(exo));
check('exonerada: todo a la 60', saldo(exo, '60') === 200);
check('exonerada: sin crédito fiscal', saldo(exo, '40112') === 0);
check('exonerada: CxP 200', saldo(exo, '42') === -200);

// Compra mixta: base gravada + exonerado
const mixta = asientoCompra({ ...compraBase, base: 100, igv: 18, exonerado: 50, total: 168 });
check('compra mixta cuadra', cuadra(mixta), `${mixta.totalDebe} vs ${mixta.totalHaber}`);
check('mixta: 60 = 150 (base + exonerado)', saldo(mixta, '60') === 150);
check('mixta: IGV 18', saldo(mixta, '40112') === 18);
check('mixta: CxP 168', saldo(mixta, '42') === -168);

// Centimos que no cuadran al sumar
const cent = asientoCompra({ ...compraBase, base: 33.33, igv: 6.0, total: 39.33 });
check('compra con céntimos cuadra', cuadra(cent), `${cent.totalDebe} vs ${cent.totalHaber}`);

// Total ausente: se reconstruye para que cuadre
const sinTotal = asientoCompra({ ...compraBase, total: null });
check('compra sin total se reconstruye y cuadra', cuadra(sinTotal));
check('compra sin total: CxP 118', saldo(sinTotal, '42') === -118);

// Fecha obligatoria
check('compra sin fecha lanza', lanza(() => asientoCompra({ ...compraBase, fechaEmision: null })));
check('operación equivocada lanza', lanza(() => asientoCompra(ventaBase)));

// ---------------------------------------------------------------------------
// 2. Venta
// ---------------------------------------------------------------------------
console.log('\n--- Venta ---');
const vt = asientoVenta(ventaBase);
check('venta cuadra', cuadra(vt), `${vt.totalDebe} vs ${vt.totalHaber}`);
check('venta: 12 CxC al debe por 118', saldo(vt, '12') === 118);
check('venta: 70 Ventas al haber por 100', saldo(vt, '70') === -100);
check('venta: 40111 IGV por pagar al haber por 18', saldo(vt, '40111') === -18);
check('venta: no toca compras', saldo(vt, '60') === 0);

// Venta con retención de IGV. La retención entra por el DEBE (crédito a favor
// del cliente), no restando del CxC y abonándola: eso la descontaría dos veces.
const ret = asientoVenta({ ...ventaBase, retencion: 3 });
check('venta con retención cuadra', cuadra(ret), `${ret.totalDebe} vs ${ret.totalHaber}`);
check('retención: debe = 118 (115 neto + 3 retenido)', ret.totalDebe === 118);
check('retención: CxC baja a 115', saldo(ret, '12') === 115);
check('retención: ingreso sigue en 100', saldo(ret, '70') === -100);
check('retención: IGV por pagar sigue en 18 (no se reduce)', saldo(ret, '40111') === -18);
check('retención: 40114 al debe por 3', saldo(ret, '40114') === 3);

// Venta exonerada
const vExo = asientoVenta({ ...ventaBase, base: 0, igv: 0, exonerado: 500, total: 500 });
check('venta exonerada cuadra', cuadra(vExo));
check('venta exonerada: 70 por 500', saldo(vExo, '70') === -500);
check('venta exonerada: sin IGV', saldo(vExo, '40111') === 0);

// ---------------------------------------------------------------------------
// 3. Notas de crédito y débito
// ---------------------------------------------------------------------------
console.log('\n--- Notas ---');
const nc = generarAsiento({ ...ventaBase, tipo: 'nota_credito' });
check('NC de venta cuadra', cuadra(nc), `${nc.totalDebe} vs ${nc.totalHaber}`);
check('NC invierte: 70 al debe (reduce el ingreso)', saldo(nc, '70') === 100);
check('NC invierte: 12 al haber', saldo(nc, '12') === -118);
check('NC invierte: 40111 al debe (baja el IGV por pagar)', saldo(nc, '40111') === 18);
check('NC se identifica en la glosa', nc.glosa.includes('nota de crédito'));

const ncCompra = generarAsiento({ ...compraBase, tipo: 'nota_credito' });
check('NC de compra cuadra', cuadra(ncCompra));
check('NC compra: 60 al haber', saldo(ncCompra, '60') === -100);
check('NC compra: 40112 al haber (baja el crédito fiscal)', saldo(ncCompra, '40112') === -18);

check(
  'NC sin importe lanza en vez de inventar',
  lanza(() => generarAsiento({ ...ventaBase, tipo: 'nota_credito', total: 0 }))
);

const nd = generarAsiento({ ...ventaBase, tipo: 'nota_debito' });
check('nota de débito cuadra', cuadra(nd));
check('nota de débito suma igual que la venta', saldo(nd, '12') === 118);
check('nota de débito se identifica', nd.glosa.includes('nota de débito'));

// ---------------------------------------------------------------------------
// 4. Inversión genérica
// ---------------------------------------------------------------------------
console.log('\n--- Invertir ---');
const inv = invertir(cp);
check('invertir cuadra', cuadra(inv));
check('invertir: 60 pasa al haber', saldo(inv, '60') === -100);
check('invertir: 42 pasa al debe', saldo(inv, '42') === 118);
check('invertir no altera el total', inv.totalDebe === cp.totalHaber);

// ---------------------------------------------------------------------------
// 5. Costo de venta
// ---------------------------------------------------------------------------
console.log('\n--- Costo de venta ---');
const cv = asientoCostoVenta(60, '2026-11-10', 'venta F001-1');
check('costo de venta cuadra', cuadra(cv));
check('costo: 69 al debe', saldo(cv, '69') === 60);
check('costo: 20 al haber', saldo(cv, '20') === -60);
check('costo cero lanza', lanza(() => asientoCostoVenta(0, '2026-11-10', 'x')));

// ---------------------------------------------------------------------------
// 6. Propiedad: TODOS los asientos cuadran
// ---------------------------------------------------------------------------
console.log('\n--- Propiedad: todo asiento cuadra ---');
const casos: ComprobanteContable[] = [];
const importes = [0, 1, 10, 100, 33.33, 99.99, 1000, 12345.67];
for (const base of importes) {
  for (const igv of [0, Math.round(base * 0.18 * 100) / 100]) {
    for (const exonerado of [0, 50]) {
      for (const operacion of ['venta', 'compra'] as const) {
        for (const tipo of ['factura', 'boleta', 'nota_credito', 'nota_debito'] as const) {
          const total = Math.round((base + igv + exonerado) * 100) / 100;
          if (tipo === 'nota_credito' && total === 0) continue; // lanza a propósito
          if (total === 0) continue; // un comprobante de importe cero no genera asiento
          casos.push({
            tipo, serie: 'F001', numero: '1', fechaEmision: '2026-11-10',
            base, igv, exonerado, total, operacion,
          });
        }
      }
    }
  }
}
let generados = 0;
let descuadrados = 0;
let lanzados = 0;
for (const caso of casos) {
  try {
    const a = generarAsiento(caso);
    generados++;
    if (!cuadra(a)) {
      descuadrados++;
      console.log(`  DESCUADRE en ${JSON.stringify(caso)}: ${a.totalDebe} vs ${a.totalHaber}`);
    }
    if (a.lineas.length < 2) {
      descuadrados++;
      console.log(`  UNA SOLA LÍNEA en ${JSON.stringify(caso)}`);
    }
  } catch (e) {
    lanzados++;
    console.log(`  LANZÓ con ${JSON.stringify(caso)}: ${(e as Error).message}`);
  }
}
check(`${generados} asientos generados de ${casos.length}`, generados === casos.length, `lanzados: ${lanzados}`);
check('ninguno descuadrado', descuadrados === 0);

// Cuentas usadas existen en el catálogo PCGE
const codigosValidos = new Set(Object.values(CUENTAS).map((x) => x.codigo));
let cuentaMala = 0;
for (const caso of casos) {
  try {
    for (const l of generarAsiento(caso).lineas) {
      if (!codigosValidos.has(l.cuenta)) {
        cuentaMala++;
        console.log(`  cuenta fuera de catálogo: ${l.cuenta}`);
      }
    }
  } catch { /* los que lanzan ya se contaron */ }
}
check('todas las cuentas son del catálogo PCGE', cuentaMala === 0);

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
