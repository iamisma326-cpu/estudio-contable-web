/**
 * POST /api/pdf-edit
 *
 * Recibe { pdfBase64, instruction, pageHint? } y devuelve un JSON con la lista
 * de operaciones a aplicar al PDF. NO devuelve el PDF binario (eso es
 * /api/pdf-render).
 *
 * Failover:
 *   1) Google AI Studio (gemini-2.5-flash) → LLM principal.
 *   2) Groq (gpt-oss-120b, OpenAI-compat) → fallback si Google 401/429/5xx.
 *
 * Esquema de ops devueltas (todas opcionales según lo que pida el usuario):
 *   { replaces: [{ page: number, find: string, replace: string, cover?: boolean }]
 *     notes: string }            // cover=true: tacha con rect blanco antes
 *
 * Autenticación: requiere cookie admin válida (mismo patrón que /api/admin/*).
 *
 * Límites:
 *   - pdfBase64 hasta ~3 MB de PDF (base64 ~4 MB): Vercel rechaza
 *     bodies >4.5 MB con 413 FUNCTION_PAYLOAD_TOO_LARGE.
 *   - instrucción hasta 4000 chars.
 *   - respuesta cacheable no (cada request es único).
 */

import type { ReqLike, ResLike } from './_admin/auth.js';
import { verifyCookie, readJsonBody } from './_admin/auth.js';
import { extractPdfTextPerPage, extractPdfTextDetailed, extractFormFields } from './_pdf/text.js';
import { PDFDocument } from 'pdf-lib';

const GOOGLE_MODEL = 'gemini-3.8-flash';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 25000;

interface EditRequest {
  pdfBase64?: unknown;
  instruction?: unknown;
  pageHint?: unknown;
  /** Diagnóstico de extracción: no consulta el LLM, devuelve capas/páginas. */
  debug?: unknown;
}

interface ReplaceOp {
  page: number;
  find: string;
  replace: string;
  cover?: boolean;
}

/** Escribir texto nuevo en un espacio vacío, anclado a una etiqueta. */
interface FillOp {
  page: number;
  anchor: string;
  value: string;
  offsetX?: number;
  offsetY?: number;
}

/** Llenar un campo AcroForm real por nombre exacto. */
interface FieldOp {
  name: string;
  value: string;
  type?: 'text' | 'checkbox' | 'dropdown';
}

interface EditResponse {
  replaces: ReplaceOp[];
  fills: FillOp[];
  fields: FieldOp[];
  notes: string;
}

/* ===== Prompt compartido ===== */

const SYSTEM_PROMPT = `Eres un asistente que convierte instrucciones en español sobre un PDF en operaciones de edición. Devuelves SOLO JSON válido con este esquema:

{
  "replaces": [
    { "page": <int desde 1>, "find": <texto EXACTO existente>, "replace": <nuevo texto>, "cover": <bool opcional> }
  ],
  "fills": [
    { "page": <int>, "anchor": <etiqueta EXACTA del PDF que precede al espacio>, "value": <texto a escribir>, "offsetX": <número opcional>, "offsetY": <número opcional> }
  ],
  "fields": [
    { "name": <nombre EXACTO del campo AcroForm>, "value": <valor>, "type": <"text" | "checkbox" | "dropdown"> }
  ],
  "notes": <string breve: qué hiciste o por qué no>
}

TRES modos de operación — elige según lo que pida la instrucción:

1. "replaces" — CAMBIAR texto que YA EXISTE en el PDF. "find" debe ser subcadena EXACTA (mismo caso, tildes, puntuación). "cover": true cuando hay que tapar el texto previo (ej: importe tachado).

2. "fills" — COMPLETAR espacios VACÍOS de un formulario impreso. El PDF tiene etiquetas con espacios en blanco después (ej: "Nombre: ________" o "DNI:"). Usa "anchor" = la etiqueta EXACTA que ya existe en el texto extraído (ej: "Nombre:"), y "value" = lo que el usuario quiere escribir ahí. El sistema escribe el valor justo después de la etiqueta, sobre la misma línea. Solo para texto que NO existe todavía en el PDF.

3. "fields" — LLENAR campos de formulario reales (AcroForm) del PDF. Solo si la lista CAMPOS ACROFORM (abajo) los muestra. "name" debe ser el nombre EXACTO del campo. Para checkbox: value "true"/"false".

REGLAS:
- Puedes combinar varios modos en una misma respuesta.
- "page" es 1-based (la primera página es 1).
- Si la instrucción pide completar espacios y NO ves etiquetas en el texto extraído, NO inventes anchors: devuelve listas vacías y explica en "notes" qué te faltó.
- Si el texto extraído dice "(sin texto extraíble)", el PDF es escaneado (imagen): NO se puede editar con estos modos; explícalo en "notes".
- Si no encuentras algo con certeza, NO lo incluyas y explica en "notes".
- Devuelve SOLO el JSON, sin markdown.`;

