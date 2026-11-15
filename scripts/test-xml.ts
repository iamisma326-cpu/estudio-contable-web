/**
 * Banco de pruebas del parser XML UBL 2.1 (src/lib/xml-ubl.ts).
 *
 * Incluye la cadena completa: XML -> comprobante -> validación -> asiento.
 * Uso: npm run test:xml
 */

import { parsearXML, pareceXML } from '../src/lib/xml-ubl.ts';
import { validarComprobante, tieneErrores } from '../src/lib/comprobante.ts';
import { generarAsiento, cuadra } from '../src/lib/asientos.ts';

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

// ---------------------------------------------------------------------------
// XML de factura gravada, con la estructura real del Anexo IX de SUNAT.
// No incluye la firma digital completa (irrelevante para leer importes).
// ---------------------------------------------------------------------------
const FACTURA = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <ext:UBLExtensions xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>F001-123</cbc:ID>
  <cbc:IssueDate>2026-11-10</cbc:IssueDate>
  <cbc:IssueTime>10:30:00.0z</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[CIENTO DIECIOCHO CON 00/100 SOLES]]></cbc:Note>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">20131312955</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>PROVEEDOR SAC</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">20503644968</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>CLIENTE EIRL</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305">10</cbc:ID>
        <cbc:Percent>18.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="PEN">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">118.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">118.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="PEN">59.00</cbc:PriceAmount>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>
        <cac:TaxCategory><cbc:ID>10</cbc:ID><cbc:Percent>18.00</cbc:Percent></cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>Servicio de consultoría contable</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="PEN">50.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

// ---------------------------------------------------------------------------
// 1. Detección
// ---------------------------------------------------------------------------
console.log('--- Detección ---');
check('reconoce un XML de factura', pareceXML(FACTURA));
check('reconoce por <?xml', pareceXML('<?xml version="1.0"?><algo/>'));
check('rechaza texto plano', !pareceXML('esto no es un xml'));
check('rechaza un PDF', !pareceXML('%PDF-1.4 ...'));

// ---------------------------------------------------------------------------
// 2. Lectura de cabecera
// ---------------------------------------------------------------------------
console.log('\n--- Factura gravada ---');
const f = parsearXML(FACTURA);
check('sin problemas de estructura', f.problemas.length === 0, f.problemas.join(' | '));
check('tipo = factura', f.tipo === 'factura');
check('serie F001', f.serie === 'F001', String(f.serie));
check('número 123', f.numero === '123', String(f.numero));
check('fecha 2026-11-10', f.fechaEmision === '2026-11-10', String(f.fechaEmision));
check('moneda PEN', f.moneda === 'PEN');
check('RUC emisor', f.rucEmisor === '20131312955', String(f.rucEmisor));
check('razón social emisor', f.razonSocialEmisor === 'PROVEEDOR SAC', String(f.razonSocialEmisor));
check('RUC receptor', f.rucReceptor === '20503644968');
check('base 100', f.base === 100, String(f.base));
check('IGV 18', f.igv === 18, String(f.igv));
check('total 118', f.total === 118, String(f.total));
check('afectación 10', f.afectacion === '10', String(f.afectacion));
check('una línea', f.lineas.length === 1);
check('descripción de la línea', f.lineas[0]?.descripcion === 'Servicio de consultoría contable');
check('cantidad 2', f.lineas[0]?.cantidad === 2);
check('valor de venta de la línea 100', f.lineas[0]?.valorVenta === 100);

// ---------------------------------------------------------------------------
// 3. Casos borde del formato
// ---------------------------------------------------------------------------
console.log('\n--- Formatos ---');

// CDATA en la razón social (proveedores reales lo usan con & y apóstrofes)
check('decodifica entidades XML',
  parsearXML(FACTURA.replace('PROVEEDOR SAC', 'MARTINEZ &amp; ASOCIADOS')).razonSocialEmisor === 'MARTINEZ & ASOCIADOS');
