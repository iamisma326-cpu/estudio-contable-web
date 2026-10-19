/**
 * Simula /api/pdf-edit SIN desplegar: extracción nueva (con fix XObject) +
 * mismo prompt del handler + llamada al proveedor LLM real.
 * Uso: node --env-file=.env scripts/probe-llm-flow.mjs <pdf> <instrucción>
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import ts from 'typescript';

const tsSrc = readFileSync('api/_pdf/text.ts', 'utf8');
const js = ts.transpileModule(tsSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync('scripts/.t3.mjs', js);
const mod = await import('./.t3.mjs');
unlinkSync('scripts/.t3.mjs');

const pdfPath = process.argv[2];
const instruction = process.argv[3] ?? 'Cambiar Cliente: ACME SAC por Cliente: BETA EIRL';

const pdfText = await mod.extractPdfTextPerPage(readFileSync(pdfPath));
console.log('--- texto extraído ---');
console.log(pdfText.slice(0, 500));

const systemPrompt = `Eres un asistente que convierte instrucciones en español sobre un PDF en operaciones de edición. Devuelves SOLO JSON válido con este esquema: {"replaces":[{"page":<int desde 1>,"find":<texto EXACTO existente>,"replace":<nuevo texto>,"cover":<bool opcional>}],"fills":[],"fields":[],"notes":<string>}. "find" debe ser subcadena EXACTA del texto extraído. Devuelve SOLO el JSON.`;
const user = `=== TEXTO EXTRAÍDO DEL PDF ===\n${pdfText}\n=== INSTRUCCIÓN DEL USUARIO ===\n${instruction}\nDevuelve SOLO el JSON.`;

const key = process.env.GOOGLE_AI_API_KEY;
const gkey = process.env.GROQ_API_KEY;
if (!key && !gkey) { console.log('sin claves LLM, saliendo'); process.exit(1); }
const useJson = (txt) => JSON.stringify(txt, null, 2).slice(0, 1200);
let body;
if (key) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      }),
    },
  );
  console.log('--- Google status:', res.status);
  const data = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (txt) { console.log(useJson(txt)); process.exit(0); }
  console.log('Google sin texto:', useJson(data));
  if (!gkey) process.exit(1);
}

// Fallback Groq (mismo patrón de pdf-edit)
const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gkey}` },
  body: JSON.stringify({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: user },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }),
});
console.log('--- Groq status:', res.status);
const data2 = await res.json();
console.log(useJson(data2?.choices?.[0]?.message?.content ?? data2));
const data = await res.json();
console.log(JSON.stringify(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? data, null, 2).slice(0, 1200));
