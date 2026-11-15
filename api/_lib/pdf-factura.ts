/**
 * Campos de una factura a partir del TEXTO de un PDF.
 *
 * A diferencia del XML (que tiene un esquema y por tanto es determinista), un
 * PDF no tiene estructura: cada sistema de facturación imprime lo que quiere,
 * donde quiere. Aquí no se adivina la maquetación de cada proveedor; se busca
 * lo que la ley obliga a imprimir y se deja constancia de lo que no se encontró.
 *
 * La regla que gobierna todo el módulo: NUNCA inventar un dato. Un campo que no
 * se encuentra queda en null y genera un aviso. Un dato inventado entraría al
 * libro con apariencia de correcto y se descubriría al declarar, que es el peor
 * momento para descubrirlo.
 *
 * Consecuencia de lo anterior: la confianza baja es lo normal, no un fallo. El
 * comprobante entra en la bandeja para que un humano lo revise (ver ingesta.ts).
 *
 * Ojo con los totales: en el texto de un PDF "Total" suele ser el importe con
 * IGV, pero también aparecen Subtotal, Gravado, Exonerado, Inafecto, Descuento
 * y "Total a pagar". Se distingue por la etiqueta exacta, no por el número más
 * grande, porque en una factura con descuento el mayor no es el pagado.
 */

import type { TipoComprobante } from './comprobante.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CamposFacturaPDF {
  tipo: TipoComprobante | null;
  serie: string | null;
  numero: string | null;
  fechaEmision: string | null;
  rucEmisor: string | null;
  razonSocialEmisor: string | null;
  rucReceptor: string | null;
  moneda: string | null;
  base: number | null;
  igv: number | null;
  exonerado: number | null;
  inafecto: number | null;
  total: number | null;
  /** 0..1 — cuántos campos obligatorios se leyeron con confianza. */
  confianza: number;
  /** Campos obligatorios que no se pudieron leer. */
  faltantes: string[];
  /** Frases encontradas que hacen dudar de la lectura. */
  avisos: string[];
}

/** Campos que un comprobante necesita para poder registrarse. */
const OBLIGATORIOS: Array<keyof CamposFacturaPDF> = [
  'serie',
  'numero',
  'fechaEmision',
  'rucEmisor',
  'total',
];

// ---------------------------------------------------------------------------
// Normalización del texto
// ---------------------------------------------------------------------------

/**
 * Deja el texto plano y comparable: sin acentos, en mayúsculas, espacios
 * colapsados y comas de miles quitadas de los importes.
 *
 * Se quitan los acentos porque los PDF generados por impresoras térmicas los
 * emiten con codificaciones distintas y "EMISIÓN" puede llegar como "EMISIÃ"N".
 *
 * Se quitan también los marcadores de página que añade el extractor de PDF
 * ("=== PÁGINA 1 ===") y los marcadores de página vacía: no aportan nada al
 * contenido y rompen la lectura de la línea siguiente a una etiqueta.
 */
