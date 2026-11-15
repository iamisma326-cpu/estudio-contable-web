/**
 * Pruebas del armado de libros PLE desde una carpeta de XML.
 *
 * Fijan lo que la herramienta decide cuando los archivos no vienen limpios:
 * un XML de otro mes, uno de otro contribuyente o uno con importes que no
 * cuadran no deben entrar al libro. Un mes real de un cliente trae de todo, y
 * meter de más en un libro que se presenta a SUNAT es peor que dejar fuera.
 *
 * Las fixtures viven en scripts/fixtures/ple y son UBL 2.1 mínimos pero con la
 * forma real: la afectación del IGV va dentro de cac:TaxCategory, como la emite
 * SUNAT. Ponerla en otro sitio hace que el IGV se lea como nulo.
 *
 * Uso: npm run test:ple-carpeta
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsearXML } from '../api/_lib/xml-ubl.ts';
import { ingerirDesdeXML } from '../api/_lib/ingesta.ts';
import { tieneErrores } from '../api/_lib/comprobante.ts';
import { generarPLE } from '../api/_lib/ple.ts';
import type { ComprobanteIngerido } from '../api/_lib/ingesta.ts';

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

const CARPETA = join(process.cwd(), 'scripts/fixtures/ple');
const CLI = '20100000009';
const PERIODO = '2026-10';

function leer(nombre: string): ComprobanteIngerido {
  const xml = readFileSync(join(CARPETA, nombre), 'utf8');
  return ingerirDesdeXML(parsearXML(xml), { rucPropio: CLI, periodo: PERIODO });
}

console.log('--- Lectura de cada archivo ---');
{
  const v = leer('v1.xml');
  check('la venta se marca como venta', v.operacion === 'venta', v.operacion);
  check('lee la base', v.base === 1000, String(v.base));
  check('lee el IGV', v.igv === 180, String(v.igv));
  check('lee el total', v.total === 1180, String(v.total));
  check('lee la serie y el número', v.serie === 'F001' && v.numero === '101', `${v.serie}-${v.numero}`);
  check('lee la fecha', v.fechaEmision === '2026-10-03', String(v.fechaEmision));
  check('no tiene errores', !tieneErrores(v.hallazgos), JSON.stringify(v.hallazgos));

  const c = leer('c1.xml');
  check('la compra se marca como compra', c.operacion === 'compra', c.operacion);
  check('la compra también cuadra', c.base === 600 && c.igv === 108 && c.total === 708,
    `${c.base}/${c.igv}/${c.total}`);
  check('la compra no tiene errores', !tieneErrores(c.hallazgos), JSON.stringify(c.hallazgos));
}

console.log('\n--- Lo que debe quedar fuera ---');
{
  const otroMes = leer('otro-mes.xml');
  check('la fecha de otro mes se ve', (otroMes.fechaEmision ?? '').slice(0, 7) === '2026-09',
    String(otroMes.fechaEmision));

  const ajeno = leer('otro-ruc.xml');
  check('el RUC ajeno no coincide con ninguno de los dos lados',
    ajeno.rucEmisor !== CLI && ajeno.rucReceptor !== CLI,
    `${ajeno.rucEmisor}/${ajeno.rucReceptor}`);
}

console.log('\n--- Un comprobante con IGV sin leer no entra ---');
{
  // Es el caso que se dio al escribir esto: si la afectación no está donde el
  // parser la busca, el IGV sale nulo. Debe salir como error, no como 0.
  const roto = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cbc:ID>F001-999</cbc:ID><cbc:IssueDate>2026-10-10</cbc:IssueDate>
    <cac:AccountingSupplierParty><cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6">${CLI}</cbc:ID></cac:PartyIdentification>
    </cac:Party></cac:AccountingSupplierParty>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">180.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="PEN">1000.00</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="PEN">180.00</cbc:TaxAmount>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:LegalMonetaryTotal>
      <cbc:PayableAmount currencyID="PEN">1180.00</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
  </Invoice>`;
  // El parser deja el IGV en null; la ingesta lo normaliza a 0 para que los
  // tipos no arrastren null. Lo que importa es que la validación NO lo deje
  // pasar como un comprobante de IGV cero: eso sería un crédito fiscal perdido.
  const xml = parsearXML(roto);
  check('el parser deja el IGV sin leer', xml.igv === null, String(xml.igv));

  const r = ingerirDesdeXML(xml, { rucPropio: CLI, periodo: PERIODO });
  check('y la validación lo marca como error', tieneErrores(r.hallazgos),
    JSON.stringify(r.hallazgos.map((h) => `${h.gravedad}:${h.codigo}`)));
}

console.log('\n--- El libro del período ---');
{
  const dentro: ComprobanteIngerido[] = [];
  for (const nombre of ['v1.xml', 'v2.xml', 'c1.xml']) {
    dentro.push({ ...leer(nombre), estado: 'confirmado' });
  }

  const v = generarPLE(dentro, '14.1', { periodo: PERIODO });
  check('dos ventas en el registro', v.lineas.length === 2, String(v.lineas.length));
  check('base sumada', v.totales.base === 3500, String(v.totales.base));
  check('IGV sumado', v.totales.igv === 630, String(v.totales.igv));
  check('total sumado', v.totales.total === 4130, String(v.totales.total));
  check('sin problemas', v.problemas.length === 0, v.problemas.join(' | '));

  const c = generarPLE(dentro, '8.1', { periodo: PERIODO });
  check('una compra en su registro', c.lineas.length === 1, String(c.lineas.length));
  check('la compra suma 708', c.totales.total === 708, String(c.totales.total));

  // Cada línea debe tener el número de campos de su anexo.
  check('34 campos en ventas', (v.contenido.split('\r\n')[0].split('|').length - 1) === 34);
  check('41 campos en compras', (c.contenido.split('\r\n')[0].split('|').length - 1) === 41);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
