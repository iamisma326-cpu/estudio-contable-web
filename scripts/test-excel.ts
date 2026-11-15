/**
 * Banco de pruebas del Excel de salida.
 *
 * Lo importante no es que la función no lance, sino que el archivo que sale sea
 * un ZIP válido y que su XML se pueda leer. Se descomprime el buffer con zlib y
 * se comprueba la estructura que Excel exige; si algo falta, Excel abre el libro
 * "reparado" y pierde el formato o las hojas.
 *
 * Uso: npm run test:excel
 */

import { inflateRawSync } from 'node:zlib';
import { crearZip, crc32 } from '../api/_lib/zip.ts';
import { crearXlsx, letraColumna } from '../api/_lib/xlsx.ts';
import { crearLibroMensual, nombreLibro } from '../api/_lib/libro-excel.ts';
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

// ---------------------------------------------------------------------------
console.log('--- CRC-32 ---');
// Valor conocido: CRC-32 de "123456789" es 0xCBF43926.
eq('CRC-32 de prueba estándar', crc32(Buffer.from('123456789')), 0xcbf43926);
eq('CRC-32 vacío', crc32(Buffer.alloc(0)), 0);

// ---------------------------------------------------------------------------
console.log('\n--- Letras de columna ---');
eq('1 => A', letraColumna(1), 'A');
eq('26 => Z', letraColumna(26), 'Z');
eq('27 => AA', letraColumna(27), 'AA');
eq('52 => AZ', letraColumna(52), 'AZ');
eq('53 => BA', letraColumna(53), 'BA');

// ---------------------------------------------------------------------------
/**
 * Lee un ZIP de vuelta: recorre el directorio central y extrae cada entrada.
 * Es la única forma de comprobar que el formato es correcto, en vez de confiar
 * en que zlib no se queje.
 */
function leerZip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  // Buscar el fin del directorio central (22 bytes, sin comentario).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No se encontró el fin del directorio central');

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Firma central inválida');
    const metodo = buf.readUInt16LE(p + 10);
    const crcEsperado = buf.readUInt32LE(p + 16);
    const comprimido = buf.readUInt32LE(p + 20);
    const sinComprimir = buf.readUInt32LE(p + 24);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const offsetLocal = buf.readUInt32LE(p + 42);

    const nombre = buf.subarray(p + 46, p + 46 + largoNombre).toString('utf8');

    const lNombre = buf.readUInt16LE(offsetLocal + 26);
    const lExtra = buf.readUInt16LE(offsetLocal + 28);
    const inicio = offsetLocal + 30 + lNombre + lExtra;
    const datos = buf.subarray(inicio, inicio + comprimido);

    const contenido = metodo === 8 ? inflateRawSync(datos) : datos;
    if (contenido.length !== sinComprimir) throw new Error(`${nombre}: tamaño no coincide`);
    if (crc32(contenido) !== crcEsperado) throw new Error(`${nombre}: CRC no coincide`);

    out.set(nombre, contenido.toString('utf8'));
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return out;
}

// ---------------------------------------------------------------------------
console.log('\n--- ZIP de ida y vuelta ---');
{
  const buf = crearZip([
    { nombre: 'a.txt', contenido: 'hola' },
    { nombre: 'carpeta/b.txt', contenido: 'mundo mundo mundo mundo mundo' },
  ]);
  // Firma PK\x03\x04 al principio.
  check('empieza con firma ZIP', buf.readUInt32LE(0) === 0x04034b50);
  const entradas = leerZip(buf);
  eq('dos entradas', entradas.size, 2);
  eq('contenido de a', entradas.get('a.txt'), 'hola');
  eq('contenido de b', entradas.get('carpeta/b.txt'), 'mundo mundo mundo mundo mundo');
}
{
  // Un texto muy repetido debe comprimir.
  const texto = 'Factura F001-12345 cliente ABC base 100 IGV 18 '.repeat(200);
  const buf = crearZip([{ nombre: 'grande.txt', contenido: texto }]);
  check('el texto repetido comprime', buf.length < texto.length / 2, `${buf.length} vs ${texto.length}`);
  eq('y se recupera igual', leerZip(buf).get('grande.txt'), texto);
}

