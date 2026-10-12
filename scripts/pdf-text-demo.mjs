/**
 * Extrae texto de PDFs usando api/_pdf/text.ts real (transpilado al vuelo).
 * Uso: node scripts/pdf-text-demo.mjs <pdf> [...]
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import ts from 'typescript';

const tsSrc = readFileSync('api/_pdf/text.ts', 'utf8');
const js = ts.transpileModule(tsSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync('scripts/.text-comp.mjs', js);
const mod = await import('./.text-comp.mjs');
unlinkSync('scripts/.text-comp.mjs');

for (const path of process.argv.slice(2)) {
  console.log(`\n===== ${path} =====`);
  try {
    const text = await mod.extractPdfTextPerPage(readFileSync(path));
    // Solo primera página, recortada
    const p1 = text.split('=== PÁGINA 2 ===')[0];
    console.log(p1.length > 1500 ? p1.slice(0, 1500) + '\n…[recortado]' : p1);
  } catch (err) {
    console.log('FALLÓ:', err.message);
  }
}
