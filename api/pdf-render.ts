/**
 * POST /api/pdf-render
 *
 * Recibe { pdfBase64, ops: ReplaceOp[] } y devuelve JSON:
 *   { ok: true, base64: <PDF resultante>, applied: [{page, find, status}] }
 *
 * Implementación:
 *   - Para cada op localiza el texto "find" en el content stream de la página
 *     (parseo propio de operadores PDF: Tm, Tj, TJ, Td, TD, T*, TL, Tf) para
 *     obtener x/y reales. pdf-lib no expone getText().
 *   - Dibuja un rect blanco cubriendo el texto original y redibuja "replace"
 *     encima en el mismo sitio.
 *   - Si no puede ubicar el texto (fuente subset con codificación rara, PDF
 *     escaneado), lo marca status:'not_found' y agrega una banda visible al
 *     pie con el cambio propuesto — honesto en vez de silencioso.
 *
 * Autenticación: cookie admin (mismo patrón que /api/admin/*).
 */

import type { ReqLike, ResLike } from './_admin/auth.js';
import { verifyCookie, readJsonBody } from './_admin/auth.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { findTextCoords, findAnchorCoords } from './_pdf/text.js';

interface ReplaceOp {
  page: number;
  find: string;
  replace: string;
  cover?: boolean;
}

/** Escribir texto nuevo anclado a una etiqueta existente. */
interface FillOp {
  page: number;
  anchor: string;
  value: string;
  offsetX?: number;
  offsetY?: number;
}

/** Llenar campo AcroForm por nombre. */
interface FieldOp {
  name: string;
  value: string;
  type?: 'text' | 'checkbox' | 'dropdown';
}

interface RenderRequest {
  pdfBase64?: unknown;
  ops?: unknown;
  fills?: unknown;
  fields?: unknown;
}