function buildUserPrompt(pdfText: string, instruction: string, pageHint?: string, formFields?: Array<{ name: string; type: string; value: string }>): string {
  const truncated = pdfText.length > 18000 ? pdfText.slice(0, 18000) + '\n...[truncado]' : pdfText;
  const fieldsBlock = formFields && formFields.length
    ? `\n=== CAMPOS ACROFORM DEL PDF (usa "fields" con estos nombres EXACTOS) ===\n${formFields.map((f) => `- ${f.name} (${f.type})${f.value ? ` valor actual: "${f.value}"` : ''}`).join('\n')}\n`
    : '';
  return `=== TEXTO EXTRAÍDO DEL PDF ===\n${truncated}\n${fieldsBlock}\n=== INSTRUCCIÓN DEL USUARIO ===\n${instruction}\n${pageHint ? `\n=== PISTA DE PÁGINA ===\n${pageHint}\n` : ''}\nDevuelve SOLO el JSON con el esquema indicado.`;
}

/* ===== Llamadas a proveedores ===== */

async function callGoogle(pdfText: string, instruction: string, pageHint: string | undefined, formFields: Array<{ name: string; type: string; value: string }>): Promise<EditResponse> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('GOOGLE_AI_API_KEY no configurada');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: buildUserPrompt(pdfText, instruction, pageHint, formFields) }],
      },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`google_${res.status}:${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('google_empty_response');
    return parseEditResponse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq(pdfText: string, instruction: string, pageHint: string | undefined, formFields: Array<{ name: string; type: string; value: string }>): Promise<EditResponse> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY no configurada');

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const body = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(pdfText, instruction, pageHint, formFields) },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`groq_${res.status}:${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('groq_empty_response');
    return parseEditResponse(text);
  } finally {
    clearTimeout(timer);
  }
}

function parseEditResponse(raw: string): EditResponse {
  // Acepta JSON puro o envuelto en ```json ... ```.
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid_json_from_llm');
  }
  const obj = parsed as { replaces?: unknown; fills?: unknown; fields?: unknown; notes?: unknown };
  const replacesRaw = Array.isArray(obj.replaces) ? obj.replaces : [];
  const replaces: ReplaceOp[] = [];
  for (const r of replacesRaw) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    if (
      typeof rec.page === 'number' &&
      typeof rec.find === 'string' &&
      typeof rec.replace === 'string'
    ) {
      replaces.push({
        page: Math.max(1, Math.floor(rec.page)),
        find: rec.find,
        replace: rec.replace,
        cover: rec.cover === true,
      });
    }
  }
  const fillsRaw = Array.isArray(obj.fills) ? obj.fills : [];
  const fills: FillOp[] = [];
  for (const f of fillsRaw) {
    if (!f || typeof f !== 'object') continue;
    const rec = f as Record<string, unknown>;
    if (
      typeof rec.page === 'number' &&
      typeof rec.anchor === 'string' &&
      typeof rec.value === 'string' &&
      rec.anchor.trim() && rec.value.trim()
    ) {
      fills.push({
        page: Math.max(1, Math.floor(rec.page)),
        anchor: rec.anchor,
        value: rec.value,
        offsetX: typeof rec.offsetX === 'number' ? rec.offsetX : undefined,
        offsetY: typeof rec.offsetY === 'number' ? rec.offsetY : undefined,
      });
    }
  }
  const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : [];
  const fields: FieldOp[] = [];
  for (const f of fieldsRaw) {
    if (!f || typeof f !== 'object') continue;
    const rec = f as Record<string, unknown>;
    if (
      typeof rec.name === 'string' &&
      typeof rec.value === 'string' &&
      rec.name.trim()
    ) {
      fields.push({
        name: rec.name,
        value: rec.value,
        type: rec.type === 'checkbox' || rec.type === 'dropdown' ? rec.type : 'text',
      });
    }
  }
  const notes = typeof obj.notes === 'string' ? obj.notes : '';
  return { replaces, fills, fields, notes };
}