check('lee CDATA',
  parsearXML(FACTURA.replace('<cbc:RegistrationName>PROVEEDOR SAC</cbc:RegistrationName>',
    '<cbc:RegistrationName><![CDATA[PROVEEDOR SAC]]></cbc:RegistrationName>')).razonSocialEmisor === 'PROVEEDOR SAC');

// Atributos en la etiqueta
check('tolera atributos en el cierre', parsearXML(FACTURA.replace('</cbc:ID>', '</cbc:ID >')).numero === '123');

// Coma decimal (exportadores europeos / mal configurados)
check('acepta coma decimal', parsearXML(FACTURA.replace('<cbc:PayableAmount currencyID="PEN">118.00<', '<cbc:PayableAmount currencyID="PEN">118,00<')).total === 118);

// Serie de 3 caracteres
check('acepta serie F01', parsearXML(FACTURA.replace('F001-123', 'F01-123')).serie === 'F01');
// Serie en minúsculas
check('normaliza serie en minúsculas', parsearXML(FACTURA.replace('F001-123', 'f001-123')).serie === 'F001');

// Factura exonerada
const EXO = FACTURA
  .replace('<cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount>\n      <cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>\n      <cac:TaxCategory>\n        <cbc:ID schemeID="UN/ECE 5305">10</cbc:ID>',
           '<cbc:TaxableAmount currencyID="PEN">0.00</cbc:TaxableAmount>\n      <cbc:TaxAmount currencyID="PEN">0.00</cbc:TaxAmount>\n      <cac:TaxCategory>\n        <cbc:ID schemeID="UN/ECE 5305">20</cbc:ID>')
  .replace('<cbc:LineExtensionAmount currencyID="PEN">100.00</cbc:LineExtensionAmount>\n    <cbc:TaxExclusiveAmount currencyID="PEN">100.00</cbc:TaxExclusiveAmount>',
           '<cbc:LineExtensionAmount currencyID="PEN">118.00</cbc:LineExtensionAmount>\n    <cbc:TaxExclusiveAmount currencyID="PEN">118.00</cbc:TaxExclusiveAmount>')
  .replace('<cbc:TaxInclusiveAmount currencyID="PEN">118.00</cbc:TaxInclusiveAmount>', '<cbc:TaxInclusiveAmount currencyID="PEN">118.00</cbc:TaxInclusiveAmount>');
const fexo = parsearXML(EXO);
check('exonerada: afectación 20', fexo.afectacion === '20', String(fexo.afectacion));
// Sin TaxSubtotal de IGV el campo queda NULL, no en 0: no se inventa un cero
// cuando el XML simplemente no lo trae (mismo criterio que con la visión).
check('exonerada: IGV nulo o cero', fexo.igv === null || fexo.igv === 0, String(fexo.igv));

// Boleta
const BOLETA = FACTURA
  .replace('<cbc:ID>F001-123</cbc:ID>', '<cbc:ID>B001-45</cbc:ID>')
  .replace('<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>', '<cbc:InvoiceTypeCode listID="0101">03</cbc:InvoiceTypeCode>');
const b = parsearXML(BOLETA);
check('boleta: tipo correcto', b.tipo === 'boleta');
check('boleta: serie B001', b.serie === 'B001');

// Nota de crédito
const NC = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
            xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
            xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FC01-77</cbc:ID>
  <cbc:IssueDate>2026-11-20</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>07</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>20131312955</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>PROVEEDOR SAC</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cac:TaxSubtotal>
    <cbc:TaxableAmount>100.00</cbc:TaxableAmount><cbc:TaxAmount>18.00</cbc:TaxAmount>
    <cac:TaxCategory><cbc:ID>10</cbc:ID></cac:TaxCategory>
  </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:PayableAmount>118.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:CreditNoteLine><cbc:CreditedQuantity>1</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>Anulación parcial</cbc:Description></cac:Item>
  </cac:CreditNoteLine>
