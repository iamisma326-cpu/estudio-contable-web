/**
 * Utilidades compartidas de extracción de texto de PDFs para los endpoints
 * /api/pdf-edit y /api/pdf-render.
 *
 * pdf-lib no expone getText() ni posiciones de texto, así que parseamos los
 * content streams a mano: tokenizamos los operadores de texto (BT/ET, Tf,
 * TL, Tm, Td, TD, T*, Tj, ', TJ) manteniendo el estado de texto (Tm/Tlm)
 * para derivar coordenadas reales.
 *
 * Usamos decodePDFRawStream() para descomprimir los streams: cubre
 * FlateDecode y el resto de filtros, o sea PDFs reales (comprimidos) y los
 * que genera pdf-lib (hex strings sin comprimir).
 *
 * Este archivo vive bajo api/_pdf/ — el prefijo "_" evita que Vercel lo
 * publique como endpoint.
 */

import {
  PDFDocument,
  PDFRawStream,
  PDFArray,
  PDFName,
  decodePDFRawStream,
} from 'pdf-lib';

export type PdfPage = ReturnType<PDFDocument['getPage']>;

/** Decodifica strings PDF entre paréntesis: escapes y octal. */
export function decodePdfTextString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\([0-7]{1,3})/g, (_m, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

/** Decodifica strings hex <...>: BOM UTF-16BE o bytes sueltos (latin). */
export function hexToText(hex: string): string {
  const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  return bytes.map((b) => String.fromCharCode(b)).join('');
}

/** Concatena los content streams de la página ya descomprimidos. */
export function getPageContentRaw(page: PdfPage): string {
  const contents = page.node.get(PDFName.of('Contents'));
  if (!contents) return '';
  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFRawStream) {
    streams.push(contents);
  } else if (contents instanceof PDFArray) {
    const size = contents.size();
    for (let i = 0; i < size; i++) {
      let el: PDFRawStream | undefined;
      try {
        // lookupMaybe LANZA si el elemento no es del tipo pedido: tras un
        // drawText, pdf-lib agrega un PDFContentStream al array Contents y
        // hay que saltarlo, no morir.
        el = contents.lookupMaybe(i, PDFRawStream);
      } catch {
        el = undefined;
      }
      if (el) streams.push(el);
    }
  }
  return streams
    .map((s) => Buffer.from(decodePDFRawStream(s).decode()).toString('latin1'))
    .join('\n');
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  size: number;
}

interface Tok { kind: 'str' | 'hex' | 'op' | 'num'; value: string }
interface Mat { a: number; b: number; c: number; d: number; e: number; f: number }

/** findLast manual (el proyecto compila con lib ES2022, sin Array#findLast). */
function lastNum(ops: Tok[]): Tok | undefined {
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].kind === 'num') return ops[i];
  }
  return undefined;
}
function lastText(ops: Tok[]): Tok | undefined {
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].kind === 'str' || ops[i].kind === 'hex') return ops[i];
  }
  return undefined;
}

/**
 * Extrae los runs de texto de una página con coordenadas reales.
 * `measure` sólo se usa para acumular desplazamientos horizontales en TJ.
 */
export function extractTextItems(
  page: PdfPage,
  measure: { widthOfTextAtSize: (s: string, n: number) => number }
): TextItem[] {
  const raw = getPageContentRaw(page);
  if (!raw) return [];

  const items: TextItem[] = [];
  let tm: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  let tlm: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  let fontSize = 11;
  let leading = 0;
  // El tamaño real del texto es |Tm.d| × Tf-size (Tm.d escala la fuente).
  const curSize = (): number => Math.abs(tm.d) * fontSize || fontSize;

  // Tokenizador: strings (...), hex <...>, números y operadores.
  const tokRe = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|[^\s()<>]+/g;
  const tokens: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokRe.exec(raw))) {
    const t = m[0];
    if (t.startsWith('(')) tokens.push({ kind: 'str', value: t.slice(1, -1) });
    else if (t.startsWith('<')) tokens.push({ kind: 'hex', value: t.slice(1, -1) });
    else if (/^-?\d*\.?\d+$/.test(t)) tokens.push({ kind: 'num', value: t });
    else tokens.push({ kind: 'op', value: t });
  }

  const nums = (ops: Tok[]): number[] =>
    ops.filter((o) => o.kind === 'num').map((o) => Number(o.value));
  const textOf = (o: Tok): string =>
    o.kind === 'str' ? decodePdfTextString(o.value) : hexToText(o.value);

  let operandos: Tok[] = [];
  for (const tok of tokens) {
    if (tok.kind !== 'op') {
      operandos.push(tok);
      continue;
    }
    switch (tok.value) {
      case 'BT': {
        tlm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        tm = { ...tlm };
        operandos = [];
        break;
      }
      case 'Tf': {
        const sizeTok = lastNum(operandos);
        if (sizeTok) fontSize = Math.abs(Number(sizeTok.value)) || fontSize;
        operandos = [];
        break;
      }
      case 'TL': {
        const n = lastNum(operandos);
        if (n) leading = Number(n.value);
        operandos = [];
        break;
      }
      case 'Tm': {
        const v = nums(operandos);
        if (v.length >= 6) {
          tlm = { a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] };
          tm = { ...tlm };
        }
        operandos = [];
        break;
      }
      case 'Td': {
        const v = nums(operandos);
        if (v.length >= 2) {
          const ne = v[0] * tlm.a + v[1] * tlm.c + tlm.e;
          const nf = v[0] * tlm.b + v[1] * tlm.d + tlm.f;
          tlm = { ...tlm, e: ne, f: nf };
          tm = { ...tlm };
        }
        operandos = [];
        break;
      }
      case 'TD': {
        const v = nums(operandos);
        if (v.length >= 2) {
          leading = -v[1];
          const ne = v[0] * tlm.a + v[1] * tlm.c + tlm.e;
          const nf = v[0] * tlm.b + v[1] * tlm.d + tlm.f;
          tlm = { ...tlm, e: ne, f: nf };
          tm = { ...tlm };
        }
        operandos = [];
        break;
      }
      case 'T*': {
        tlm = { ...tlm, f: tlm.f - leading };
        tm = { ...tlm };
        operandos = [];
        break;
      }
      case 'Tj': {
        const s = lastText(operandos);
        if (s) {
          items.push({ str: textOf(s), x: tm.e, y: tm.f, size: curSize() });
        }
        operandos = [];
        break;
      }
      case "'": {
        const s = lastText(operandos);
        if (s) {
          tlm = { ...tlm, f: tlm.f - leading };
          items.push({ str: textOf(s), x: tlm.e, y: tlm.f, size: curSize() });
        }
        operandos = [];
        break;
      }
      case 'TJ': {
        // Array [(...) -120 (...)] TJ: textos y desplazamientos horizontales.
        let dx = 0;
        let run = '';
        for (const o of operandos) {
          if (o.kind === 'str' || o.kind === 'hex') {
            run += textOf(o);
          } else if (o.kind === 'num') {
            if (run) {
              items.push({
                str: run,
                x: tm.e + dx,
                y: tm.f,
                size: curSize(),
              });
              dx += measure.widthOfTextAtSize(run, curSize()) * 0.01;
              run = '';
            }
            dx += (-Number(o.value) / 1000) * (curSize());
          }
        }
        if (run) {
          items.push({ str: run, x: tm.e + dx, y: tm.f, size: curSize() });
        }
        operandos = [];
        break;
      }
      default:
        operandos = [];
    }
  }
  return items;
}

