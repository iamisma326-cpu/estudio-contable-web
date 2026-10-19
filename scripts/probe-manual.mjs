import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { PDFDocument, PDFRawStream, PDFName, decodePDFRawStream } from 'pdf-lib';
import ts from 'typescript';

const tsSrc = readFileSync('api/_pdf/text.ts', 'utf8');
const js = ts.transpileModule(tsSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync('scripts/.tm.mjs', js);
const mod = await import('./.tm.mjs');
unlinkSync('scripts/.tm.mjs');

const buf = readFileSync(process.argv[2] ?? '/tmp/pdf-test/texto-normal.pdf');
const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
const page = doc.getPage(0);

// 1. ¿Qué entrega getPageContentRaw (la ruta del parser manual)?
const raw = mod.getPageContentRaw(page);
console.log('--- content raw (primeros 400 chars) ---');
console.log(JSON.stringify(raw.slice(0, 400)));
console.log('longitud:', raw.length);

// 2. items del parser manual
const items = mod.extractTextItems(page, { widthOfTextAtSize: (s, n) => s.length * n * 0.5 });
console.log('--- items ---');
console.log('cantidad:', items.length);
console.log(items.slice(0, 8).map((i) => JSON.stringify(i.str)).join('\n'));