// ---------------------------------------------------------------------------
console.log('\n--- XLSX: estructura que Excel exige ---');
{
  const buf = crearXlsx([{ nombre: 'Hoja1', encabezado: ['A', 'B'], filas: [[1, 2]] }]);
  const partes = leerZip(buf);

  for (const ruta of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ]) {
    check(`contiene ${ruta}`, partes.has(ruta), [...partes.keys()].join(', '));
  }

  const ct = partes.get('[Content_Types].xml') ?? '';
  check('declara el tipo de hoja', ct.includes('spreadsheetml.sheet.main+xml'));
  check('declara cada worksheet', ct.includes('/xl/worksheets/sheet1.xml'));

  const wb = partes.get('xl/workbook.xml') ?? '';
  check('el libro nombra la hoja', wb.includes('name="Hoja1"'));
  check('la hoja tiene r:id', wb.includes('r:id="rId1"'));

  const hoja = partes.get('xl/worksheets/sheet1.xml') ?? '';
  check('es XML de worksheet', hoja.includes('<worksheet'));
  check('lleva la fila de encabezado', hoja.includes('<row r="1"'));
  check('lleva la fila de datos', hoja.includes('<row r="2"'));
  check('los números van como número', hoja.includes('<v>1</v>') && hoja.includes('<v>2</v>'));
}

// ---------------------------------------------------------------------------
console.log('\n--- XLSX: carteles y casos raros ---');
{
  // XML roto = Excel rechaza el libro entero.
  const buf = crearXlsx([{
    nombre: 'Raro',
    encabezado: ['Texto'],
    filas: [['A & B < C > D "comillas"'], ['con\x01control']],
  }]);
  const hoja = leerZip(buf).get('xl/worksheets/sheet1.xml') ?? '';
  check('escapa el &', hoja.includes('A &amp; B'));
  check('escapa < y >', hoja.includes('&lt;') && hoja.includes('&gt;'));
  check('escapa comillas', hoja.includes('&quot;'));
  check('quita caracteres de control', !hoja.includes('\x01'));
}
{
  // Una fila con huecos: la referencia A1 debe respetar la columna real,
  // si no Excel corre todas las celdas a la izquierda.
  const buf = crearXlsx([{ nombre: 'H', filas: [[null, 'b', null, 'd']] }]);
  const hoja = leerZip(buf).get('xl/worksheets/sheet1.xml') ?? '';
  check('la celda b va en B1', hoja.includes('r="B1"'));
  check('la celda d va en D1', hoja.includes('r="D1"'));
  check('no emite celdas vacías', !hoja.includes('r="A1"'));
}
{
  const buf = crearXlsx([{ nombre: 'N', filas: [[1.5, NaN, Infinity]] }]);
  const hoja = leerZip(buf).get('xl/worksheets/sheet1.xml') ?? '';
  check('escribe el decimal', hoja.includes('<v>1.5</v>'));
  check('no escribe NaN ni Infinity', !hoja.includes('NaN') && !hoja.includes('Infinity'));
}
{
  const buf = crearXlsx([
    { nombre: 'Uno', filas: [['x']] },
    { nombre: 'Dos', filas: [['y']] },
  ]);
  const partes = leerZip(buf);
  const wb = partes.get('xl/workbook.xml') ?? '';
  check('dos hojas en el libro', (wb.match(/<sheet /g) ?? []).length === 2);
  check('existe sheet2', partes.has('xl/worksheets/sheet2.xml'));
  // 2 worksheet + 1 styles: se busca la ruta de cada hoja, no la palabra
  // 'worksheet', que también aparece dentro del atributo Type del rel de estilos.
  const rels = partes.get('xl/_rels/workbook.xml.rels') ?? '';
  check('los rels apuntan a las dos hojas', rels.includes('worksheets/sheet1.xml') && rels.includes('worksheets/sheet2.xml'));
  check('los rels declaran los estilos', rels.includes('styles.xml'));
}
{
  let lanzo = false;
  try { crearXlsx([]); } catch { lanzo = true; }
  check('sin hojas lanza', lanzo);
}
{
  // Un nombre de hoja con apóstrofo o acento no debe romper el XML.
  const buf = crearXlsx([{ nombre: "Año '26", filas: [['x']] }]);
  const wb = leerZip(buf).get('xl/workbook.xml') ?? '';
  check('el nombre va escapado', wb.includes('Año') && !wb.includes("26'"));
  check('XML válido con acento', wb.includes('encoding="UTF-8"'));
}

// ---------------------------------------------------------------------------
console.log('\n--- Libro mensual: cinco hojas ---');
function comp(over: Partial<ComprobanteIngerido> = {}): ComprobanteIngerido {
  return {
    tipo: 'factura', operacion: 'compra', serie: 'F001', numero: '1',
    fechaEmision: '2026-11-10', rucEmisor: '20131312935', rucReceptor: '20512345671',
    razonEmisor: 'PROVEEDOR SAC', moneda: 'PEN', tipoCambio: null,
    base: 100, igv: 18, exonerado: 0, total: 118, afectacion: '10',
    origen: 'xml', confianza: 0.99, estado: 'confirmado',
    hallazgos: [], avisos: [], clave: 'k',
    ...over,
  };
}