/**
 * Busca el needle en la página y devuelve el rect (x, y, w, h) que lo cubre.
 * Une items en líneas por Y (±2pt) y localiza la primera línea que lo contiene.
 */
export function findTextCoords(
  page: PdfPage,
  needle: string,
  measure: { widthOfTextAtSize: (s: string, n: number) => number }
): { x: number; y: number; width: number; height: number } | null {
  if (page.getRotation().angle !== 0) return null; // v1: solo páginas sin rotación.
  const items = extractTextItems(page, measure);
  if (!items.length) return null;

  interface Line { text: string; items: TextItem[]; y: number }
  const lines: Line[] = [];
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < 2) {
      last.text += (last.text && !last.text.endsWith(' ') ? ' ' : '') + it.str;
      last.items.push(it);
    } else {
      lines.push({ text: it.str, items: [it], y: it.y });
    }
  }

  const target = lines.find((l) => l.text.includes(needle));
  if (!target) return null;

  const start = target.text.indexOf(needle);
  const end = start + needle.length;

  let acc = 0;
  let xStart: number | null = null;
  let xEnd: number | null = null;
  let baselineY = target.items[0].y;
  let size = target.items[0].size;
  for (const it of target.items) {
    const itemStart = acc;
    const itemEnd = acc + it.str.length;
    if (itemEnd > start && itemStart < end) {
      const overlapStart = Math.max(itemStart, start) - itemStart;
      const overlapEnd = Math.min(itemEnd, end) - itemStart;
      const pxStart = it.x + measure.widthOfTextAtSize(it.str.slice(0, overlapStart), it.size || size);
      const pxEnd = it.x + measure.widthOfTextAtSize(it.str.slice(0, overlapEnd), it.size || size);
      if (xStart === null) xStart = pxStart;
      xEnd = pxEnd;
      baselineY = it.y;
      size = it.size || size;
    }
    acc += it.str.length + 1; // +1 por el espacio insertado al concatenar
    if (acc >= end) break;
  }
  if (xStart === null || xEnd === null) return null;

  return {
    x: xStart - 1,
    y: baselineY - 2,
    width: Math.max(xEnd - xStart + 2, measure.widthOfTextAtSize(needle, size) + 4),
    height: size + 3,
  };
}

/**
 * Extrae el texto de todas las páginas con su número, listo para meter al
 * prompt del LLM. Devuelve un string con marcadores "=== PÁGINA n ===".
 *
 * Ordena los items por Y descendente (arriba→abajo) y por X, para que el
 * texto llegue en orden de lectura aproximado.
 */
export async function extractPdfTextPerPage(pdfBuffer: Buffer): Promise<string> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const dummy: { widthOfTextAtSize: (s: string, n: number) => number } = {
    // Sólo afecta el avance horizontal en arrays TJ; una estimación basta.
    widthOfTextAtSize: (s, n) => s.length * n * 0.5,
  };
  const out: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const items = extractTextItems(pages[i], dummy);
    if (!items.length) {
      out.push(`=== PÁGINA ${i + 1} ===\n(sín texto extraíble — posiblemente escaneada)`);
      continue;
    }
    // Orden de lectura: por Y descendente, luego X ascendente.
    items.sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y));
    out.push(`=== PÁGINA ${i + 1} ===\n${items.map((it) => it.str).join('\n')}`);
  }
  return out.join('\n\n');
}