/* ===== Handler ===== */

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  const origin = req.headers?.['origin'];
  res.setHeader('Access-Control-Allow-Origin', typeof origin === 'string' ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!verifyCookie(req.headers)) {
    res.status(401).json({ ok: false, error: 'not_authenticated' });
    return;
  }

  const body = (await readJsonBody(req)) as RenderRequest | null;
  const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : '';
  const opsRaw = Array.isArray(body?.ops) ? body!.ops : [];
  const fillsRaw = Array.isArray(body?.fills) ? body!.fills : [];
  const fieldsRaw = Array.isArray(body?.fields) ? body!.fields : [];

  if (!pdfBase64) {
    res.status(400).json({ ok: false, error: 'pdf_required' });
    return;
  }
  const ops: ReplaceOp[] = [];
  for (const o of opsRaw) {
    if (
      o && typeof o === 'object' &&
      typeof (o as ReplaceOp).page === 'number' &&
      typeof (o as ReplaceOp).find === 'string' &&
      typeof (o as ReplaceOp).replace === 'string'
    ) {
      ops.push({
        page: Math.max(1, Math.floor((o as ReplaceOp).page)),
        find: (o as ReplaceOp).find,
        replace: (o as ReplaceOp).replace,
        cover: (o as ReplaceOp).cover === true,
      });
    }
  }
  const fills: FillOp[] = [];
  for (const f of fillsRaw) {
    if (
      f && typeof f === 'object' &&
      typeof (f as FillOp).page === 'number' &&
      typeof (f as FillOp).anchor === 'string' &&
      typeof (f as FillOp).value === 'string'
    ) {
      fills.push({
        page: Math.max(1, Math.floor((f as FillOp).page)),
        anchor: (f as FillOp).anchor,
        value: (f as FillOp).value,
        offsetX: typeof (f as FillOp).offsetX === 'number' ? (f as FillOp).offsetX : undefined,
        offsetY: typeof (f as FillOp).offsetY === 'number' ? (f as FillOp).offsetY : undefined,
      });
    }
  }
  const fields: FieldOp[] = [];
  for (const f of fieldsRaw) {
    if (
      f && typeof f === 'object' &&
      typeof (f as FieldOp).name === 'string' &&
      typeof (f as FieldOp).value === 'string'
    ) {
      fields.push({
        name: (f as FieldOp).name,
        value: (f as FieldOp).value,
        type: (f as FieldOp).type === 'checkbox' || (f as FieldOp).type === 'dropdown' ? (f as FieldOp).type : 'text',
      });
    }
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = Buffer.from(pdfBase64, 'base64');
  } catch {
    res.status(400).json({ ok: false, error: 'invalid_base64' });
    return;
  }

  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const applied: Array<{ page: number; find: string; status: 'ok' | 'not_found' }> = [];

    /* ===== Campos AcroForm: llenar por nombre (antes que nada) ===== */
    let form: ReturnType<PDFDocument['getForm']> | null = null;
    try {
      form = pdfDoc.getForm();
    } catch {
      form = null;
    }
    const fieldResults: Array<{ name: string; status: 'ok' | 'not_found' }> = [];
    for (const f of fields) {
      if (!form) {
        fieldResults.push({ name: f.name, status: 'not_found' });
        continue;
      }
      try {
        if (f.type === 'checkbox') {
          const cb = form.getCheckBox(f.name);
          if (f.value === 'true' || f.value === 'si' || f.value === 'sí') cb.check();
          else cb.uncheck();
        } else if (f.type === 'dropdown') {
          const dd = form.getDropdown(f.name);
          dd.select(f.value);
        } else {
          const tf = form.getTextField(f.name);
          tf.setText(f.value);
        }
        fieldResults.push({ name: f.name, status: 'ok' });
      } catch {
        fieldResults.push({ name: f.name, status: 'not_found' });
      }
    }
    if (form) {
      try { form.flatten(); } catch { /* flatten opcional: si falla, los campos quedan editables */ }
    }

    /* ===== Fills: escribir texto anclado a etiquetas ===== */
    const fillResults: Array<{ page: number; anchor: string; status: 'ok' | 'not_found' }> = [];
    for (const fill of fills) {
      const pageIndex = fill.page - 1;
      if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
        fillResults.push({ page: fill.page, anchor: fill.anchor, status: 'not_found' });
        continue;
      }
      const page = pdfDoc.getPage(pageIndex);
      let pos: { x: number; y: number; size: number } | null = null;
      try {
        pos = await findAnchorCoords(pdfBuffer, pageIndex, fill.anchor, helvetica, {
          offsetX: fill.offsetX,
          offsetY: fill.offsetY,
        });
      } catch {
        pos = null;
      }
      if (!pos) {
        fillResults.push({ page: fill.page, anchor: fill.anchor, status: 'not_found' });
        continue;
      }
      page.drawText(fill.value, {
        x: pos.x,
        y: pos.y,
        size: pos.size || fontSize,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      fillResults.push({ page: fill.page, anchor: fill.anchor, status: 'ok' });
    }

    for (const op of ops) {
      const pageIndex = op.page - 1;
      if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
        applied.push({ page: op.page, find: op.find, status: 'not_found' });
        continue;
      }
      const page = pdfDoc.getPage(pageIndex);
      const { width: w } = page.getSize();

      let coords: { x: number; y: number; width: number; height: number } | null = null;
      try {
        coords = await findTextCoords(pdfBuffer, pageIndex, op.find, helvetica);
      } catch {
        coords = null;
      }

      if (!coords) {
        // Fallback honesto: banda al pie con el cambio propuesto, visible y
        // auditable. El usuario decide si lo acepta o corrige el "find".
        const noticeY = 30;
        page.drawRectangle({
          x: 30,
          y: noticeY,
          width: w - 60,
          height: fontSize + 7,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.8, 0.6, 0.3),
          borderWidth: 0.5,
        });
        page.drawText(`${op.find}  ->  ${op.replace}`, {
          x: 34,
          y: noticeY + 2,
          size: fontSize - 1,
          font: helvetica,
          color: rgb(0.7, 0.3, 0.1),
        });
        applied.push({ page: op.page, find: op.find, status: 'not_found' });
        continue;
      }

      // Cubre el texto original con blanco y redibuja el reemplazo encima.
      page.drawRectangle({
        x: coords.x,
        y: coords.y,
        width: Math.max(coords.width, helvetica.widthOfTextAtSize(op.replace, fontSize) + 4),
        height: Math.max(coords.height, fontSize + 3),
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
      page.drawText(op.replace, {
        x: coords.x + 2,
        y: coords.y + 2,
        size: fontSize,
        font: helvetica,
        color: rgb(0, 0, 0),
      });

      applied.push({ page: op.page, find: op.find, status: 'ok' });
    }

    const outBytes = await pdfDoc.save();
    const outBuffer = Buffer.from(outBytes);

    res.status(200).json({
      ok: true,
      base64: outBuffer.toString('base64'),
      applied: applied.map((a) => ({ page: a.page, find: a.find, status: a.status })),
      appliedFills: fillResults,
      appliedFields: fieldResults,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: 'render_failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
