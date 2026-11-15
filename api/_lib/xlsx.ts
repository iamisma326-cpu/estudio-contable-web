/**
 * Generador de .xlsx (OOXML) sin dependencias.
 *
 * Hace las cinco hojas que pide la propuesta (§7): Ventas, Compras, Diario,
 * Resumen y Pendientes. La hoja de Pendientes no es un adorno: un libro que
 * omite las facturas sin revisar miente por omisión, porque el total del mes no
 * coincide con lo que el cliente facturó de verdad.
 *
 * Un .xlsx es un ZIP con XML. Se escribe a mano porque la alternativa
 * (ExcelJS, 21 MB) no cabe razonablemente en una función serverless.
 *
 * Se implementa lo justo para que Excel abra el archivo sin repararlo:
 *   [Content_Types].xml, _rels/.rels, xl/workbook.xml, xl/_rels/workbook.xml.rels,
 *   xl/styles.xml, xl/worksheets/sheetN.xml
 *
 * No hay fórmulas ni gráficos: los totales se escriben ya calculados, porque un
 * Excel con fórmulas que dependen de hojas recalculadas al abrir puede mostrar
 * 0 hasta que el usuario pulse F9, y quien lea el archivo no debería tener que
 * hacer eso.
 */

import { crearZip } from './zip.js';

/** Una celda: texto, número o vacía. */
export type Celda = string | number | null | undefined;

export interface Hoja {
  nombre: string;
  /**
   * Fila de encabezado. Se escribe en negrita y se congela.
   * Si no se pasa, no se escribe encabezado.
   */
  encabezado?: string[];
  /** Filas de datos. */
  filas: Celda[][];
  /** Columnas que son moneda: se formatean con separador de miles. */
  dinero?: number[];
  /** Anchos de columna en caracteres. Si falta, se calcula. */
  anchos?: number[];
}

/** Escapa texto para XML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Caracteres de control no son válidos en XML 1.0 y Excel rechaza el libro.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** Nombre de columna de Excel (1 → A, 27 → AA). */
export function letraColumna(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Estilos: 0 normal, 1 encabezado en negrita, 2 moneda, 3 fecha. */
const ESTILO_NORMAL = 0;
const ESTILO_ENCABEZADO = 1;
const ESTILO_MONEDA = 2;

function celdaXml(ref: string, valor: Celda, esDinero: boolean): string {
  if (valor === null || valor === undefined || valor === '') {
    // Una celda vacía no se emite: Excel la deja en blanco igual.
    return '';
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return '';
    const s = esDinero ? ESTILO_MONEDA : ESTILO_NORMAL;
    return `<c r="${ref}" s="${s}"><v>${valor}</v></c>`;
  }
  return `<c r="${ref}" s="0" t="inlineStr"><is><t xml:space="preserve">${esc(valor)}</t></is></c>`;
}

/**
 * Una hoja.
 *
 * Las filas se numeran desde 1 y las celdas llevan la referencia A1 (r="A1"),
 * que es lo que Excel lee para colocar el valor; sin la referencia la pone en
 * orden y cualquier columna vacía en medio descoloca la tabla entera.
 */
function hojaXml(hoja: Hoja, indiceHoja: number): string {
  const numColumnas = Math.max(
    hoja.encabezado?.length ?? 0,
    ...hoja.filas.map((f) => f.length),
    1
  );

  // Anchos: si no vienen, se estima por el texto más largo de cada columna.
  const anchos: number[] = [];
  for (let c = 0; c < numColumnas; c++) {
    if (hoja.anchos?.[c]) {
      anchos.push(hoja.anchos[c]);
      continue;
    }
    let max = hoja.encabezado?.[c]?.length ?? 8;
    for (const f of hoja.filas) {
      const v = f[c];
      const largo = typeof v === 'number' ? 12 : String(v ?? '').length;
      if (largo > max) max = largo;
    }
    anchos.push(Math.min(Math.max(max + 2, 8), 42));
  }

  const cols = anchos
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const filasXml: string[] = [];
  let numFila = 1;

  if (hoja.encabezado) {
    const celdas = hoja.encabezado
      .map((v, i) => `<c r="${letraColumna(i + 1)}${numFila}" s="${ESTILO_ENCABEZADO}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`)
      .join('');
    filasXml.push(`<row r="${numFila}" customHeight="1" ht="18">${celdas}</row>`);
    numFila++;
  }

  for (const fila of hoja.filas) {
    const celdas = fila
      .map((v, i) => celdaXml(`${letraColumna(i + 1)}${numFila}`, v, hoja.dinero?.includes(i) ?? false))
      .join('');
    filasXml.push(`<row r="${numFila}">${celdas}</row>`);
    numFila++;
  }

  // La fila de encabezado se congela para que no se pierda al bajar.
  const panel = hoja.encabezado
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

  // El autofiltro sobre el encabezado es lo que hace utilizable una tabla de
  // 300 facturas: sin él, buscar una serie obliga a bajar leyendo.
  const ultimaFila = numFila - 1;
  const autoFilter = hoja.encabezado && ultimaFila > 1
    ? `<autoFilter ref="A1:${letraColumna(numColumnas)}${ultimaFila}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${panel}
<cols>${cols}</cols>
<sheetData>${filasXml.join('')}</sheetData>
${autoFilter}
</worksheet>`;
}

/** El libro completo. */
export function crearXlsx(hojas: Hoja[]): Buffer {
  if (hojas.length === 0) throw new Error('Un libro necesita al menos una hoja.');

  const nombres = hojas.map((h) => h.nombre.slice(0, 31));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('\n')}
</sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // Estilos: número general, encabezado en negrita y moneda con dos decimales
  // y separador de miles (#,##0.00), que es como se lee un libro contable.
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="2">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
</fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<!-- Estilo por defecto del libro. Sin este bloque Excel iguala el que trae y
     algunos lectores (openpyxl, LibreOffice) avisan de que falta. -->
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  return crearZip([
    { nombre: '[Content_Types].xml', contenido: contentTypes },
    { nombre: '_rels/.rels', contenido: rels },
    { nombre: 'xl/workbook.xml', contenido: workbook },
    { nombre: 'xl/_rels/workbook.xml.rels', contenido: workbookRels },
    { nombre: 'xl/styles.xml', contenido: estilos },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h, i) })),
  ]);
}