/* ===== Extracción de texto del PDF (en servidor) ===== */

async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  // Usa el módulo compartido de parseo (api/_pdf/text.ts), que descomprime
  // los content streams con decodePDFRawStream (FlateDecode etc.) y separa
  // el texto por página — el LLM necesita el número de página correcto.
  return extractPdfTextPerPage(pdfBuffer);
}


/* ===== Handler principal ===== */

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
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

  const body = (await readJsonBody(req)) as EditRequest | null;
  const pdfBase64 = typeof body?.pdfBase64 === 'string' ? body.pdfBase64 : '';
  const instruction = typeof body?.instruction === 'string' ? body.instruction : '';
  const pageHint = typeof body?.pageHint === 'string' ? body.pageHint : undefined;

  if (!pdfBase64 || pdfBase64.length < 100) {
    res.status(400).json({ ok: false, error: 'pdf_required' });
    return;
  }
  if (!instruction.trim()) {
    res.status(400).json({ ok: false, error: 'instruction_required' });
    return;
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = Buffer.from(pdfBase64, 'base64');
  } catch {
    res.status(400).json({ ok: false, error: 'invalid_base64' });
    return;
  }
  if (!pdfBuffer.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
    res.status(400).json({ ok: false, error: 'not_a_pdf' });
    return;
  }
  if (pdfBuffer.length > 3 * 1024 * 1024) {
    res.status(413).json({ ok: false, error: 'pdf_too_large' });
    return;
  }

  // Modo diagnóstico: devuelve qué capa extrajo qué página y por qué falló.
  // No consulta el LLM. Para depurar PDFs "escaneados" que no lo son.
  if (body?.debug === true) {
    try {
      const detailed = await extractPdfTextDetailed(pdfBuffer);
      res.status(200).json({
        ok: true,
        provider: 'debug',
        diag: detailed.diag,
        textPreview: detailed.text.slice(0, 1200),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'debug_failed', detail: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  let pdfText = '';
  try {
    pdfText = await extractPdfText(pdfBuffer);
  } catch {
    pdfText = '';
  }

  // Campos AcroForm: si el PDF tiene formulario real, el LLM prefiere
  // llenarlos por nombre (más preciso que escribir texto encima).
  let formFields: Array<{ name: string; type: string; value: string }> = [];
  try {
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    formFields = extractFormFields(doc);
  } catch {
    formFields = [];
  }

  const tries: Array<{ name: string; run: () => Promise<EditResponse> }> = [
    { name: 'google', run: () => callGoogle(pdfText, instruction, pageHint, formFields) },
    { name: 'groq', run: () => callGroq(pdfText, instruction, pageHint, formFields) },
  ];

  let lastErr: string | null = null;
  for (const t of tries) {
    try {
      const result = await t.run();
      res.status(200).json({ ok: true, provider: t.name, ...result });
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      // Continúa al siguiente proveedor solo si es 4xx/5xx o timeout.
    }
  }

  res.status(502).json({
    ok: false,
    error: 'all_providers_failed',
    detail: lastErr,
  });
}