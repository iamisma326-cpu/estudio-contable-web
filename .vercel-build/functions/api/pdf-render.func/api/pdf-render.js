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
import { verifyCookie, readJsonBody } from './_admin/auth.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { findTextCoords } from './_pdf/text.js';
/* ===== Handler ===== */
export default async function handler(req, res) {
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
    const body = (await readJsonBody(req));
    const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : '';
    const opsRaw = Array.isArray(body?.ops) ? body.ops : [];
    if (!pdfBase64) {
        res.status(400).json({ ok: false, error: 'pdf_required' });
        return;
    }
    const ops = [];
    for (const o of opsRaw) {
        if (o && typeof o === 'object' &&
            typeof o.page === 'number' &&
            typeof o.find === 'string' &&
            typeof o.replace === 'string') {
            ops.push({
                page: Math.max(1, Math.floor(o.page)),
                find: o.find,
                replace: o.replace,
                cover: o.cover === true,
            });
        }
    }
    let pdfBuffer;
    try {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
    }
    catch {
        res.status(400).json({ ok: false, error: 'invalid_base64' });
        return;
    }
    try {
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 11;
        const applied = [];
        for (const op of ops) {
            const pageIndex = op.page - 1;
            if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
                applied.push({ page: op.page, find: op.find, status: 'not_found' });
                continue;
            }
            const page = pdfDoc.getPage(pageIndex);
            const { width: w } = page.getSize();
            let coords = null;
            try {
                coords = findTextCoords(page, op.find, helvetica);
            }
            catch {
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
        });
    }
    catch (err) {
        res.status(500).json({
            ok: false,
            error: 'render_failed',
            detail: err instanceof Error ? err.message : String(err),
        });
    }
}
//# sourceMappingURL=pdf-render.js.map