export function normalizar(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/^===\s*P[ÁA]GINA\s+\d+\s*===\s*$/gim, '')
    .replace(/<<EMPTY_\d+>>/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/** Numero desde un texto tipo "1,234.56", "1234.56" o "1.234,56". */
export function importe(bruto: string | null | undefined): number | null {
  if (!bruto) return null;
  let s = bruto.replace(/[^\d.,-]/g, '');
  if (!s) return null;

  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');

  // "1.234,56" (formato es-PE de algunos sistemas): el punto es de miles.
  if (tieneComa && tienePunto && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // "1,234.56": la coma es de miles.
    s = s.replace(/,/g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Fecha ISO (YYYY-MM-DD) desde los formatos que imprimen las facturas. */
export function fechaISO(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const s = bruto.trim();

  // 2026-11-10
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // 10/11/2026, 10-11-2026, 10.11.2026 → día primero (uso peruano).
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mes = m[2].padStart(2, '0');
    return `${m[3]}-${mes}-${d}`;
  }

  // 10 de noviembre de 2026
  const meses: Record<string, string> = {
    ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04', MAYO: '05', JUNIO: '06',
    JULIO: '07', AGOSTO: '08', SEPTIEMBRE: '09', SETIEMBRE: '09', OCTUBRE: '10',
    NOVIEMBRE: '11', DICIEMBRE: '12',
  };
  m = s.match(/^(\d{1,2})\s*(?:DE\s*)?([A-Z]+)\s*(?:DE\s*|DEL\s*)?(\d{4})$/i);
  if (m) {
    const mes = meses[m[2].toUpperCase()];
    if (mes) return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Búsqueda de campos
// ---------------------------------------------------------------------------

/**
 * RUCs del texto, en orden de aparición.
 *
 * Se valida el dígito verificador aquí mismo en vez de en la validación SUNAT:
 * un número de 11 dígitos dentro de un texto libre es más probable que sea un
 * teléfono o una cuenta que un RUC, y descartarlo ahora evita que el validador
 * reciba basura y la reporte como "RUC inválido" cuando el problema es otro.
 *
 * Se importa `rucValido` de forma perezosa para no crear un ciclo con
 * comprobante.ts, que a su vez importa tipos de aquí.
 */
function buscarRUCs(texto: string, validador: (r: string) => boolean): string[] {
  const encontrados = texto.match(/\b[12]\d{10}\b/g) ?? [];
  return encontrados.filter((r) => validador(r));
}

/** Serie-número de un comprobante: F001-123, E001-45, B001-3, FC01-99. */
export function buscarSerieNumero(texto: string): { serie: string; numero: string } | null {
  // La serie empieza por una letra de tipo de documento y le siguen 3 dígitos;
  // el número va tras el guion, sin ceros a la izquierda conservados como texto.
  const m = texto.match(/\b([A-Z][A-Z0-9]{3})-(\d{1,8})\b/);
  if (!m) return null;
  return { serie: m[1], numero: m[2].replace(/^0+(?=\d)/, '') };
}

/** Tipo de comprobante por las palabras que imprime el documento. */
export function buscarTipo(texto: string): TipoComprobante | null {
  if (/\bNOTA\s+DE\s+CREDITO\b/.test(texto)) return 'nota_credito';
  if (/\bNOTA\s+DE\s+DEBITO\b/.test(texto)) return 'nota_debito';
  // "FACTURA ELECTRONICA" es lo habitual; el orden importa porque una boleta
  // puede mencionar "factura" en el pie legal.
  if (/\bFACTURA\b/.test(texto)) return 'factura';
  if (/\bBOLETA\b/.test(texto)) return 'boleta';
  return null;
}

/** Importe que sigue a una etiqueta, en la misma línea. */
const NUMERO = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/;

/**
 * Importe que sigue a una etiqueta, mirando SOLO su misma línea.
 *
 * Recorre todos los matches en vez de quedarse con el primero porque la palabra
 * «TOTAL» aparece varias veces en una factura: como encabezado de la columna de
 * importes, dentro de una fila de detalle y como etiqueta del importe final. El
 * primero no suele ser el bueno.
 *
 * Cada candidato se mira en su propia línea: con un margen libre se cuela la
 * fila siguiente y una etiqueta suelta acaba devolviendo una cantidad.
 */
function importeTrasEtiqueta(texto: string, etiqueta: RegExp): number | null {
  const re = new RegExp(etiqueta.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    // Sin avance garantizado se repetiría el mismo match indefinidamente.
    if (m[0].length === 0) re.lastIndex++;
    const resto = texto.slice(m.index + m[0].length);
    const lineas = resto.split('\n');

    // Se mira la línea de la etiqueta y, si ahí no hay ningún número, la
    // siguiente. Hace falta porque en un PDF maquetado en columnas la etiqueta
    // ("OP. GRAVADAS:") y su importe caen en líneas distintas aunque
    // visualmente estén a la misma altura.
    const mismoRenglon = lineas[0] ?? '';
    const candidato = mismoRenglon.match(NUMERO);
    if (candidato) {
      const valor = importe(candidato[1]);
      if (valor !== null) return valor;
      continue;
    }

    // La línea siguiente solo se acepta si empieza por un importe. Si empieza
    // por texto, es otra etiqueta o una fila de detalle y no se toca: ahí nace
    // el error de tomar la cantidad de un artículo como importe.
    const siguiente = (lineas[1] ?? '').trim();
    const alInicio = siguiente.match(/^(?:S\/|US\$|\$)?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*$/);
    if (alInicio) {
      const valor = importe(alInicio[1]);
      if (valor !== null) return valor;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extracción principal
// ---------------------------------------------------------------------------

/**
 * Lee los campos de una factura desde el texto ya extraído del PDF.
 *
 * `esRucValido` se inyecta para no acoplar este módulo al validador SUNAT.
 *
 * Nunca lanza: un texto que no es una factura devuelve todo en null, confianza
 * 0 y los faltantes enumerados.
 */
export function extraerCampos(
  textoBruto: string,
  esRucValido: (ruc: string) => boolean
): CamposFacturaPDF {
  const texto = normalizar(textoBruto);
  const avisos: string[] = [];

  if (texto.trim().length < 40) {
    return {
      tipo: null, serie: null, numero: null, fechaEmision: null,
      rucEmisor: null, razonSocialEmisor: null, rucReceptor: null, moneda: null,
      base: null, igv: null, exonerado: null, inafecto: null, total: null,
      confianza: 0,
      faltantes: [...OBLIGATORIOS] as string[],
      avisos: ['El PDF no tiene texto seleccionable: puede ser un escaneo.'],
    };
  }

  // --- Serie y número -------------------------------------------------------
  const sn = buscarSerieNumero(texto);
  if (!sn) avisos.push('No se encontró el número de serie y correlativo.');

  // --- Tipo -----------------------------------------------------------------
  const tipo = buscarTipo(texto);
  if (!tipo) avisos.push('No se pudo determinar si es factura, boleta o nota.');
  // Si el tipo no aparece pero la serie sí, la serie lo delata (F/E/B).
  let tipoFinal = tipo;
  if (!tipoFinal && sn) {
    if (sn.serie.startsWith('F')) tipoFinal = 'factura';
    else if (sn.serie.startsWith('B')) tipoFinal = 'boleta';
  }

  // --- Fecha ----------------------------------------------------------------
  let fechaEmision: string | null = null;
  const etiquetaFecha = texto.match(
    /(?:FECHA\s+DE\s+EMISION|FECHA\s+EMISION|EMISION|FECHA\s+DE\s+EMISI[O0]N)[^\d]{0,25}(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})/
  );
  if (etiquetaFecha) fechaEmision = fechaISO(etiquetaFecha[1]);
  if (!fechaEmision) {
    // Sin etiqueta se acepta la primera fecha con forma completa del documento.
    const suelta = texto.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2})\b/);
    if (suelta) fechaEmision = fechaISO(suelta[1]);
  }
  if (!fechaEmision) avisos.push('No se encontró la fecha de emisión.');

  // --- RUCs -----------------------------------------------------------------
  const rucs = buscarRUCs(texto, esRucValido);
  if (rucs.length === 0) avisos.push('No se encontró ningún RUC válido en el documento.');

  // El emisor es el primer RUC del documento en la mayoría de maquetaciones
  // peruanas (el encabezado va antes que el bloque del cliente).
  let rucEmisor = rucs[0] ?? null;
  let rucReceptor = rucs.find((r) => r !== rucEmisor) ?? null;

  // Si el texto distingue "RUC EMISOR" / "RUC ... CLIENTE", manda el texto.
  const bloqueEmisor = texto.match(/(?:RUC\s*(?:DEL\s*)?EMISOR|EMISOR)[^\d]{0,30}(\d{11})/);
  if (bloqueEmisor && esRucValido(bloqueEmisor[1])) rucEmisor = bloqueEmisor[1];
  const bloqueCliente = texto.match(/(?:RUC\s*(?:DEL\s*)?(?:CLIENTE|ADQUIRIENTE|RECEPTOR)|CLIENTE)[^\d]{0,30}(\d{11})/);
  if (bloqueCliente && esRucValido(bloqueCliente[1]) && bloqueCliente[1] !== rucEmisor) {
    rucReceptor = bloqueCliente[1];
  }
  if (rucEmisor && rucReceptor === rucEmisor) rucReceptor = null;

  // --- Razón social del emisor ---------------------------------------------
  let razonSocialEmisor: string | null = null;
  const bloqueRazon = texto.match(
    /(?:RAZON\s*SOCIAL|NOMBRE\s*(?:O\s*)?RAZON\s*SOCIAL)[:\s]*\n?([A-Z0-9.,&' \-()]{4,80})/
  );
  if (bloqueRazon) razonSocialEmisor = bloqueRazon[1].trim();
  if (!razonSocialEmisor) avisos.push('No se encontró la razón social del emisor.');

  // --- Moneda ---------------------------------------------------------------
  let moneda: string | null = null;
  if (/\bUSD\b|\bDOLARES\b|\bUS\$\s*|D[OÓ]LAR(?:ES)?\b/.test(texto)) moneda = 'USD';
  else if (/\bPEN\b|\bSOLES\b|\bS\/\.?/.test(texto)) moneda = 'PEN';
  if (!moneda) {
    moneda = 'PEN';
    avisos.push('No se indicó la moneda: se asume PEN.');
  }

  // --- Importes -------------------------------------------------------------
  // Se busca cada etiqueta por separado. El orden importa: "SUB TOTAL" contiene
  // "TOTAL", así que el total se busca con un patrón que no empiece por SUB.
  const total =
    importeTrasEtiqueta(texto, /(?:IMPORTE[ \t]+)?TOTAL[ \t]*(?:A[ \t]*PAGAR|GENERAL)?[^0-9\n]{0,20}/) ??
    importeTrasEtiqueta(texto, /TOTAL[^0-9\n]{0,20}/);

  const base =
    importeTrasEtiqueta(texto, /(?:OP\.?\s*)?GRAVAD[AO]S?[^\d\n]{0,25}/) ??
    importeTrasEtiqueta(texto, /SUB\s*-?\s*TOTAL[^\d\n]{0,25}/) ??
    importeTrasEtiqueta(texto, /VALOR\s+VENTA[^\d\n]{0,25}/);

  // Se saltan los porcentajes ("I.G.V. (18%)"): el número entre paréntesis es
  // la tasa, no el importe, y era lo primero que aparecía en la línea.
  const igv =
    importeTrasEtiqueta(texto, /I\.?G\.?V\.?[^0-9\n]{0,25}(?:\(?\s*\d{1,2}(?:[.,]\d+)?\s*%\)?[^0-9\n]{0,10})?/) ??
    importeTrasEtiqueta(texto, /I\.?G\.?V\.?[^\n]{0,40}/);
  const exonerado = importeTrasEtiqueta(texto, /EXONERAD[AO]S?[^\d\n]{0,25}/);
  const inafecto = importeTrasEtiqueta(texto, /INAFECT[AO]S?[^\d\n]{0,25}/);

  if (total === null) avisos.push('No se encontró el importe total.');
  if (base === null) avisos.push('No se encontró la base imponible.');

  // Una factura con descuento imprime un total menor que la suma de sus partes:
  // no es error, pero conviene que quien revisa lo sepa.
  if (base !== null && igv !== null && total !== null) {
    const suma = base + igv;
    if (Math.abs(suma - total) > 1) {
      avisos.push(
        `La suma de base e IGV (${suma.toFixed(2)}) no coincide con el total (${total.toFixed(2)}): puede haber descuento, exonerado o redondeo.`
      );
    }
  }

  // --- Confianza ------------------------------------------------------------
  const campos: Partial<CamposFacturaPDF> = {
    serie: sn?.serie ?? null,
    numero: sn?.numero ?? null,
    fechaEmision,
    rucEmisor,
    total,
  };
  const leidos = OBLIGATORIOS.filter((k) => campos[k] !== null && campos[k] !== undefined).length;
  const faltantes = OBLIGATORIOS.filter((k) => campos[k] === null || campos[k] === undefined) as string[];

  return {
    tipo: tipoFinal,
    serie: sn?.serie ?? null,
    numero: sn?.numero ?? null,
    fechaEmision,
    rucEmisor,
    razonSocialEmisor,
    rucReceptor,
    moneda,
    base,
    igv,
    exonerado,
    inafecto,
    total,
    // 0.9 como techo: por bien que se lea, es una lectura de texto libre y
    // siempre conviene una revisión. Sólo el XML llega a 0.99.
    confianza: Math.min(0.9, leidos / OBLIGATORIOS.length),
    faltantes,
    avisos,
  };
}
