/**
 * Utilidades compartidas por el módulo de noticias.
 *
 * Regla del plan que se refleja aquí: el hash se calcula sobre el contenido
 * YA NORMALIZADO, nunca sobre el HTML crudo. La página de SUNAT lleva fecha
 * de actualización y contadores; hashear eso dispararía un borrador diario.
 */

import { createHash } from 'node:crypto';
import { todayInLima } from '../../../src/data/sunatSchedule.js';

export type Canal = 'email' | 'whatsapp';
export type EstadoNoticia = 'borrador' | 'publicada' | 'archivada';

export interface Noticia {
  id: string;
  slug: string;
  titulo: string;
  resumen: string;
  cuerpo: string;
  categoria: string;
  fuente: string;
  fuente_url: string | null;
  estado: EstadoNoticia;
  publicada_en: string | null;
  created_at: string;
  updated_at: string;
}

/** "Cronograma SUNAT 2027" → "cronograma-sunat-2027" */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/**
 * Normaliza un teléfono a E.164 sin signos.
 *
 * Acepta lo que la gente escribe de verdad: "+51 987 654 321",
 * "987654321", "51987654321". Si son 9 dígitos y empieza por 9 se asume
 * Perú; fuera de eso se exige un número internacional de 10 a 15 dígitos.
 * Devuelve null si no hay forma razonable de interpretarlo.
 */
export function normalizarWhatsapp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 9 && digits.startsWith('9')) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith('51')) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

/** JSON con claves ordenadas: dos objetos iguales producen el mismo string. */
function jsonEstable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jsonEstable).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jsonEstable(obj[k])}`).join(',')}}`;
}

/** SHA-256 del contenido normalizado. */
export function hashNormalizado(value: unknown): string {
  return createHash('sha256').update(jsonEstable(value)).digest('hex');
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID v1-v5 válido; evita mandar basura a un cast de Postgres y recibir 500. */
export function esUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function esLunesLima(): boolean {
  // getDay() en el Date que devuelve todayInLima(): 1 = lunes.
  return todayInLima().getDay() === 1;
}

/** Fecha larga en español para asuntos y copetes. */
export function fechaLima(value: string | Date): string {
  return new Date(value).toLocaleDateString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Rango de la semana para el asunto del digest. */
export function rangoSemana(noticias: Noticia[]): { desde: string; hasta: string } {
  const fechas = noticias
    .map((n) => (n.publicada_en ? new Date(n.publicada_en) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
  const min = fechas.length ? new Date(Math.min(...fechas.map((d) => d.getTime()))) : new Date();
  const max = fechas.length ? new Date(Math.max(...fechas.map((d) => d.getTime()))) : new Date();
  return { desde: fechaLima(min), hasta: fechaLima(max) };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** URL pública de la app, para enlaces de baja y de "leer más". */
export function appUrl(): string {
  const explicit = process.env.APP_URL || process.env.PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** Texto corto y legible para guardar en `envios.error`. */
export function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

/** Corta el cuerpo de una noticia a un párrafo presentable. */
export function extracto(noticia: Noticia, max = 300): string {
  const texto = (noticia.resumen || noticia.cuerpo || '').replace(/\s+/g, ' ').trim();
  if (texto.length <= max) return texto;
  return `${texto.slice(0, max - 1).trimEnd()}…`;
}
