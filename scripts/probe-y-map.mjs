import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import ts from 'typescript';

const tsSrc = readFileSync('api/_pdf/text.ts', 'utf8');
const js = ts.transpileModule(tsSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync('scripts/.tm2.mjs', js);
const mod = await import('./.tm2.mjs');
unlinkSync('scripts/.tm2.mjs');

const buf = readFileSync(process.argv[2] ?? '/tmp/pdf-test/DJ-editado.pdf');
const u8 = new Uint8Array(buf);

// pdfjs: transform[4], transform[5]
const pdf = await pdfjsLib.getDocument({ data: u8, useSystemFonts: false, password: '' }).promise;
const page = await pdf.getPage(1);
const { height } = page.getViewport({ scale: 1 });
const tc = await page.getTextContent();
for (const t of tc.items) {
  if (!('str' in t) || !t.str) continue;
  if (String(t.str).includes('ESPINOZA') || String(t.str).includes('09404027') || String(t.str).includes('11111111')) {
    console.log('pdfjs  str:', JSON.stringify(t.str.slice(0, 40)), 'x=', t.transform[4]?.toFixed(1), 'y=', t.transform[5]?.toFixed(1), '(pageH', height.toFixed(1), '- y =', (height - t.transform[5]).toFixed(1), ')');
  }
}

// parser manual: coordenadas del extractor propio
const doc = await (await import('pdf-lib')).PDFDocument.load(buf, { ignoreEncryption: true });
const items = mod.extractTextItems(doc.getPage(0), { widthOfTextAtSize: (s, n) => s.length * n * 0.5 });
for (const it of items) {
  if (it.str.includes('ESPINOZA') || it.str.includes('09404027') || it.str.includes('11111111')) {
    console.log('manual str:', JSON.stringify(it.str.slice(0, 40)), 'x=', it.x.toFixed(1), 'y=', it.y.toFixed(1));
  }
}
