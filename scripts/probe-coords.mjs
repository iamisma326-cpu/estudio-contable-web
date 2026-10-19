import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import ts from 'typescript';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const tsSrc = readFileSync('api/_pdf/text.ts', 'utf8');
const js = ts.transpileModule(tsSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync('scripts/.t2.mjs', js);
const mod = await import('./.t2.mjs');
unlinkSync('scripts/.t2.mjs');

const path = process.argv[2] ?? '/tmp/pdf-test/xobject-proper.pdf';
const buf = readFileSync(path);
const doc = await PDFDocument.load(buf);
const font = await doc.embedFont(StandardFonts.Helvetica);

const find = process.argv[3] ?? ' Cliente';
const rect = await mod.findTextCoords(buf, 0, find, font);
console.log('findTextCoords', JSON.stringify(find), '→', rect ? JSON.stringify(rect) : 'null');
const anchor = process.argv[4] ?? 'Cliente:';
const pos = await mod.findAnchorCoords(buf, 0, anchor, font);
console.log('findAnchorCoords', JSON.stringify(anchor), '→', pos ? JSON.stringify(pos) : 'null');
