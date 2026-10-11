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
import { verifyCookie, readJsonBody } from './_admin/auth.js';
import { extractPdfTextPerPage } from './_pdf/text.js';
const GOOGLE_MODEL = 'gemini-3.8-flash';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 25000;
/* ===== Prompt compartido ===== */
const SYSTEM_PROMPT = `Eres un asistente que extrae operaciones de "buscar y reemplazar" desde una instrucción en español sobre un PDF. SOLO devuelves JSON válido con este esquema exacto:

{
  "replaces": [
    { "page": <int desde 1>, "find": <string exacto del PDF>, "replace": <nuevo texto>, "cover": <bool opcional> }
  ],
  "notes": <string breve explicando lo que hiciste o por qué no se pudo>
}

Reglas:
- "find" debe ser una subcadena EXACTA del PDF (mismo caso, tildes, puntuación, saltos de línea como \\n).
- Si no encuentras el texto con certeza, NO lo incluyas y explica en "notes".
- "page" es 1-based.
- "cover": true cuando el reemplazo visualmente requiere tapar texto previo (ej: tachar importe y reescribir encima).
- Si la instrucción es ambigua, devuelve "replaces": [] y explica en "notes".
- Devuelve SOLO el JSON, sin markdown ni explicaciones fuera de él.`;
function buildUserPrompt(pdfText, instruction, pageHint) {
    const truncated = pdfText.length > 18000 ? pdfText.slice(0, 18000) + '\n...[truncado]' : pdfText;
    return `=== TEXTO EXTRAÍDO DEL PDF ===\n${truncated}\n\n=== INSTRUCCIÓN DEL USUARIO ===\n${instruction}\n${pageHint ? `\n=== PISTA DE PÁGINA ===\n${pageHint}\n` : ''}\nDevuelve SOLO el JSON con el esquema indicado.`;
}
/* ===== Llamadas a proveedores ===== */
async function callGoogle(pdfText, instruction, pageHint) {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key)
        throw new Error('GOOGLE_AI_API_KEY no configurada');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const body = {
        contents: [
            {
                role: 'user',
                parts: [{ text: buildUserPrompt(pdfText, instruction, pageHint) }],
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
        if (typeof text !== 'string')
            throw new Error('google_empty_response');
        return parseEditResponse(text);
    }
    finally {
        clearTimeout(timer);
    }
}
async function callGroq(pdfText, instruction, pageHint) {
    const key = process.env.GROQ_API_KEY;
    if (!key)
        throw new Error('GROQ_API_KEY no configurada');
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const body = {
        model: GROQ_MODEL,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(pdfText, instruction, pageHint) },
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
        if (typeof text !== 'string')
            throw new Error('groq_empty_response');
        return parseEditResponse(text);
    }
    finally {
        clearTimeout(timer);
    }
}
function parseEditResponse(raw) {
    // Acepta JSON puro o envuelto en ```json ... ```.
    let text = raw.trim();
    const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fence)
        text = fence[1].trim();
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new Error('invalid_json_from_llm');
    }
    const obj = parsed;
    const replacesRaw = Array.isArray(obj.replaces) ? obj.replaces : [];
    const replaces = [];
    for (const r of replacesRaw) {
        if (!r || typeof r !== 'object')
            continue;
        const rec = r;
        if (typeof rec.page === 'number' &&
            typeof rec.find === 'string' &&
            typeof rec.replace === 'string') {
            replaces.push({
                page: Math.max(1, Math.floor(rec.page)),
                find: rec.find,
                replace: rec.replace,
                cover: rec.cover === true,
            });
        }
    }
    const notes = typeof obj.notes === 'string' ? obj.notes : '';
    return { replaces, notes };
}
/* ===== Extracción de texto del PDF (en servidor) ===== */
async function extractPdfText(pdfBuffer) {
    // Usa el módulo compartido de parseo (api/_pdf/text.ts), que descomprime
    // los content streams con decodePDFRawStream (FlateDecode etc.) y separa
    // el texto por página — el LLM necesita el número de página correcto.
    return extractPdfTextPerPage(pdfBuffer);
}
/* ===== Handler principal ===== */
export default async function handler(req, res) {
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
    const body = (await readJsonBody(req));
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
    let pdfBuffer;
    try {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
    }
    catch {
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
    let pdfText = '';
    try {
        pdfText = await extractPdfText(pdfBuffer);
    }
    catch {
        pdfText = '';
    }
    const tries = [
        { name: 'google', run: () => callGoogle(pdfText, instruction, pageHint) },
        { name: 'groq', run: () => callGroq(pdfText, instruction, pageHint) },
    ];
    let lastErr = null;
    for (const t of tries) {
        try {
            const result = await t.run();
            res.status(200).json({ ok: true, provider: t.name, ...result });
            return;
        }
        catch (err) {
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
//# sourceMappingURL=pdf-edit.js.map