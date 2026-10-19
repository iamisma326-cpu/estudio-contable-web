/**
 * Utilidades compartidas de extracción de texto y búsqueda de coordenadas
 * para los endpoints /api/pdf-edit y /api/pdf-render.
 *
 * Capa principal: pdfjs-dist (legacy build para Node), que entiende CMaps,
 * ToUnicode, fuentes subset y da coordenadas reales por run de texto.
 * Fallback: parser propio de operadores de texto (BT/ET, Tf, Tm, Td, T*,
 * Tj, ', TJ) sobre los content streams descomprimidos con pdf-lib.
 *
 * Este archivo vive bajo api/_pdf/ — el prefijo "_" evita que Vercel lo
 * publique como endpoint.
 */

import {
  PDFDocument,
  PDFRawStream,
  PDFArray,
  PDFDict,
  PDFName,
  decodePDFRawStream,
} from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

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

/**
 * Decodifica el contenido de cualquier stream de contenido:
 *  - PDFRawStream con filtro (FlateDecode/etc.).
 *  - PDFFlateStream/PDFContentStream en memoria creados por pdf-lib
 *    (getContents / getUnencodedContents).
 * decodePDFRawStream sólo pide {dict, contents}: le pasamos los bytes que
 * tengamos y él maneja el Filter del dict.
 */
function decodeContentStream(s: unknown): string {
  try {
    let bytes: Uint8Array | undefined;
    if (s instanceof PDFRawStream) {
      bytes = s.contents;
    } else if (typeof (s as { getContents?: () => Uint8Array }).getContents === 'function') {
      bytes = (s as { getContents: () => Uint8Array }).getContents();
    }
    if (!bytes) return '';
    const dict = (s as { dict?: unknown }).dict;
    const fake = { dict, contents: bytes } as unknown as Parameters<typeof decodePDFRawStream>[0];
    return Buffer.from(decodePDFRawStream(fake).decode()).toString('latin1');
  } catch {
    return '';
  }
}

/**
 * Subtype del objeto stream, o '' si no es stream o no se puede leer.
 */
function streamSubtype(s: unknown): string {
  try {
    const dict = (s as { dict?: { get?: (n: unknown) => unknown } }).dict;
    const st = dict && typeof dict.get === 'function' ? dict.get(PDFName.of('Subtype')) : undefined;
    return st && typeof (st as { toString?: () => string }).toString === 'function'
      ? (st as { toString: () => string }).toString().replace(/^\//, '')
      : '';
  } catch {
    return '';
  }
}

/**
 * XObjects Form de la página, decodificados por nombre (sin slash: 'Im0').
 * Los sistemas de impresión y generadores de facturas suelen meter todo el
 * texto de la página dentro de un Form XObject y dibujarlo con /Im0 Do — sin
 * esto el parser manual (que solo mira el content stream directo de la
 * página) los reporta como "escaneados".
 */
function getFormXObjects(page: PdfPage): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const res = page.node.Resources();
    if (!res) return out;
    const xobjs: PDFDict | undefined = res.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjs) return out;
    for (const key of xobjs.keys()) {
      const name = key.toString().replace(/^\//, '');
      if (!name || out.has(name)) continue;
      try {
        let stream: unknown | undefined;
        try {
          // lookup resuelve refs internamente; lanzará con refs muertas.
          stream = xobjs.lookup(key);
        } catch {
          stream = undefined;
        }
        if (!stream) continue;
        // Descarta Subtype conocidos sin texto (Image, PS...). Si el dict no
        // trae Subtype (XObjects crudos de facturas), lo incluye igual: el
        // tokenizer ignora bytes binarios inofensivos.
        const st = streamSubtype(stream);
        if (st && st !== 'Form') continue;
        const content = decodeContentStream(stream);
        if (content) out.set(name, content);
      } catch {
        /* XObject ilegible: se ignora */
      }
    }
  } catch {
    /* Página sin Resources: no hay XObjects */
  }
  return out;
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  size: number;
}

