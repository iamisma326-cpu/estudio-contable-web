import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

// PDF origen con texto (se convertirá en Form XObject)
const src = await PDFDocument.create();
const sp = src.addPage([595, 842]);
const font = await src.embedFont(StandardFonts.Helvetica);
sp.drawText('FACTURA ELECTRONICA\nCliente: ACME SAC', { x: 50, y: 700, size: 12, font });

const srcB64 = Buffer.from(await src.save());

// PDF destino que pinta ese contenido como XObject Form (patrón real de print-to-pdf)
// IMPORTANTE: incrustar y dibujar en el MISMO documento (si no, ref colgante).
const out = await PDFDocument.create();
const [embedded] = await out.embedPdf(srcB64, [0]);
const page = out.addPage([595, 842]);
page.drawPage(embedded, { x: 0, y: 0, width: 595, height: 842 });

writeFileSync('/tmp/pdf-test/xobject-proper.pdf', await out.save());
console.log('xobject-proper.pdf generado');
