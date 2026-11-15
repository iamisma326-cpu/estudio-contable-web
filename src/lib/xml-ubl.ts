/**
 * Lectura de comprobantes electrónicos en XML UBL 2.1 (SUNAT).
 *
 * Es la vía más fiable y la más barata: no gasta tokens, no "interpreta" nada,
 * y el XML que emitió el proveedor ya trae los importes exactos que SUNAT
 * validó. Siempre que el archivo exista hay que preferirlo a la visión.
 *
 * No se usa una librería XML: el proyecto no tiene ninguna y el formato que
 * interesa son elementos planos con namespace fijo. El parser es deliberadamente
 * tolerante — ignora la firma digital, el orden de los nodos y las diferencias
 * de formato numérico — porque un XML de un proveedor real trae más ruido del
 * que sugiere el estándar.
 *
 * Ver docs/PROPUESTA-AUTOMATIZACION.md §3 (paso 1).
 */

import type { TipoComprobante, Afectacion } from './comprobante.ts';

export interface LineaComprobante {
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  valorVenta: number;
  afectacion: string | null;
}

export interface ComprobanteXML {
  tipo: TipoComprobante;
  serie: string | null;
  numero: string | null;
  fechaEmision: string | null;
  horaEmision: string | null;
  moneda: string | null;
  rucEmisor: string | null;
  razonSocialEmisor: string | null;
  rucReceptor: string | null;
  razonSocialReceptor: string | null;
  base: number | null;
  igv: number | null;
  exonerado: number | null;
  inafecto: number | null;
  total: number | null;
  afectacion: Afectacion | null;
  lineas: LineaComprobante[];
  /** Errores de estructura que impiden leer el archivo. */
  problemas: string[];
}

/** Códigos SUNAT de tipo de documento (catálogo 01) que interesan aquí. */
const TIPOS: Record<string, TipoComprobante> = {
  '01': 'factura',
  '03': 'boleta',
  '07': 'nota_credito',
  '08': 'nota_debito',
};

// ---------------------------------------------------------------------------
// Utilidades de extracción
// ---------------------------------------------------------------------------

/**
 * Devuelve el contenido de texto de la etiqueta `nombre`, con namespace opcional.
 * Primer resultado; null si no existe o está vacía.
 *
 * El `[^>]*` del cierre tolera atributos ("</cbc:ID >"), que algunos
 * generadores emiten y que romperían un regex más estricto.
 */