interface Tok { kind: 'str' | 'hex' | 'op' | 'num' | 'name'; value: string }
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
 *
 * Recursa en los Form XObjects de la página (operador /Do): el texto puede
 * estar dentro de ellos en facturas generadas por sistemas de impresión.
 * Mantiene un stack de CTM (q/Q/cm) para convertir las coordenadas del
 * XObject al espacio de página.
 */
export function extractTextItems(
  page: PdfPage,
  measure: { widthOfTextAtSize: (s: string, n: number) => number }
): TextItem[] {
  const raw = getPageContentRaw(page);
  if (!raw) return [];

  const items: TextItem[] = [];
  const xobjects = getFormXObjects(page);
  const MAX_DEPTH = 8;

  /** Producto de matrices (PDF: las multiplicaciones se aplican derecha→izquierda). */
  const matMul = (m1: Mat, m2: Mat): Mat => ({
    a: m1.a * m2.a + m1.b * m2.c,
    b: m1.a * m2.b + m1.b * m2.d,
    c: m1.c * m2.a + m1.d * m2.c,
    d: m1.c * m2.b + m1.d * m2.d,
    e: m1.e * m2.a + m1.f * m2.c + m2.e,
    f: m1.e * m2.b + m1.f * m2.d + m2.f,
  });

  const processContent = (content: string, ctm: Mat, depth: number): void => {
    let tm: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    let tlm: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    let fontSize = 11;
    let leading = 0;
    const ctmStack: Mat[] = [];
    // El tamaño real del texto es escala(CTM) × |Tm.d| × Tf-size.
    const ctmScale = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) || 1;
    const curSize = (): number => Math.abs(tm.d) * fontSize * ctmScale || fontSize * ctmScale;
    /** Text space → world space: aplica la CTM al punto origen del glyph. */
    const toWorld = (x: number, y: number): { x: number; y: number } => ({
      x: ctm.a * x + ctm.c * y + ctm.e,
      y: ctm.b * x + ctm.d * y + ctm.f,
    });

    // Tokenizador: strings (...), hex <...>, números, nombres /Xx y operadores.
    const tokRe = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|\/[^\s()<>]+|[^\s()<>]+/g;
    const tokens: Tok[] = [];
    let m: RegExpExecArray | null;
    while ((m = tokRe.exec(content))) {
      const t = m[0];
      if (t.startsWith('(')) tokens.push({ kind: 'str', value: t.slice(1, -1) });
      else if (t.startsWith('<')) tokens.push({ kind: 'hex', value: t.slice(1, -1) });
      else if (t.startsWith('/')) tokens.push({ kind: 'name', value: t.slice(1) });
      else if (/^-?\d*\.?\d+$/.test(t)) tokens.push({ kind: 'num', value: t });
      else tokens.push({ kind: 'op', value: t });
    }

    const nums = (ops: Tok[]): number[] =>
      ops.filter((o) => o.kind === 'num').map((o) => Number(o.value));
    const textOf = (o: Tok): string =>
      o.kind === 'str' ? decodePdfTextString(o.value) : hexToText(o.value);
    const lastName = (ops: Tok[]): Tok | undefined => {
      for (let i = ops.length - 1; i >= 0; i--) {
        if (ops[i].kind === 'name') return ops[i];
      }
      return undefined;
    };

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
            const p = toWorld(tm.e, tm.f);
            items.push({ str: textOf(s), x: p.x, y: p.y, size: curSize() });
          }
          operandos = [];
          break;
        }
        case "'": {
          const s = lastText(operandos);
          if (s) {
            tlm = { ...tlm, f: tlm.f - leading };
            const p = toWorld(tlm.e, tlm.f);
            items.push({ str: textOf(s), x: p.x, y: p.y, size: curSize() });
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
                const p = toWorld(tm.e + dx, tm.f);
                items.push({
                  str: run,
                  x: p.x,
                  y: p.y,
                  size: curSize(),
                });
                dx += measure.widthOfTextAtSize(run, curSize()) * 0.01;
                run = '';
              }
              dx += (-Number(o.value) / 1000) * (curSize());
            }
          }
          if (run) {
            const p = toWorld(tm.e + dx, tm.f);
            items.push({ str: run, x: p.x, y: p.y, size: curSize() });
          }
          operandos = [];
          break;
        }
        case 'q': {
          ctmStack.push({ ...ctm });
          operandos = [];
          break;
        }
        case 'Q': {
          const prev = ctmStack.pop();
          if (prev) ctm = { ...prev };
          operandos = [];
          break;
        }
        case 'cm': {
          const v = nums(operandos);
          if (v.length >= 6) {
            ctm = matMul({ a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] }, ctm);
          }
          operandos = [];
          break;
        }
        case 'Do': {
          const nameTok = lastName(operandos);
          const xobjContent = nameTok ? xobjects.get(nameTok.value) : undefined;
          if (xobjContent && depth < MAX_DEPTH) {
            processContent(xobjContent, { ...ctm }, depth + 1);
          }
          operandos = [];
          break;
        }
        default:
          operandos = [];
      }
    }
  };

  processContent(raw, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, 0);
  return items;
}

