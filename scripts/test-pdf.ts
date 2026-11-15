/**
 * Banco de pruebas del extractor de facturas desde texto PDF.
 *
 * No hay muestras reales todavía, así que los casos son transcripciones de las
 * maquetaciones habituales de los sistemas de facturación peruanos (Nubox,
 * Facturador SUNAT, SISCONT, Facturalux). Sirven para verificar la LÓGICA: que
 * encuentre cada campo en el formato en que aparece. Cuando lleguen PDFs reales
 * habrá que añadir sus casos, no reescribir el código.
 *
 * Uso: npm run test:pdf
 */

import {
  normalizar,
  importe,
  fechaISO,
  buscarSerieNumero,
  buscarTipo,
  extraerCampos,
} from '../src/lib/pdf-factura.ts';
import { rucValido } from '../src/lib/comprobante.ts';
import { ingerirDesdePDF } from '../src/lib/ingesta.ts';
import { generarAsiento } from '../src/lib/asientos.ts';

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

function eq(desc: string, real: unknown, esperado: unknown) {
  check(desc, JSON.stringify(real) === JSON.stringify(esperado), `real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`);
}

// ---------------------------------------------------------------------------
console.log('--- Normalización ---');
eq('quita acentos', normalizar('Emisión'), 'EMISION');
eq('colapsa CRLF', normalizar('a\r\nb'), 'A\nB');
check('conserva el texto minúsculo convertido', normalizar('factura') === 'FACTURA');

// ---------------------------------------------------------------------------
console.log('\n--- Importes ---');
eq('decimal simple', importe('118.00'), 118);
eq('con coma de miles', importe('1,234.56'), 1234.56);
eq('formato es-PE (1.234,56)', importe('1.234,56'), 1234.56);
eq('con símbolo', importe('S/ 118.00'), 118);
eq('negativo', importe('-118.00'), -118);
eq('basura', importe('abc'), null);
eq('vacío', importe(''), null);
eq('null', importe(null), null);
eq('solo entero grande', importe('1,000'), 1000);

// ---------------------------------------------------------------------------
console.log('\n--- Fechas ---');
eq('ISO', fechaISO('2026-11-10'), '2026-11-10');
eq('dd/mm/yyyy', fechaISO('10/11/2026'), '2026-11-10');
eq('d/m/yyyy', fechaISO('1/9/2026'), '2026-09-01');
eq('dd-mm-yyyy', fechaISO('10-11-2026'), '2026-11-10');
eq('texto largo', fechaISO('10 de noviembre de 2026'), '2026-11-10');
eq('setiembre', fechaISO('5 de setiembre de 2026'), '2026-09-05');
eq('inválida', fechaISO('hola'), null);
eq('null', fechaISO(null), null);

// ---------------------------------------------------------------------------
console.log('\n--- Serie y número ---');
eq('factura', buscarSerieNumero('FACTURA N° F001-1234'), { serie: 'F001', numero: '1234' });
eq('boleta', buscarSerieNumero('BOLETA B001-7'), { serie: 'B001', numero: '7' });
eq('quita ceros a la izquierda', buscarSerieNumero('F001-00001234'), { serie: 'F001', numero: '1234' });
eq('serie de 4 con letra y dígito', buscarSerieNumero('FC01-99'), { serie: 'FC01', numero: '99' });
eq('sin serie', buscarSerieNumero('no hay nada'), null);
eq('no confunde un RUC', buscarSerieNumero('RUC 20131312955'), null);

// ---------------------------------------------------------------------------
console.log('\n--- Tipo ---');
eq('factura', buscarTipo('FACTURA ELECTRONICA'), 'factura');
eq('boleta', buscarTipo('BOLETA DE VENTA ELECTRONICA'), 'boleta');
eq('nota de crédito gana a factura', buscarTipo('NOTA DE CREDITO ELECTRONICA'), 'nota_credito');
eq('nota de débito', buscarTipo('NOTA DE DEBITO'), 'nota_debito');
eq('ninguno', buscarTipo('COMPROBANTE'), null);

// ---------------------------------------------------------------------------
console.log('\n--- Factura completa (maquetación tipo Nubox) ---');
const NUBOX = `
PROVEEDOR SERVICIOS GENERALES S.A.C.
RUC EMISOR: 20131312955
Av. Javier Prado Este 1234, Lima

FACTURA ELECTRONICA
N° F001-00012345
Fecha de Emisión: 10/11/2026

CLIENTE
RUC: 20512345671
RAZON SOCIAL: CLIENTE DE PRUEBA S.A.C.

DESCRIPCION            CANT   V.UNIT     TOTAL
Servicio de consultoria   1   100.00    100.00

OP. GRAVADAS:      S/ 100.00
I.G.V. (18%):      S/  18.00
IMPORTE TOTAL:     S/ 118.00

SON: CIENTO DIECIOCHO CON 00/100 SOLES
`;