function tag(xml: string, nombre: string): string | null {
  const limpio = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${limpio}(?:\\s[^>]*)?>([\\s\\S]*?)</${limpio}\\s*>`, 'i');
  const m = re.exec(xml);
  if (!m) return null;
  const v = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  return v === '' ? null : decodificarEntidades(v);
}

/** Todos los bloques que empiezan por `nombre` (p. ej. cada cac:TaxSubtotal). */
function bloques(xml: string, nombre: string): string[] {
  const limpio = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${limpio}(?:\\s[^>]*)?>([\\s\\S]*?)</${limpio}\\s*>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    // &amp; al final para no romper dobles escapes.
    .replace(/&amp;/g, '&');
}

/** Número tolerante: acepta "118.00", "118,00" y "118". */
function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Parte "F001-123" en serie y número.
 * La serie puede tener 4 caracteres (F001) o 3 (F01) según el emisor.
 */
function partirSerieNumero(id: string | null): { serie: string | null; numero: string | null } {
  if (!id) return { serie: null, numero: null };
  const m = /^\s*([A-Za-z0-9]{1,8})\s*-\s*(\d+)\s*$/.exec(id);
  if (!m) return { serie: null, numero: null };
  return { serie: m[1].toUpperCase(), numero: m[2] };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Convierte el texto de un XML UBL 2.1 en un comprobante.
 *
 * Nunca lanza por datos raros: devuelve lo que pudo leer y acumula el problema
 * en `problemas`. Quien llama decide si eso se puede revisar o se rechaza —
 * mismo criterio que la visión, donde un campo mal leído es NULL y no una
 * excepción.
 */
export function parsearXML(xml: string): ComprobanteXML {
  const problemas: string[] = [];

  const c = (xml.includes('\u0000') ? xml.replace(/\u0000/g, '') : xml).trim();
  if (!c) {
    return vacio(['El archivo está vacío.']);
  }

  // Raíz: Invoice, CreditNote o DebitNote.
  let raiz: 'Invoice' | 'CreditNote' | 'DebitNote' | null = null;
  if (/<(?:\w+:)?Invoice[\s>]/i.test(c)) raiz = 'Invoice';
  else if (/<(?:\w+:)?CreditNote[\s>]/i.test(c)) raiz = 'CreditNote';
  else if (/<(?:\w+:)?DebitNote[\s>]/i.test(c)) raiz = 'DebitNote';

  if (!raiz) {
    return vacio([
      'No parece un comprobante UBL: falta el elemento raíz Invoice, CreditNote o DebitNote.',
    ]);
  }

  // --- Tipo de documento ---
  const tipoCode = tag(c, 'cbc:InvoiceTypeCode') ?? tag(c, 'cbc:CreditNoteTypeCode') ?? tag(c, 'cbc:DebitNoteTypeCode');
  let tipo: TipoComprobante;
  if (tipoCode && TIPOS[tipoCode.trim()]) {
    tipo = TIPOS[tipoCode.trim()];
  } else if (raiz === 'CreditNote') {
    tipo = 'nota_credito';
  } else if (raiz === 'DebitNote') {
    tipo = 'nota_debito';
  } else {
    // Sin código se asume factura: es el caso más común y la serie lo confirmará.
    tipo = 'factura';
    problemas.push('No se encontró el tipo de comprobante; se asumió factura.');
  }

  // --- Identificación ---
  const id = tag(c, 'cbc:ID');
  const { serie, numero } = partirSerieNumero(id);
  if (!id) problemas.push('No se encontró el identificador (cbc:ID).');
  else if (!serie || !numero) problemas.push(`El identificador "${id}" no tiene formato serie-número.`);

  const fechaEmision = tag(c, 'cbc:IssueDate');
  if (!fechaEmision) problemas.push('No se encontró la fecha de emisión.');

  // --- Emisor y receptor ---
  const emisorBloque = bloques(c, 'cac:AccountingSupplierParty')[0] ?? '';
  const receptorBloque = bloques(c, 'cac:AccountingCustomerParty')[0] ?? '';

  const rucEmisor = tag(emisorBloque, 'cbc:ID');
  const razonSocialEmisor = tag(emisorBloque, 'cbc:RegistrationName');
  const rucReceptor = tag(receptorBloque, 'cbc:ID');
  const razonSocialReceptor = tag(receptorBloque, 'cbc:RegistrationName');
  if (!rucEmisor) problemas.push('No se encontró el RUC del emisor.');

  // --- Impuestos ---
  // Los TaxSubtotal traen el desglose por afectación: es la fuente fiable.
  // El LegalMonetaryTotal da los totales ya cuadrados por SUNAT.
  //
  // OJO: cada InvoiceLine lleva su PROPIO cac:TaxTotal con su TaxSubtotal.
  // Buscar cbc:TaxSubtotal en todo el documento duplica los importes (y el
  // asiento se descuadra). La cabecera es siempre lo que va antes de la
  // primera línea, que es el orden que fija el estándar SUNAT.
  const cabecera = recortarCabecera(c);

  let base: number | null = null;
  let igv: number | null = null;
  let exonerado: number | null = null;
  let inafecto: number | null = null;
  let afectacion: Afectacion | null = null;

  for (const sub of bloques(cabecera, 'cac:TaxSubtotal')) {
    const taxable = num(tag(sub, 'cbc:TaxableAmount'));
    const amount = num(tag(sub, 'cbc:TaxAmount'));
    const categoria = tag(sub, 'cbc:ID') ?? tag(sub, 'cbc:TaxExemptionReasonCode');

    if (categoria === '10' || categoria === '11' || categoria === '12') {
      base = (base ?? 0) + (taxable ?? 0);
      igv = (igv ?? 0) + (amount ?? 0);
      afectacion = '10';
    } else if (categoria === '20' || categoria === '21') {
      exonerado = (exonerado ?? 0) + (taxable ?? 0);
      if (!afectacion) afectacion = '20';
    } else if (categoria === '30' || categoria === '31' || categoria === '32' || categoria === '33' || categoria === '34' || categoria === '35' || categoria === '36' || categoria === '37') {
      inafecto = (inafecto ?? 0) + (taxable ?? 0);
      if (!afectacion) afectacion = '30';
    }
  }

  // Redondear acumulados para no arrastrar coma flotante.
  const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  base = r2(base);
  igv = r2(igv);
  exonerado = r2(exonerado);
  inafecto = r2(inafecto);

  // Si no hubo TaxSubtotal, se cae al LegalMonetaryTotal.
  const monetario = bloques(cabecera, 'cac:LegalMonetaryTotal')[0] ?? '';
  if (base === null) base = num(tag(monetario, 'cbc:LineExtensionAmount'));
  const total = num(tag(monetario, 'cbc:PayableAmount')) ?? num(tag(monetario, 'cbc:TaxInclusiveAmount'));

  if (total === null) problemas.push('No se encontró el importe total.');

  // --- Líneas ---
  const lineas: LineaComprobante[] = [];
  for (const bloque of bloques(c, 'cac:InvoiceLine').concat(bloques(c, 'cac:CreditNoteLine'), bloques(c, 'cac:DebitNoteLine'))) {
    const cantidad = num(tag(bloque, 'cbc:InvoicedQuantity')) ?? num(tag(bloque, 'cbc:CreditedQuantity')) ?? num(tag(bloque, 'cbc:DebitedQuantity'));
    const valorVenta = num(tag(bloque, 'cbc:LineExtensionAmount'));
    const valorUnitario = num(tag(bloque, 'cbc:PriceAmount'));
    const descripcion = tag(bloque, 'cbc:Description') ?? tag(bloque, 'cbc:Name');
    // Afectación por línea, dentro del TaxCategory.
    const taxCategory = bloques(bloque, 'cac:TaxCategory')[0] ?? '';
    const afectacionLinea = tag(taxCategory, 'cbc:ID');

    lineas.push({
      descripcion: descripcion ?? '',
      cantidad: cantidad ?? 0,
      valorUnitario: valorUnitario ?? 0,
      valorVenta: valorVenta ?? 0,
      afectacion: afectacionLinea,
    });
  }

  if (lineas.length === 0) {
    problemas.push('El comprobante no tiene líneas legibles.');
  }

  return {
    tipo,
    serie,
    numero,
    fechaEmision,
    horaEmision: tag(c, 'cbc:IssueTime'),
    moneda: tag(c, 'cbc:DocumentCurrencyCode'),
    rucEmisor,
    razonSocialEmisor,
    rucReceptor,
    razonSocialReceptor,
    base,
    igv,
    exonerado,
    inafecto,
    total,
    afectacion,
    lineas,
    problemas,
  };
}

/**
 * Devuelve solo la cabecera del documento: froma el inicio hasta la primera
 * línea de detalle. Los totales del comprobante siempre van antes que las
 * líneas en el estándar SUNAT, y así no se confunden los TaxSubtotal de cada
 * línea con los del documento.
 */
function recortarCabecera(xml: string): string {
  const marcas = ['<cac:InvoiceLine', '<cac:CreditNoteLine', '<cac:DebitNoteLine'];
  let corte = xml.length;
  for (const m of marcas) {
    const i = xml.indexOf(m);
    if (i !== -1 && i < corte) corte = i;
  }
  return xml.slice(0, corte);
}

function vacio(problemas: string[]): ComprobanteXML {
  return {
    tipo: 'factura',
    serie: null,
    numero: null,
    fechaEmision: null,
    horaEmision: null,
    moneda: null,
    rucEmisor: null,
    razonSocialEmisor: null,
    rucReceptor: null,
    razonSocialReceptor: null,
    base: null,
    igv: null,
    exonerado: null,
    inafecto: null,
    total: null,
    afectacion: null,
    lineas: [],
    problemas,
  };
}

/**
 * ¿Vale la pena intentar leerlo? Filtro barato antes de parsear.
 * Un archivo de 20 MB no es un comprobante.
 */
export function pareceXML(contenido: string): boolean {
  const cabecera = contenido.slice(0, 4096).toLowerCase();
  return cabecera.includes('<?xml') || cabecera.includes('<invoice') || cabecera.includes('<creditnote') || cabecera.includes('<debitnote');
}
