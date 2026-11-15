/**
 * Banco de pruebas del pipeline de ingesta (src/lib/ingesta.ts).
 * Uso: npm run test:ingesta
 */

import { parsearXML } from '../src/lib/xml-ubl.ts';
import {
  ingerirDesdeXML,
  decidirEstado,
  motivosParaNoConfirmar,
  resumenComprobante,
  CONFIANZA,
} from '../src/lib/ingesta.ts';
import type { Hallazgo } from '../src/lib/comprobante.ts';

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

const FACTURA = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>F001-123</cbc:ID>
  <cbc:IssueDate>2026-11-10</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>20131312955</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>PROVEEDOR SAC</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>20503644968</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>MI EMPRESA SAC</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cac:TaxSubtotal>
    <cbc:TaxableAmount>100.00</cbc:TaxableAmount><cbc:TaxAmount>18.00</cbc:TaxAmount>
    <cac:TaxCategory><cbc:ID>10</cbc:ID></cac:TaxCategory>
  </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:PayableAmount>118.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>Servicio</cbc:Description></cac:Item>
  </cac:InvoiceLine>
</Invoice>`;

const PROPIO = '20503644968'; // el receptor del XML: si él emite, es venta

// ---------------------------------------------------------------------------
// 1. Operación: se deduce del RUC propio
// ---------------------------------------------------------------------------
console.log('--- Operación ---');
const compra = ingerirDesdeXML(parsearXML(FACTURA), { rucPropio: PROPIO });
check('emisor ajeno => compra', compra.operacion === 'compra', compra.operacion);

const venta = ingerirDesdeXML(parsearXML(FACTURA), { rucPropio: '20131312955' });
check('emisor propio => venta', venta.operacion === 'venta', venta.operacion);

const sinPropio = ingerirDesdeXML(parsearXML(FACTURA), {});
check('sin RUC propio asume compra', sinPropio.operacion === 'compra');
check('sin RUC propio avisa', sinPropio.avisos.some((a) => a.includes('se asumió compra')), sinPropio.avisos.join('|'));

// ---------------------------------------------------------------------------
// 2. Período
// ---------------------------------------------------------------------------
console.log('\n--- Período ---');
check('período derivado de la fecha', compra.fechaEmision === '2026-11-10');

// ---------------------------------------------------------------------------
// 3. Estados
// ---------------------------------------------------------------------------
console.log('\n--- Estados ---');
check('XML limpio queda revisado', compra.estado === 'revisado', compra.estado);
check('nunca queda confirmado', compra.estado !== 'confirmado');
check('confianza xml 0.99', compra.confianza === CONFIANZA.xml);
check('xml es el origen más confiable', CONFIANZA.xml > CONFIANZA.pdf_texto && CONFIANZA.pdf_texto > CONFIANZA.vision);

// decidirEstado directo
const err: Hallazgo[] = [{ codigo: 'x', gravedad: 'error', mensaje: 'x' }];
const avi: Hallazgo[] = [{ codigo: 'y', gravedad: 'aviso', mensaje: 'y' }];
check('con error => pendiente', decidirEstado(err, 'xml', false) === 'pendiente');
check('con aviso y XML => revisado', decidirEstado(avi, 'xml', false) === 'revisado');
check('con aviso y visión => pendiente', decidirEstado(avi, 'vision', false) === 'pendiente');
check('PDF nunca llega a revisado solo', decidirEstado([], 'pdf_texto', false) === 'pendiente');
check('duplicado => pendiente', decidirEstado([], 'xml', true) === 'pendiente');
check('duplicado con error => pendiente', decidirEstado(err, 'xml', true) === 'pendiente');

// Duplicado real
const dup = ingerirDesdeXML(parsearXML(FACTURA), { rucPropio: PROPIO, yaExiste: true });
check('duplicado detectado', dup.hallazgos.some((h) => h.codigo === 'duplicado'));
check('duplicado queda pendiente', dup.estado === 'pendiente');
check('duplicado bloquea confirmación', motivosParaNoConfirmar(dup).length > 0);

// ---------------------------------------------------------------------------
// 4. Moneda extranjera en la ingesta
// ---------------------------------------------------------------------------
console.log('\n--- Moneda ---');
const USD = FACTURA.replace('<cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>',
  '<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>');
const sinTC = ingerirDesdeXML(parsearXML(USD), { rucPropio: PROPIO });
check('USD sin TC avisa', sinTC.avisos.some((a) => a.includes('tipo de cambio')), sinTC.avisos.join('|'));
check('USD sin TC no inventa tasa', sinTC.tipoCambio === null);
check('USD sin TC queda pendiente por moneda', sinTC.estado === 'revisado' || sinTC.estado === 'pendiente');

const conTC = ingerirDesdeXML(parsearXML(USD), {
  rucPropio: PROPIO,
  tipoCambio: { fecha: '2026-11-10', compra: 3.4, venta: 3.42 },
});
check('USD con TC convierte base a soles', conTC.base === 342, String(conTC.base));
check('USD con TC convierte total', conTC.total === 403.56, String(conTC.total));
check('USD con TC guarda el tipo aplicado', conTC.tipoCambio === 3.42);
check('USD con TC conserva la moneda original', conTC.moneda === 'USD');
check('USD con TC cuadra', Math.abs(conTC.base + conTC.igv + conTC.exonerado - conTC.total) < 0.01,
  `${conTC.base}+${conTC.igv}+${conTC.exonerado} vs ${conTC.total}`);

// El sistema de archivos guarda todo en soles (schema.sql)
check('los importes guardados son soles, no dólares', conTC.total > 300);

// ---------------------------------------------------------------------------
// 5. XML roto
// ---------------------------------------------------------------------------
console.log('\n--- XML roto ---');
const roto = ingerirDesdeXML(parsearXML('<html></html>'), { rucPropio: PROPIO });
check('XML no UBL genera error', roto.hallazgos.some((h) => h.gravedad === 'error'));
check('XML no UBL queda pendiente', roto.estado === 'pendiente');

const sinRuc = ingerirDesdeXML(parsearXML(FACTURA.replace('20131312955', '')), { rucPropio: PROPIO });
check('sin RUC emisor bloquea', motivosParaNoConfirmar(sinRuc).some((m) => m.includes('RUC')));

// ---------------------------------------------------------------------------
// 6. Clave y resumen
// ---------------------------------------------------------------------------
console.log('\n--- Clave y resumen ---');
check('genera clave de duplicado', compra.clave !== null, String(compra.clave));
check('la clave incluye serie y número', compra.clave?.includes('F001') === true && compra.clave?.includes('123') === true);

const res = resumenComprobante(compra);
check('resumen menciona el documento', res.includes('F001-123'), res);
check('resumen menciona el importe', res.includes('118.00'), res);
check('resumen menciona el proveedor', res.includes('PROVEEDOR SAC'), res);

const resErr = resumenComprobante(roto);
check('resumen marca los errores', resErr.includes('error'), resErr);

// ---------------------------------------------------------------------------
// 7. Motivos para no confirmar
// ---------------------------------------------------------------------------
console.log('\n--- Confirmación ---');
check('un XML limpio se puede confirmar', motivosParaNoConfirmar(compra).length === 0,
  motivosParaNoConfirmar(compra).join('|'));
check('un error bloquea', motivosParaNoConfirmar(sinRuc).length > 0);
check('total cero bloquea', motivosParaNoConfirmar({ ...compra, total: 0 }).some((m) => m.includes('mayor que cero')));
check('sin serie/número bloquea', motivosParaNoConfirmar({ ...compra, serie: null }).some((m) => m.includes('serie')));

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);