/**
 * Runs de texto con coordenadas PDF (origen abajo-izquierda), derivados de
 * pdfjs. Se usan para el locate de replaces y fills.
 */
interface LocatedRun {
  str: string;
  x: number;
  baselineY: number;
  width: number;
  size: number;
}

/**
 * Extrae los runs de una página vía pdfjs y los convierte a coordenadas
 * PDF-lib (y invertida). Devuelve null si pdfjs no puede abrir el PDF.
 */
async function getRunsViaPdfjs(
  pdfBuffer: Buffer,
  pageIndex0: number
): Promise<LocatedRun[] | null> {
  try {
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: false,
      password: '',
    }).promise;
    if (pageIndex0 < 0 || pageIndex0 >= pdf.numPages) return null;
    const page = await pdf.getPage(pageIndex0 + 1);
    const content = await page.getTextContent();
    const runs: LocatedRun[] = [];
    for (const t of content.items) {
      if (!('str' in t) || !('transform' in t)) continue;
      if (!t.str) continue;
      const tr = (t as { transform: number[] }).transform;
      const w = (t as { width: number }).width ?? 0;
      // Empíricamente (verificado con pdf-lib: drawText x=50,y=700 → pdfjs
      // transform[4]=50, transform[5]=700): pdfjs entrega el transform en
      // coordenadas PDF nativas, mismo sistema que pdf-lib (origen abajo-
      // izquierda, y arriba). No hay que convertir nada.
      const size = (t as { height: number }).height || 11;
      runs.push({
        str: t.str,
        x: tr[4],
        baselineY: tr[5],
        width: w,
        size,
      });
    }
    return runs;
  } catch {
    return null;
  }
}

/**
 * Localiza needle dentro de la lista de runs (para el fallback con parser
 * manual y también como helper interno). Convierte runs → rect.
 */
