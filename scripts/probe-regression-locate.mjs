/**
 * Regresión del motor de localización de texto (/api/_pdf/text.ts).
 *
 * Comprueba los casos que hacían que una edición se descartara EN SILENCIO:
 *   - "DNI N.º 09404027" (ordinal) debe encontrar "DNI N.°: 09404027" (grado)
 *   - espacios extra / de más no deben romper la coincidencia
 *   - mayúsculas distintas no deben romperla
 *   - un texto que no existe NO debe "encontrarse" (falso positivo)
 *   - todas las apariciones en la página deben localizarse
 *
 * Uso: node scripts/probe-regression-locate.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import ts from 'typescript';

const tsSrc = readFileSync('api/_pdf/text.ts', 'utf8');
const js = ts.transpileModule(tsSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync('scripts/.tl.mjs', js);
const mod = await import('./.tl.mjs');
unlinkSync('scripts/.tl.mjs');

/* ---------- PDF de prueba (mismo estilo que un formulario real) ---------- */
const doc = await PDFDocument.create();
const page = doc.addPage([595, 842]);
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
function writeChars(text, x, y, size, f) {
  let cursor = x;
  for (const ch of text) {
    page.drawText(ch, { x: cursor, y, size, font: f });
    cursor += f.widthOfTextAtSize(ch, size);
  }
}
writeChars('DECLARACION JURADA DEL CANDIDATO', 72, 750, 12, bold);
writeChars('Yo, ESPINOZA CARRASCO, EDTIH, identificado con DNI N.º 09404027, candidato al cargo de', 72, 717, 10, font);
writeChars('Apellidos y Nombres: ESPINOZA CARRASCO, EDTIH', 72, 88, 9, font);
writeChars('DNI N.°: 09404027', 72, 77, 9, font);
const buf = Buffer.from(await doc.save());

const helv = await (await PDFDocument.load(buf)).embedFont(StandardFonts.Helvetica);
const locate = async (needle) => (await mod.findAllTextCoords(buf, 0, needle, helv)).length;

/* ---------- Casos ---------- */
const cases = [
  // [needle, coincidencias esperadas, descripción]
  ['09404027', 2, 'el número pelado aparece en el párrafo y en el campo'],
  ['DNI N.º 09404027', 2, 'ordinal (º) encuentra el grado (°) del campo'],
  ['DNI N.°: 09404027', 2, 'grado (°) encuentra el ordinal (º) del párrafo'],
  ['DNI N.°:  09404027', 2, 'doble espacio no rompe la coincidencia'],
  ['dni n.°: 09404027', 2, 'minúsculas distintas no rompen la coincidencia'],
  ['09404027', 2, 'sin espacios añadidos entre runs'],
  ['NO EXISTE ESTE TEXTO 12345', 0, 'texto inexistente: cero coincidencias'],
  ['99999999', 0, 'otro número inexistente: cero coincidencias'],
  // El ordinal+':' no aparece literal en ninguna de las dos líneas, pero los
  // dígitos "09404027" sí: el matcher debe anclarse en los dígitos y no
  // exigir que la puntuación coincida exactamente.
  ['DNI N.º: 09404027', 2, 'ordinal+colon se ancla en los dígitos'],
];

let failed = 0;
for (const [needle, expected, why] of cases) {
  const got = await locate(needle);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASA' : 'FALLA'}  "${needle}" → ${got} (esperado ${expected})  ${why}`);
}

/* ---------- Geometría: el rect debe caer sobre el texto real ---------- */
const rects = await mod.findAllTextCoords(buf, 0, '09404027', helv);
const labelRect = rects.find((r) => r.y < 100);
if (!labelRect) {
  console.log('FALLA  no se localizó el DNI del campo (y≈77)');
  failed++;
} else {
  const ok = labelRect.x > 100 && labelRect.x < 140 && labelRect.size === 9;
  if (!ok) failed++;
  console.log(
    `${ok ? 'PASA' : 'FALLA'}  rect del campo: x=${labelRect.x.toFixed(1)} y=${labelRect.y.toFixed(1)} size=${labelRect.size} (esperado x≈112, size=9)`,
  );
}

console.log(failed === 0 ? '\nTODO OK' : `\n${failed} CASOS FALLAN`);
process.exit(failed === 0 ? 0 : 1);
