import { PDFDocument, StandardFonts, rgb, PDFName } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

// 1) PDF de texto normal (pdf-lib estándar)
const d1 = await PDFDocument.create();
const p1 = d1.addPage([595, 842]);
const f1 = await d1.embedFont(StandardFonts.Helvetica);
p1.drawText('Nombre: Juan Perez\nRUC: 20123456789\nFecha: 2025-03-01', { x: 50, y: 700, size: 12, font: f1 });
writeFileSync('/tmp/pdf-test/texto-normal.pdf', await d1.save());

// 2) PDF con texto dentro de un XObject Form (patrón típico de sistemas de impresión)
const d2 = await PDFDocument.create();
const p2 = d2.addPage([595, 842]);
const f2 = await d2.embedFont(StandardFonts.Helvetica);
// XObject Form crudo con content stream propio
const xobjDict = d2.context.obj({
  Type: 'XObject', Subtype: 'Form', FormType: 1,
  BBox: [0, 0, 595, 842],
});
const xobj = d2.context.flateStream(
  Buffer.from('BT /F1 12 Tf 50 700 Td (FACTURA ELECTRONICA) Tj 0 -20 Td (Cliente: ACME SAC) Tj ET'),
  { ...xobjDict }
);
const xobjRef = d2.context.register(xobj);
p2.node.set(PDFName.of('Resources'), d2.context.obj({
  Font: { F1: d2.context.register(d2.context.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica' })) },
  XObject: { Im0: xobjRef },
}));
p2.node.set(PDFName.of('Contents'), d2.context.stream('/Im0 Do'));
writeFileSync('/tmp/pdf-test/xobject.pdf', await d2.save());

// 3) PDF "escaneado": solo una imagen grande, sin texto
const d3 = await PDFDocument.create();
const p3 = d3.addPage([595, 842]);
// PNG de 1x1 px rojo a modo de imagen decorativa
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const png = await d3.embedPng(Buffer.from(pngB64, 'base64'));
p3.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
writeFileSync('/tmp/pdf-test/escaneado.pdf', await d3.save());

console.log('PDFs generados OK');