function findRectInRuns(
  runs: LocatedRun[],
  needle: string,
  measure: { widthOfTextAtSize: (s: string, n: number) => number }
): { x: number; y: number; width: number; height: number } | null {
  // Agrupar en líneas por baseline (±2pt), concatenando con espacio.
  interface Line { text: string; runs: LocatedRun[]; y: number }
  const lines: Line[] = [];
  const sorted = [...runs].sort((a, b) => a.baselineY - b.baselineY);
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - r.baselineY) < 2) {
      last.text += (last.text && !last.text.endsWith(' ') ? ' ' : '') + r.str;
      last.runs.push(r);
    } else {
      lines.push({ text: r.str, runs: [r], y: r.baselineY });
    }
  }
  const target = lines.find((l) => l.text.includes(needle));
  if (!target) return null;

  const start = target.text.indexOf(needle);
  const end = start + needle.length;
  let acc = 0;
  let xStart: number | null = null;
  let xEnd: number | null = null;
  let baselineY = target.y;
  let size = target.runs[0]?.size || 11;
  for (const r of target.runs) {
    const itemStart = acc;
    const itemEnd = acc + r.str.length;
    if (itemEnd > start && itemStart < end) {
      const overlapStart = Math.max(itemStart, start) - itemStart;
      const overlapEnd = Math.min(itemEnd, end) - itemStart;
      const pxStart = r.x + measure.widthOfTextAtSize(r.str.slice(0, overlapStart), r.size || size);
      const pxEnd = r.x + measure.widthOfTextAtSize(r.str.slice(0, overlapEnd), r.size || size);
      if (xStart === null) xStart = pxStart;
      xEnd = pxEnd;
      baselineY = r.baselineY;
      size = r.size || size;
    }
    acc += r.str.length + 1;
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
 * Busca el needle en la página y devuelve el rect (x, y, w, h) que lo cubre.
 * Capa pdfjs primero, parser manual de fallback.
 */
export async function findTextCoords(
  pdfBuffer: Buffer,
  pageIndex0: number,
  needle: string,
  measure: { widthOfTextAtSize: (s: string, n: number) => number }
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const runs = await getRunsViaPdfjs(pdfBuffer, pageIndex0);
  if (runs && runs.length) {
    return findRectInRuns(runs, needle, measure);
  }
  // Fallback manual: el extractor propio sobre el page-node de pdf-lib.
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    if (pageIndex0 < 0 || pageIndex0 >= pdfDoc.getPageCount()) return null;
    const page = pdfDoc.getPage(pageIndex0);
    if (page.getRotation().angle !== 0) return null;
    const items: TextItem[] = extractTextItems(page, measure);
    const runsManual: LocatedRun[] = items.map((it) => ({
      str: it.str, x: it.x, baselineY: it.y, width: measure.widthOfTextAtSize(it.str, it.size || 11), size: it.size || 11,
    }));
    return findRectInRuns(runsManual, needle, measure);
  } catch {
    return null;
  }
}/**
 * Posición para ESCRIBIR texto nuevo anclado al final de una etiqueta.
 * Capa pdfjs primero, parser manual de fallback. offsetX/offsetY permiten
 * ajustar fino (líneas de subrayado, etc.).
 */
export async function findAnchorCoords(
  pdfBuffer: Buffer,
  pageIndex0: number,
  anchor: string,
  measure: { widthOfTextAtSize: (s: string, n: number) => number }
, opts?: { offsetX?: number; offsetY?: number }
): Promise<{ x: number; y: number; size: number } | null> {
  const runs = await getRunsViaPdfjs(pdfBuffer, pageIndex0);
  if (runs && runs.length) {
    const anchorRect = findRectInRuns(runs, anchor, measure);
    if (anchorRect) {
      const gap = 6;
      return {
        x: anchorRect.x + anchorRect.width + gap + (opts?.offsetX ?? 0),
        y: anchorRect.y + 2 + (opts?.offsetY ?? 0),
        size: Math.max(anchorRect.height - 3, 8),
      };
    }
    return null;
  }
  // Fallback manual
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    if (pageIndex0 < 0 || pageIndex0 >= pdfDoc.getPageCount()) return null;
    const page = pdfDoc.getPage(pageIndex0);
    if (page.getRotation().angle !== 0) return null;
    const items: TextItem[] = extractTextItems(page, measure);
    if (!items.length) return null;
    const runsManual: LocatedRun[] = items.map((it) => ({
      str: it.str, x: it.x, baselineY: it.y, width: measure.widthOfTextAtSize(it.str, it.size || 11), size: it.size || 11,
    }));
    const anchorRect = findRectInRuns(runsManual, anchor, measure);
    if (!anchorRect) return null;
    const gap = 6;
    return {
      x: anchorRect.x + anchorRect.width + gap + (opts?.offsetX ?? 0),
      y: anchorRect.y + 2 + (opts?.offsetY ?? 0),
      size: Math.max(anchorRect.height - 3, 8),
    };
  } catch {
    return null;
  }
}

/**
 * Detecta campos de formulario (AcroForm) del PDF: nombre, tipo y valor
 * actual. Devuelve [] si el PDF no tiene campos. El LLM usa esta lista
 * para decidir entre llenar campos reales (fields) vs insertar texto
 * (fills) en formularios impresos sin campos.
 */