{
  const c = extraerCampos(NUBOX, rucValido);
  eq('tipo', c.tipo, 'factura');
  eq('serie', c.serie, 'F001');
  eq('numero', c.numero, '12345');
  eq('fecha', c.fechaEmision, '2026-11-10');
  eq('RUC emisor', c.rucEmisor, '20131312955');
  eq('RUC receptor', c.rucReceptor, '20512345671');
  eq('base', c.base, 100);
  eq('igv', c.igv, 18);
  eq('total', c.total, 118);
  eq('moneda', c.moneda, 'PEN');
  check('confianza alta (0.9)', c.confianza === 0.9, String(c.confianza));
  eq('sin faltantes', c.faltantes, []);
  eq('sin avisos', c.avisos, []);
}

// ---------------------------------------------------------------------------
console.log('\n--- Boleta con exonerado ---');
const BOLETA = `
BODEGA LA ESQUINA E.I.R.L.
RUC: 10456789124

BOLETA DE VENTA ELECTRONICA
B001-000456
Fecha Emision: 05-09-2026

OP. EXONERADAS    S/ 50.00
IMPORTE TOTAL     S/ 50.00
`;
{
  const c = extraerCampos(BOLETA, rucValido);
  eq('tipo', c.tipo, 'boleta');
  eq('serie', c.serie, 'B001');
  eq('numero', c.numero, '456');
  eq('fecha', c.fechaEmision, '2026-09-05');
  eq('RUC emisor', c.rucEmisor, '10456789124');
  eq('exonerado', c.exonerado, 50);
  eq('total', c.total, 50);
  check('sin base: no se inventa', c.base === null);
  check('avisa del faltante', c.faltantes.includes('serie') === false);
}

// ---------------------------------------------------------------------------
console.log('\n--- Factura con descuento: el total no es la suma ---');
const DESCUENTO = `
EMPRESA XYZ S.A.C.
RUC: 20100047218

FACTURA ELECTRONICA
F002-88
Fecha de Emision: 15/11/2026

OP. GRAVADAS     S/ 200.00
DESCUENTO        S/ -20.00
I.G.V. 18%       S/  32.40
IMPORTE TOTAL    S/ 212.40
`;
{
  const c = extraerCampos(DESCUENTO, rucValido);
  eq('total', c.total, 212.4);
  eq('base', c.base, 200);
  eq('igv', c.igv, 32.4);
  check(
    'avisa que base+igv no da el total (hay descuento)',
    c.avisos.some((a) => /no coincide/.test(a)),
    c.avisos.join(' | ')
  );
}

// ---------------------------------------------------------------------------
console.log('\n--- Dólares ---');
const USD = `
IMPORTADORA ANDINA S.A.C.
RUC: 20100047218

FACTURA ELECTRONICA
F003-1
Fecha de Emision: 01/11/2026

OP. GRAVADAS     US$ 1,000.00
I.G.V. 18%       US$   180.00
IMPORTE TOTAL    US$ 1,180.00
`;
{
  const c = extraerCampos(USD, rucValido);
  eq('moneda USD', c.moneda, 'USD');
  eq('total con miles', c.total, 1180);
  eq('base con miles', c.base, 1000);
}

// ---------------------------------------------------------------------------
console.log('\n--- Múltiples RUC: distingue emisor de cliente ---');
const DOS_RUC = `
CONSTRUCTORA DEL PACIFICO S.A.C.
RUC EMISOR: 20131312955

FACTURA ELECTRONICA
F001-777
Fecha de Emision: 20/10/2026

CLIENTE RUC: 20100047218
INMUEBLES LIMA SUR S.A.

OP. GRAVADAS   S/ 5,000.00
I.G.V.         S/   900.00
TOTAL          S/ 5,900.00
`;
{
  const c = extraerCampos(DOS_RUC, rucValido);
  eq('emisor correcto', c.rucEmisor, '20131312955');
  eq('receptor correcto', c.rucReceptor, '20100047218');
  eq('total', c.total, 5900);
}

// ---------------------------------------------------------------------------
console.log('\n--- Casos que deben fallar con dignidad ---');
{
  const c = extraerCampos('HOLA', rucValido);
  eq('texto basura: tipo null', c.tipo, null);
  eq('texto basura: total null', c.total, null);
  eq('texto basura: confianza 0', c.confianza, 0);
  check('texto basura: avisa de escaneo', c.avisos.length > 0);
}
{
  // Escaneo: el PDF no tiene capa de texto.
  const c = extraerCampos('', rucValido);
  check('vacío: confianza 0', c.confianza === 0);
  check('vacío: todos los obligatorios faltan', c.faltantes.length === 5, String(c.faltantes.length));
}
{
  // RUC que no pasa el dígito verificador: no debe tomarlo como emisor.
  const MALO = `
FACTURA ELECTRONICA
F001-1
Fecha de Emision: 01/01/2026
RUC: 20131312956
TOTAL S/ 100.00
`;
  const c = extraerCampos(MALO, rucValido);
  eq('RUC inválido descartado', c.rucEmisor, null);
  check('avisa de la falta de RUC', c.avisos.some((a) => /RUC/.test(a)), c.avisos.join(' | '));
}
{
  // Sin moneda explicita: se asume PEN y se avisa.
  const SIN_MONEDA = `
FACTURA ELECTRONICA
F001-2
Fecha de Emision: 01/01/2026
RUC: 20131312955
TOTAL 100.00
`;
  const c = extraerCampos(SIN_MONEDA, rucValido);
  eq('asume PEN', c.moneda, 'PEN');
  check('avisa de la moneda asumida', c.avisos.some((a) => /moneda/i.test(a)));
}

