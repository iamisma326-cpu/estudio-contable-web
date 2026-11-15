/**
 * Arma los libros PLE de un período a partir de una carpeta con los XML.
 *
 * Sirve para preparar el archivo que se sube al validador de SUNAT sin tocar la
 * base ni desplegar nada: se apunta a una carpeta, se elige el mes y salen los
 * dos .txt junto a un informe de lo que quedó fuera.
 *
 * También es la forma de revisar un período real antes de presentarlo: el
 * informe dice, comprobante por comprobante, qué no entró y por qué.
 *
 * Uso:
 *   node --experimental-strip-types --import ./scripts/_resolver-ts.mjs \
 *     scripts/ple-desde-carpeta.ts <carpeta> <aaaa-mm> <RUC-del-cliente> [salida]
 *
 * Ejemplo:
 *   npm run ple:desde -- ~/facturas/cliente-x 2026-10 20512345671 ./salida
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { ingerirDesdeXML } from '../api/_lib/ingesta.ts';
import { parsearXML } from '../api/_lib/xml-ubl.ts';
import { tieneErrores } from '../api/_lib/comprobante.ts';
import { generarPLE, nombreArchivo, type FormatoPLE } from '../api/_lib/ple.ts';
import type { ComprobanteIngerido } from '../api/_lib/ingesta.ts';

const [carpetaArg, periodo, rucArg, salidaArg] = process.argv.slice(2);

if (!carpetaArg || !periodo || !rucArg) {
  console.error('Uso: ple-desde-carpeta.ts <carpeta> <aaaa-mm> <RUC-del-cliente> [salida]');
  process.exit(1);
}
if (!/^\d{4}-\d{2}$/.test(periodo)) {
  console.error(`El período debe ser aaaa-mm; llegó '${periodo}'.`);
  process.exit(1);
}
if (!/^\d{11}$/.test(rucArg)) {
  console.error(`El RUC debe tener 11 dígitos; llegó '${rucArg}'.`);
  process.exit(1);
}

const carpeta = resolve(carpetaArg);
if (!existsSync(carpeta)) {
  console.error(`No existe la carpeta ${carpeta}.`);
  process.exit(1);
}

const archivos = readdirSync(carpeta).filter((f) => extname(f).toLowerCase() === '.xml');
if (archivos.length === 0) {
  console.error(`No hay archivos .xml en ${carpeta}.`);
  process.exit(1);
}

console.log(`Leyendo ${archivos.length} XML de ${carpeta}`);
console.log(`Período ${periodo}, RUC ${rucArg}\n`);

const dentro: ComprobanteIngerido[] = [];
const fuera: Array<{ archivo: string; motivo: string }> = [];

for (const nombre of archivos) {
  const xml = readFileSync(join(carpeta, nombre), 'utf8');

  // El comprobante debe pertenecer al cliente. Si el RUC no coincide con ninguno
  // de los dos lados, el archivo no es suyo: sin esto se mezclarían meses de
  // contribuyentes distintos en un mismo libro.
  // Dos pasos, como en el endpoint: primero se lee el XML, luego se decide
  // qué se puede afirmar de lo leído.
  const c = ingerirDesdeXML(parsearXML(xml), { rucPropio: rucArg, periodo });

  const esDelCliente = c.rucEmisor === rucArg || c.rucReceptor === rucArg;
  if (!esDelCliente) {
    fuera.push({ archivo: nombre, motivo: `no es de este RUC (emisor ${c.rucEmisor ?? '?'}, receptor ${c.rucReceptor ?? '?'})` });
    continue;
  }

  if (tieneErrores(c.hallazgos)) {
    fuera.push({
      archivo: nombre,
      motivo: c.hallazgos.filter((h) => h.gravedad === 'error').map((h) => h.mensaje).join('; '),
    });
    continue;
  }

  // La ingesta ya marcó el lado con rucPropio; aquí solo se comprueba la fecha.
  const deLaFecha = (c.fechaEmision ?? '').slice(0, 7);
  if (deLaFecha !== periodo) {
    fuera.push({ archivo: nombre, motivo: `es del período ${deLaFecha || '?'}, no de ${periodo}` });
    continue;
  }

  // Se confirma en el acto: el archivo es para revisar el formato, no para
  // decidir si el comprobante está bien. El aviso de cada uno va al informe.
  dentro.push({ ...c, estado: 'confirmado' });
}

console.log(`Dentro del período: ${dentro.length}`);
console.log(`Fuera: ${fuera.length}\n`);

for (const f of fuera) console.log(`  fuera  ${f.archivo}: ${f.motivo}`);

const formatos: FormatoPLE[] = ['14.1', '8.1'];
const salida = salidaArg ? resolve(salidaArg) : join(process.cwd(), `ple-${periodo}`);
mkdirSync(salida, { recursive: true });

const informe: string[] = [
  `PLE ${periodo} · RUC ${rucArg}`,
  `Generado: ${new Date().toISOString()}`,
  `XML leídos: ${archivos.length}`,
  `Comprobantes en el período: ${dentro.length}`,
  `Fuera: ${fuera.length}`,
  '',
];

console.log();
for (const formato of formatos) {
  const r = generarPLE(dentro, formato, { periodo });
  const nombre = nombreArchivo(rucArg, periodo, formato);
  const ruta = join(salida, nombre);
  // CRLF explícito: el archivo se escribe tal cual se presenta.
  writeFileSync(ruta, r.contenido, 'utf8');

  const t = r.totales;
  console.log(`${nombre}`);
  console.log(`  ${r.lineas.length} registros · base ${t.base.toFixed(2)} · IGV ${t.igv.toFixed(2)} · total ${t.total.toFixed(2)}`);
  for (const p of r.problemas) console.log(`  aviso: ${p}`);

  informe.push(`${nombre}`, `  registros: ${r.lineas.length}`,
    `  base: ${t.base.toFixed(2)}`, `  igv: ${t.igv.toFixed(2)}`,
    `  exonerado: ${t.exonerado.toFixed(2)}`, `  total: ${t.total.toFixed(2)}`);
  for (const p of r.problemas) informe.push(`  aviso: ${p}`);
  informe.push('');
}

informe.push('Comprobantes fuera del archivo:');
for (const f of fuera) informe.push(`  ${f.archivo}: ${f.motivo}`);

writeFileSync(join(salida, 'informe.txt'), informe.join('\n'), 'utf8');

console.log(`\nArchivos en ${salida}`);
console.log('Antes de presentarlos: subir cada .txt al validador del PLE de SUNAT con la Clave SOL.');
