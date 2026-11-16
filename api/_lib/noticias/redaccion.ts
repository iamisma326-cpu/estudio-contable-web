/**
 * Redacción opcional con IA.
 *
 * El modelo NO decide hechos ni extrae fechas: solo convierte títulos y
 * resúmenes YA verificados en un párrafo de apertura. Si falla, tarda más de
 * 8 s o devuelve algo fuera de rango, se usa la plantilla determinista.
 * La IA nunca es un punto único de fallo.
 */

import { extracto, type Noticia } from './comun.js';

const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 8000;

export async function redactarApertura(noticias: Noticia[]): Promise<string | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key || noticias.length < 2) return null;

  const entrada = noticias
    .map((n) => `- ${n.titulo}: ${extracto(n, 180)}`)
    .join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(URL_GROQ, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          {
            role: 'system',
            content:
              'Eres el redactor de un estudio contable peruano. Escribes en español, en un párrafo de 2 o 3 frases, sin cifras, fechas ni URLs que no aparezcan en la entrada. No inventes hechos ni des consejos tributarios concretos.',
          },
          {
            role: 'user',
            content: `Escribe la apertura de un resumen semanal de novedades de SUNAT a partir de estos títulos y resúmenes:\n\n${entrada}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const texto = data.choices?.[0]?.message?.content?.trim();
    if (!texto) return null;

    // Salida rechazada si es desproporcionada: un LLM que se explaya suele
    // estar rellenando con datos que no estaban en la entrada.
    const esperado = Math.max(120, entrada.length / 2);
    if (texto.length > esperado * 2 + 120) return null;

    return texto;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