// ---------------------------------------------------------------------------
console.log('\n--- La confianza refleja lo que falta ---');
{
  const COMPLETO = `
FACTURA ELECTRONICA
F001-999
Fecha de Emision: 10/11/2026
RUC: 20131312955
IMPORTE TOTAL S/ 118.00
`;
  const completo = extraerCampos(COMPLETO, rucValido);
  eq('5 de 5 obligatorios => 0.9', completo.confianza, 0.9);

  const SIN_TOTAL = `
FACTURA ELECTRONICA
F001-999
Fecha de Emision: 10/11/2026
RUC: 20131312955
`;
  const parcial = extraerCampos(SIN_TOTAL, rucValido);
  check('4 de 5 => 0.8', Math.abs(parcial.confianza - 0.8) < 0.001, String(parcial.confianza));
  check('menos confianza que el completo', parcial.confianza < completo.confianza);
  check('el total está entre los faltantes', parcial.faltantes.includes('total'), parcial.faltantes.join(','));
}

// ---------------------------------------------------------------------------
// Pipeline completo: PDF -> campos -> comprobante ingerido
// ---------------------------------------------------------------------------
console.log('\n--- Ingesta desde PDF ---');
{
  const c = ingerirDesdePDF(extraerCampos(NUBOX, rucValido), { rucPropio: '20512345671' });
  eq('origen pdf_texto', c.origen, 'pdf_texto');
  eq('operación venta (emisor es el propio RUC)', c.operacion, 'compra');
  eq('estado pendiente', c.estado, 'pendiente');
  eq('serie', c.serie, 'F001');
  eq('numero', c.numero, '12345');
  eq('total', c.total, 118);
  eq('base', c.base, 100);
  eq('igv', c.igv, 18);
  check('confianza no supera 0.8', c.confianza <= 0.8, String(c.confianza));
  eq('sin hallazgos de error', c.hallazgos.filter((h) => h.gravedad === 'error'), []);
  eq('clave de duplicado calculable', c.clave !== null, true);
}
{
  // El caso que importa: un campo que no se leyó no se convierte en 0 callado.
  const SIN_TOTAL = `
FACTURA ELECTRONICA
F001-999
Fecha de Emision: 10/11/2026
RUC: 20131312955
`;
  const c = ingerirDesdePDF(extraerCampos(SIN_TOTAL, rucValido));
  eq('total se queda en 0, no se inventa', c.total, 0);
  check(
    'hay un hallazgo de error por el total',
    c.hallazgos.some((h) => h.gravedad === 'error' && /total/.test(h.codigo)),
    c.hallazgos.map((h) => h.codigo).join(',')
  );
  check('nunca queda confirmado', c.estado !== 'confirmado');
  check('nunca queda revisado', c.estado === 'pendiente', c.estado);
}
{
  // Un PDF escaneado: todo falta, pero no debe reventar.
  const c = ingerirDesdePDF(extraerCampos('', rucValido));
  eq('tipo por defecto factura', c.tipo, 'factura');
  eq('total 0', c.total, 0);
  check('al menos 5 hallazgos de error', c.hallazgos.filter((h) => h.gravedad === 'error').length >= 5);
  eq('estado pendiente', c.estado, 'pendiente');
}
{
  // Dólares: se convierte a soles con el tipo de cambio dado.
  const c = ingerirDesdePDF(extraerCampos(USD, rucValido), {
    tipoCambio: { fecha: '2026-11-01', compra: 3.4, venta: 3.5 },
  });
  eq('moneda original USD', c.moneda, 'USD');
  check('total convertido a soles', c.total > 3000 && c.total < 5000, String(c.total));
  check('tipo de cambio aplicado', c.tipoCambio !== null);
}
{
  // Duplicado siempre pendiente.
  const c = ingerirDesdePDF(extraerCampos(NUBOX, rucValido), { yaExiste: true });
  check('duplicado reportado', c.hallazgos.some((h) => h.codigo === 'duplicado'));
  eq('duplicado pendiente', c.estado, 'pendiente');
}

// ---------------------------------------------------------------------------
console.log('\n--- Un PDF no genera asiento si faltan importes ---');
{
  const c = ingerirDesdePDF(extraerCampos('', rucValido));
  let lanzo = false;
  try {
    generarAsiento(c, { clienteId: 'c', periodo: '2026-11' });
  } catch {
    lanzo = true;
  }
  check('generarAsiento rechaza un comprobante sin importes', lanzo);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