export function extractFormFields(pdfDoc: PDFDocument): Array<{ name: string; type: string; value: string }> {
  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    return fields.map((f) => {
      const name = f.getName();
      const ctor = f.constructor.name;
      let type = 'text';
      if (ctor.includes('CheckBox')) type = 'checkbox';
      else if (ctor.includes('RadioGroup')) type = 'radio';
      else if (ctor.includes('DropDown')) type = 'dropdown';
      else if (ctor.includes('OptionList')) type = 'list';
      let value = '';
      try {
        if (type === 'checkbox') value = (form.getCheckBox(name)).isChecked() ? 'true' : 'false';
        else if (type === 'text') value = form.getTextField(name).getText() || '';
        else if (type === 'dropdown') value = form.getDropdown(name).getSelected()[0] || '';
      } catch {
        value = '';
      }
      return { name, type, value };
    });
  } catch {
    return [];
  }
}

/**
 * Extrae el texto de todas las páginas con marcadores "=== PÁGINA n ===",
 * listo para meter al prompt del LLM.
 *
 * Estrategia en dos capas:
 *   1. pdfjs-dist (preferida): entiende CMaps, ToUnicode, fuentes subset y
 *      texto dentro de XObjects — cubre los PDFs que el parser manual trata
 *      como "escaneados" cuando SÍ tienen texto.
 *   2. Parser manual (fallback): si pdfjs falla (PDF corrupto, cifrado
 *      no-soportado, WASM faltante en runtime), usamos el extractor propio
 *      de operadores de texto con pdf-lib.
 */
export interface ExtractDiag {
  engine: 'pdfjs' | 'manual' | 'mixed' | 'none';
  pageCount: number;
  pages: Array<{ page: number; engine: string; items: number; error?: string }>;
  pdfjsFatal?: string;
  manualFatal?: string;
}

export interface DetailedExtract {
  text: string;
  diag: ExtractDiag;
}

/** Igual que extractPdfTextPerPage pero devuelve diagnóstico por capa/página. */
export async function extractPdfTextDetailed(pdfBuffer: Buffer): Promise<DetailedExtract> {
  const diag: ExtractDiag = { engine: 'none', pageCount: 0, pages: [] };
  try {
    const res = await extractWithPdfjsDetailed(pdfBuffer, diag);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diag.pdfjsFatal = msg;
    console.warn('[pdf-text] pdfjs falló, usando parser manual:', msg);
    try {
      const text = await extractWithManualParser(pdfBuffer, diag);
      diag.engine = diag.pages.some((p) => p.engine === 'manual' && p.items > 0) ? 'manual' : 'none';
      return { text, diag };
    } catch (err2) {
      diag.manualFatal = err2 instanceof Error ? err2.message : String(err2);
      return { text: '', diag };
    }
  }
}

export async function extractPdfTextPerPage(pdfBuffer: Buffer): Promise<string> {
  try {
    return await extractWithPdfjs(pdfBuffer);
  } catch (err) {
    console.warn('[pdf-text] pdfjs falló, usando parser manual:', err instanceof Error ? err.message : err);
    return extractWithManualParser(pdfBuffer);
  }
}