const asiento = () => [
  { cuenta: '60', nombre: 'Compras', debe: 100, haber: 0 },
  { cuenta: '40111', nombre: 'IGV', debe: 18, haber: 0 },
  { cuenta: '42', nombre: 'Proveedores', debe: 0, haber: 118 },
];

const igvVacio = {
  ventas: { baseGravada: 0, igv: 0, exonerado: 0, inafecto: 0, total: 0, cantidad: 0 },
  compras: { baseGravada: 0, igv: 0, exonerado: 0, inafecto: 0, total: 0, cantidad: 0 },
  resultadoIGV: 0, saldoAnterior: 0, saldoAFavor: 0, igvAPagar: 0, avisos: [],
};
const rentaVacia = { ingresosNetos: 0, tasa: 0.01, monto: 0, criterio: 'tasa' as const, avisos: [] };

{
  const buf = crearLibroMensual(
    {
      periodo: '2026-11',
      cliente: { ruc: '20512345671', razonSocial: 'CLIENTE SA', regimen: 'RMT' },
      confirmados: [
        // El fixture antes ponía el nombre del cliente en razonEmisor, que es
        // precisamente el dato equivocado: en una venta razonEmisor es uno
        // mismo. Así el test acompañaba al bug en vez de detectarlo.
        comp({ operacion: 'venta', razonEmisor: 'MI EMPRESA SAC', razonReceptor: 'CLIENTE SA', rucReceptor: '20400000001' }),
        comp({ numero: '2' }),
      ],
      pendientes: [{ comprobante: comp({ numero: '3', estado: 'pendiente' }), motivo: 'Sin confirmar' }],
      igv: { ...igvVacio, igvAPagar: 90, resultadoIGV: 90 },
      renta: { ...rentaVacia, ingresosNetos: 1000, monto: 10 },
    },
    asiento
  );

  const partes = leerZip(buf);
  const wb = partes.get('xl/workbook.xml') ?? '';
  const nombres = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  eq('las cinco hojas de la propuesta', nombres, ['Ventas', 'Compras', 'Diario', 'Resumen', 'Pendientes']);

  const ventas = partes.get('xl/worksheets/sheet1.xml') ?? '';
  const compras = partes.get('xl/worksheets/sheet2.xml') ?? '';
  check('Ventas tiene la venta', ventas.includes('20400000001'));
  check('Compras NO tiene la venta', !compras.includes('20400000001'));
  check('Compras tiene la compra', compras.includes('20131312935'));
  check('Ventas no tiene las compras', !ventas.includes('20131312935'));
  // En el libro de ventas la razón social es la del cliente; si sale la propia,
  // el libro declara que la empresa se facturó a sí misma.
  check('Ventas nombra al cliente', ventas.includes('CLIENTE SA'), ventas.slice(0, 200));
  check('Ventas NO nombra al propio emisor', !ventas.includes('MI EMPRESA SAC'));

  const diario = partes.get('xl/worksheets/sheet3.xml') ?? '';
  check('Diario tiene la cuenta 60', diario.includes('60'));
  check('Diario tiene el debe y el haber', diario.includes('<v>100</v>') && diario.includes('<v>118</v>'));

  // Orden del libro: 1 Ventas, 2 Compras, 3 Diario, 4 Resumen, 5 Pendientes.
  const resumen = partes.get('xl/worksheets/sheet4.xml') ?? '';
  check('Resumen lleva el RUC', resumen.includes('20512345671'), resumen.slice(0, 80));
  check('Resumen lleva el régimen', resumen.includes('RMT'));

  check('hay una hoja de pendientes', nombres.includes('Pendientes'));
  const pendientes = partes.get('xl/worksheets/sheet5.xml') ?? '';
  check('el pendiente aparece con su estado', pendientes.includes('Pendiente de revisar'));
  check('el pendiente aparece con su motivo', pendientes.includes('Sin confirmar'));
}
{
  // Sin pendientes la hoja existe y queda vacía, no desaparece: si desapareciera,
  // quien lea el archivo pensaría que no hay nada por revisar.
  const buf = crearLibroMensual(
    {
      periodo: '2026-11',
      cliente: { ruc: '20512345671', razonSocial: 'X', regimen: 'RER' },
      confirmados: [],
      pendientes: [],
      igv: igvVacio,
      renta: rentaVacia,
    },
    asiento
  );
  const nombres = [...(leerZip(buf).get('xl/workbook.xml') ?? '').matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  check('las cinco hojas siguen ahí sin datos', nombres.length === 5);
}

// ---------------------------------------------------------------------------
console.log('\n--- Nombre del archivo ---');
eq('nombre del libro', nombreLibro('20512345671', '2026-11'), 'libro-20512345671-2026-11.xlsx');

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