</CreditNote>`;
const nc = parsearXML(NC);
check('nota de crédito: tipo', nc.tipo === 'nota_credito', String(nc.tipo));
check('nota de crédito: sin problemas', nc.problemas.length === 0, nc.problemas.join(' | '));
check('nota de crédito: lee el total', nc.total === 118);
check('nota de crédito: lee la línea', nc.lineas.length === 1);

// ---------------------------------------------------------------------------
// 4. Archivos que no son comprobantes / están rotos
// ---------------------------------------------------------------------------
console.log('\n--- Rechazos ---');
const noUBL = parsearXML('<html><body>Hola</body></html>');
check('HTML se rechaza con mensaje', noUBL.problemas.some((p) => p.toLowerCase().includes('no parece un comprobante ubl')), noUBL.problemas.join(','));
check('vacío se rechaza', parsearXML('').problemas.length === 1);
check('no lanza con basura', (() => { try { parsearXML('<<<>>>'); return true; } catch { return false; } })());

const sinRuc = parsearXML(FACTURA.replace('20131312955', ''));
check('detecta RUC emisor faltante', sinRuc.problemas.some((p) => p.includes('RUC del emisor')), sinRuc.problemas.join(','));

const sinTotal = parsearXML(FACTURA.replace(/<cbc:PayableAmount[^>]*>118\.00<\/cbc:PayableAmount>/, '').replace(/<cbc:TaxInclusiveAmount[^>]*>118\.00<\/cbc:TaxInclusiveAmount>/, ''));
check('detecta total faltante', sinTotal.problemas.some((p) => p.includes('importe total')), sinTotal.problemas.join(','));

// ---------------------------------------------------------------------------
// 5. Cadena completa: XML -> validación -> asiento
// ---------------------------------------------------------------------------
console.log('\n--- Cadena completa ---');
const comp = parsearXML(FACTURA);
const hallazgos = validarComprobante({
  tipo: comp.tipo,
  serie: comp.serie,
  numero: comp.numero,
  fechaEmision: comp.fechaEmision,
  rucEmisor: comp.rucEmisor,
  rucReceptor: comp.rucReceptor,
  base: comp.base,
  igv: comp.igv,
  exonerado: comp.exonerado,
  total: comp.total,
  afectacion: comp.afectacion,
  periodo: '2026-11',
});
check('el XML pasa la validación SUNAT', !tieneErrores(hallazgos), hallazgos.map((h) => h.codigo).join(','));

const asiento = generarAsiento({
  tipo: comp.tipo,
  serie: comp.serie,
  numero: comp.numero,
  fechaEmision: comp.fechaEmision,
  rucEmisor: comp.rucEmisor,
  razonSocialEmisor: comp.razonSocialEmisor,
  base: comp.base,
  igv: comp.igv,
  exonerado: comp.exonerado,
  total: comp.total,
  operacion: 'compra',
});
check('el asiento cuadra', cuadra(asiento), `${asiento.totalDebe} vs ${asiento.totalHaber}`);
check('el asiento usa el total del XML', asiento.totalDebe === 118);
check('el asiento lleva la glosa del proveedor', asiento.glosa.includes('PROVEEDOR SAC'));

// El RUC del XML es el de SUNAT: debe validar.
const compFalso = { ...comp, rucEmisor: '20131312999' };
const hFalso = validarComprobante({
  tipo: compFalso.tipo, serie: compFalso.serie, numero: compFalso.numero,
  fechaEmision: compFalso.fechaEmision, rucEmisor: compFalso.rucEmisor,
  base: compFalso.base, igv: compFalso.igv, total: compFalso.total,
  afectacion: compFalso.afectacion, periodo: '2026-11',
});
check('un RUC corrupto en el XML se detecta', tieneErrores(hFalso));

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