async function extractWithPdfjsDetailed(pdfBuffer: Buffer, diag: ExtractDiag): Promise<DetailedExtract> {
  // Nota: pdfjs corre en este mismo proceso (worker legacy en Node). No puede
  // abortarse; el timeout de Vercel es la red de seguridad ante un PDF
  // malicioso/corrupto que haga girar el parser.
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    password: '',
  }).promise;
  diag.pageCount = pdf.numPages;
  const out: string[] = [];
  const emptyPages: number[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    // Reconstruimos el orden de lectura: las "items" de pdfjs llegan en orden
    // del stream, del cual muchas veces no es orden de lectura. Agrupamos por
    // bandas horizontales (mismo height/2), y por X ascendente dentro de la
    // banda; después ordenamos por Y desc.
    type Item = { str: string; x: number; y: number; w: number; h: number };
    let items: Item[] = [];
    try {
      const page = await pdf.getPage(i + 1);
      const content = await page.getTextContent();
      for (const t of content.items) {
        if (!('str' in t) || !('transform' in t)) continue;
        const tr = t.transform as number[];
        const x = tr[4];
        const y = tr[5];
        const h = 'height' in t ? (t.height as number) : 10;
        if (!t.str.trim()) continue;
        items.push({ str: t.str, x, y, w: t.width ?? 0, h });
      }
    } catch (err) {
      // Página corrupta o ignorada por pdfjs: cae al parser manual.
      diag.pages.push({ page: i + 1, engine: 'pdfjs', items: 0, error: err instanceof Error ? err.message : String(err) });
      items = [];
    }
    if (items.length) {
      items.sort((a, b) => {
        const bandA = Math.round(a.y / (a.h || 10));
        const bandB = Math.round(b.y / (b.h || 10));
        if (bandA !== bandB) return bandB - bandA; // Y descendente (arriba→abajo)
        return a.x - b.x;
      });
      diag.pages.push({ page: i + 1, engine: 'pdfjs', items: items.length });
      out.push(`=== PÁGINA ${i + 1} ===\n${items.map((it) => it.str).join('\n')}`);
    } else {
      emptyPages.push(i);
      if (!diag.pages.some((p) => p.page === i + 1)) {
        diag.pages.push({ page: i + 1, engine: 'pdfjs', items: 0 });
      }
      out.push(`=== PÁGINA ${i + 1} ===\n<<EMPTY_${i}>>`);
    }
  }
  if (emptyPages.length) {
    // Fallback manual SOLO para las páginas que pdfjs no logró: el parser
    // propio resuelve Form XObjects y streams que pdfjs a veces ignora.
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      const dummy = {
        widthOfTextAtSize: (s: string, n: number) => s.length * n * 0.5,
      };
      for (const i of emptyPages) {
        if (i < 0 || i >= pdfDoc.getPageCount()) continue;
        const manualItems = extractTextItems(pdfDoc.getPage(i), dummy);
        const entry = diag.pages.find((p) => p.page === i + 1);
        if (entry) entry.engine = manualItems.length ? 'manual' : 'none';
        if (manualItems.length) {
          manualItems.sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y));
          if (entry) entry.items = manualItems.length;
          out[i] = `=== PÁGINA ${i + 1} ===\n${manualItems.map((it) => it.str).join('\n')}`;
        } else {
          out[i] = `=== PÁGINA ${i + 1} ===\n(sin texto extraíble — posiblemente escaneada)`;
        }
      }
    } catch (err) {
      // PDF ilegible por pdf-lib: quedan los marcadores <<EMPTY_i>>;
      // extractPdfTextPerPage no debe caer entero al parser manual por una
      // página individual.
      diag.manualFatal = err instanceof Error ? err.message : String(err);
    }
  }
  const anyOk = diag.pages.some((p) => p.items > 0);
  diag.engine = anyOk
    ? (diag.pages.some((p) => p.items > 0 && p.engine === 'manual') ? 'mixed' : 'pdfjs')
    : 'none';
  return { text: out.join('\n\n'), diag };
}

async function extractWithPdfjs(pdfBuffer: Buffer): Promise<string> {
  const { text } = await extractWithPdfjsDetailed(pdfBuffer, { engine: 'pdfjs', pageCount: 0, pages: [] });
  return text;
}
/**
 * Fallback: extracción con el parser manual (operadores BT/ET, Tf, Tm, Tj,
 * TJ...). Devuelve el mismo formato "=== PÁGINA n ===".
 */
async function extractWithManualParser(pdfBuffer: Buffer, diag?: ExtractDiag): Promise<string> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const dummy: { widthOfTextAtSize: (s: string, n: number) => number } = {
    // Sólo afecta el avance horizontal en arrays TJ; una estimación basta.
    widthOfTextAtSize: (s, n) => s.length * n * 0.5,
  };
  const out: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const items = extractTextItems(pages[i], dummy);
    diag?.pages.push({ page: i + 1, engine: items.length ? 'manual' : 'none', items: items.length });
    if (!items.length) {
      out.push(`=== PÁGINA ${i + 1} ===\n(sin texto extraíble — posiblemente escaneada)`);
      continue;
    }
    // Orden de lectura: por Y descendente, luego X ascendente.
    items.sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y));
    out.push(`=== PÁGINA ${i + 1} ===\n${items.map((it) => it.str).join('\n')}`);
  }
  return out.join('\n\n');
}

