/**
 * Genera un PDF de prueba con la MISMA estructura que el documento real del
 * usuario (texto carácter por carácter con Tm/Tj independientes, fuente
 * Helvetica), para reproducir el flujo de edición.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('/tmp/pdf-test', { recursive: true });

const doc = await PDFDocument.create();
const page = doc.addPage([595, 842]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

/** Escribe texto carácter por carácter con Tm/Tj independientes (como el PDF real). */
function writeChars(text, x, y, size, f) {
  let cursor = x;
  for (const ch of text) {
    const w = f.widthOfTextAtSize(ch, size);
    page.drawText(ch, { x: cursor, y, size, font: f });
    cursor += w;
  }
  return cursor;
}

writeChars('EXAMEN NACIONAL DE PRESELECCION - CONVOCATORIA 2027', 72, 770, 11, bold);
writeChars('DECLARACION JURADA DEL CANDIDATO', 72, 750, 12, bold);
writeChars('Yo, ESPINOZA CARRASCO, EDTIH, identificado con DNI N.º 09404027, candidato al cargo de', 72, 717, 10, font);
writeChars('reconozco que estare incurriendo en delito contra la fe publica.', 72, 705, 10, font);
writeChars('Firma', 72, 110, 9, font);
writeChars('Apellidos y Nombres: ESPINOZA CARRASCO, EDTIH', 72, 88, 9, font);
writeChars('DNI N.°: 09404027', 72, 77, 9, font);
writeChars('Firmado digitalmente por ESPINOZA CARRASCO EDTIH', 72, 40, 8, font);

writeFileSync('/tmp/pdf-test/DJ.pdf', await doc.save());
console.log('PDF de prueba generado: /tmp/pdf-test/DJ.pdf');
