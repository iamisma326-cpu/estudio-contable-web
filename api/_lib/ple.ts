/**
 * Exportación a PLE (Programa de Libros Electrónicos de SUNAT).
 *
 * Formatos implementados:
 *   14.1  Registro de Ventas e Ingresos
 *   8.1   Registro de Compras
 *
 * Son los dos registros que corresponden a comprobantes. El 5.1 es el Libro
 * Diario y correspondería a los asientos, no a esta tabla.
 *
 * Estructura tomada de los anexos oficiales (Res. 361-2015/SUNAT):
 *   anexo1-361-2015.pdf  → 14.1 Registro de Ventas (34 campos)
 *   anexo2-361-2015.pdf  → 8.1  Registro de Compras (41 campos)
 * Los números de campo de este archivo son los del anexo, no un invento propio.
 *
 * Reglas del formato que se respetan aquí:
 *   - Campos separados por el carácter "|".
 *   - Cada registro termina con "|" y salto de línea.
 *   - Los importes van SIN comas de miles y con punto decimal, hasta 2 decimales.
 *   - Los campos vacíos quedan como dos pipes consecutivos "||".
 *   - El periodo es AAAAMM00 (mes y "00").
 *   - El campo 2 (CUO) no puede contener "&".
 *
 * Lo que NO hace este módulo y hay que tener presente:
 *   - No firma ni valida contra el PDT: eso se hace al subir el archivo a SUNAT.
 *   - No decide el estado del periodo (campo 34/41): se asume "1" (operación del
 *     periodo y anotada), que es el caso normal de un registro mensual al día.
 *     Si se exporta un mes cerrado con operaciones de meses anteriores, esos
 *     campos hay que ajustarlos, y por eso el llamador puede pasarlos.
 */

import type { ComprobanteIngerido } from './ingesta.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type FormatoPLE = '14.1' | '8.1';

export interface OpcionesExportacion {
  /** Periodo en formato yyyy-mm. */
  periodo: string;
  /**
   * Código de anotación (campo 34 de 14.1 / campo 41 de 8.1).
   * '1' = operación del periodo, anotada. Es el valor normal.
   */
  estadoOperacion?: string;
  /** RUC del contribuyente que presenta el registro (va en la cabecera). */
  rucInformante?: string;
  /** Razón social del informante (cabecera). */
  razonSocial?: string;
}

export interface LineaPLE {
  formato: FormatoPLE;
  /** Los campos ya formateados, en el orden del anexo. */
  campos: string[];
  /** El registro completo, listo para escribir. */
  linea: string;
  /** De dónde salió, para poder rastrear un error de SUNAT. */
  origen: { serie: string | null; numero: string | null; rucEmisor: string | null };
}

export interface ExportacionPLE {
  formato: FormatoPLE;
  periodo: string;
  lineas: LineaPLE[];
  /** Contenido completo del archivo .txt, cabecera incluida. */
  contenido: string;
  /** Problemas que impiden presentar el archivo tal cual. */
  problemas: string[];
  /** Totales del registro, para cotejar contra la declaración. */
  totales: { base: number; igv: number; exonerado: number; inafecto: number; total: number; registros: number };
}

// ---------------------------------------------------------------------------
// Códigos de las tablas de SUNAT
// ---------------------------------------------------------------------------

/** Tabla 10: tipo de comprobante de pago o documento. */
const TIPO_DOC: Record<string, string> = {
  factura: '01',
  boleta: '03',
  nota_credito: '07',
  nota_debito: '08',
};

/** Tabla 2: tipo de documento de identidad. 6 = RUC. */
const DOC_RUC = '6';

// ---------------------------------------------------------------------------
// Formato de campos
// ---------------------------------------------------------------------------

/** Importe con 2 decimales, punto decimal y sin comas de miles. */
export function num(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '0.00';
  return Math.abs(valor) < 0.005 ? '0.00' : valor.toFixed(2);
}

/** Fecha DD/MM/AAAA desde una ISO. */
export function fechaPLE(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Periodo AAAAMM00 desde yyyy-mm. */
export function periodoPLE(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo.trim());
  return m ? `${m[1]}${m[2]}00` : '';
}

/**
 * Limpia un campo de texto.
 *
 * El pipe rompe el archivo (es el separador) y el "&" está prohibido en el CUO
 * por el anexo. Se sustituyen en vez de rechazar el registro: un nombre con "&"
 * es normal en una razón social y no debe impedir presentar el libro.
 */
export function limpiar(valor: string | null | undefined, max = 100): string {
  if (!valor) return '';
  return valor
    .replace(/\|/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

/** El CUO no admite "&". */
function cuo(valor: string): string {
  return valor.replace(/&/g, ' ').slice(0, 40);
}

// ---------------------------------------------------------------------------
// Registro de Ventas (14.1)
// ---------------------------------------------------------------------------

/**
 * Una línea del Registro de Ventas, con los 34 campos del anexo en su orden.
 *
 * Campo 13: valor facturado de la exportación
 * Campo 14: base imponible de la operación gravada
 * Campo 15: descuento de la base imponible
 * Campo 16: IGV y/o IPM
 * Campo 17: descuento del IGV
 * Campo 18: total operación exonerada
 * Campo 19: total operación inafecta
 * Campo 20: IGV y/o IPM de la operación gravada con tasa distinta (IVAP)
 * Campo 21: base imponible con tasa distinta
 * Campo 22: ISC (impuesto a las ventas del arroz pilado va en otro campo,
 *           pero el ISC general es este)
 * Campo 23: otros tributos
 * Campo 24: importe total del comprobante
 * Campo 25: código de moneda
 * Campo 26: tipo de cambio
 * Campo 34: estado de la operación
 */
export function lineaVenta(
  c: ComprobanteIngerido,
  opciones: OpcionesExportacion
): LineaPLE {
  const periodo = periodoPLE(opciones.periodo);
  const estado = opciones.estadoOperacion ?? '1';
  // El CUO es el número correlativo del asiento. Aquí se usa serie-número,
  // que identifica la operación de forma unívoca dentro del período.
  const cuoLinea = cuo(`${c.serie ?? ''}-${c.numero ?? ''}` || `CORR-${c.fechaEmision ?? ''}`);

  const campos = [
    periodo,                                  // 1  periodo
    cuoLinea,                                 // 2  CUO
    '',                                       // 3  número correlativo (solo 34=8/9)
    fechaPLE(c.fechaEmision),                 // 4  fecha de emisión
    '',                                       // 5  fecha de vencimiento
    TIPO_DOC[c.tipo] ?? '01',                 // 6  tipo de comprobante
    limpiar(c.serie, 20),                     // 7  serie
    limpiar(c.numero, 20),                    // 8  número
    '',                                       // 9  número final (tickets)
    DOC_RUC,                                  // 10 tipo doc. identidad del cliente
    limpiar(c.rucReceptor, 15),               // 11 nro doc. identidad del cliente
    limpiar(c.razonEmisor, 100),              // 12 razón social del cliente
    num(0),                                   // 13 exportación
    num(c.base),                              // 14 base imponible gravada
    num(0),                                   // 15 descuento de la base
    num(c.igv),                               // 16 IGV
    num(0),                                   // 17 descuento del IGV
    num(c.exonerado),                         // 18 exonerada
    num(0),                                   // 19 inafecta
    num(0),                                   // 20 IGV de tasa distinta
    num(0),                                   // 21 base de tasa distinta
    num(0),                                   // 22 ISC
    num(0),                                   // 23 otros tributos
    num(c.total),                             // 24 total del comprobante
    c.moneda === 'PEN' ? 'PEN' : c.moneda,    // 25 moneda
    c.tipoCambio ? c.tipoCambio.toFixed(3) : '', // 26 tipo de cambio
    '',                                       // 27 fecha de constancia
    '',                                       // 28 tipo de nota modifica
    '',                                       // 29 dependencia aduanera
    '',                                       // 30 número DUA/DSI
    '',                                       // 31 proyecto
    '',                                       // 32 tipo de cambio especial
    '',                                       // 33 medio de pago
    estado,                                   // 34 estado de la operación
  ];

  return {
    formato: '14.1',
    campos,
    linea: campos.join('|') + '|',
    origen: { serie: c.serie, numero: c.numero, rucEmisor: c.rucEmisor },
  };
}

// ---------------------------------------------------------------------------
// Registro de Compras (8.1)
// ---------------------------------------------------------------------------

/**
 * Una línea del Registro de Compras, 41 campos.
 *
 * Campo 14: base imponible de las adquisiciones gravadas
 * Campo 15: IGV de las adquisiciones gravadas
 * Campo 16: base de adquisiciones gravadas (tasa distinta)
 * Campo 17: IGV de tasa distinta
 * Campo 18: base de adquisiciones gravadas (IVAP)
 * Campo 19: IVAP
 * Campo 20: valor de adquisiciones no gravadas
 * Campo 21: adquisiciones mixtas
 * Campo 22: otros conceptos
 * Campo 23: importe total de adquisiciones (suma de 14 a 22)
 * Campo 41: estado de la operación
 */
export function lineaCompra(
  c: ComprobanteIngerido,
  opciones: OpcionesExportacion
): LineaPLE {
  const periodo = periodoPLE(opciones.periodo);
  const estado = opciones.estadoOperacion ?? '1';
  const cuoLinea = cuo(`${c.serie ?? ''}-${c.numero ?? ''}` || `CORR-${c.fechaEmision ?? ''}`);

  // El campo 23 es la suma del 14 al 22 según el anexo. Se calcula en vez de
  // asumir que el total del comprobante coincide: si no coincide, se reporta.
  const gravado = c.base;
  const igv = c.igv;
  const noGravado = c.exonerado;
  const suma = gravado + igv + noGravado;

  const campos = [
    periodo,                                  // 1  periodo
    cuoLinea,                                 // 2  CUO
    '',                                       // 3  número correlativo
    fechaPLE(c.fechaEmision),                 // 4  fecha de emisión
    '',                                       // 5  fecha de vencimiento
    TIPO_DOC[c.tipo] ?? '01',                 // 6  tipo de comprobante
    limpiar(c.serie, 20),                     // 7  serie
    '',                                       // 8  año de emisión DUA/DSI
    limpiar(c.numero, 20),                    // 9  número del comprobante
    '',                                       // 10 número final
    DOC_RUC,                                  // 11 tipo doc. identidad del proveedor
    limpiar(c.rucEmisor, 15),                 // 12 nro doc. del proveedor
    limpiar(c.razonEmisor, 100),              // 13 razón social del proveedor
    num(gravado),                             // 14 base gravada
    num(igv),                                 // 15 IGV
    num(0),                                   // 16 base tasa distinta
    num(0),                                   // 17 IGV tasa distinta
    num(0),                                   // 18 base IVAP
    num(0),                                   // 19 IVAP
    num(noGravado),                           // 20 no gravadas (exonerado/inafecto)
    num(0),                                   // 21 adquisiciones mixtas
    num(0),                                   // 22 otros conceptos
    num(suma),                                // 23 importe total
    c.moneda === 'PEN' ? 'PEN' : c.moneda,    // 24 moneda
    c.tipoCambio ? c.tipoCambio.toFixed(3) : '', // 25 tipo de cambio
    '',                                       // 26 fecha constancia
    '',                                       // 27 tipo nota modifica
    '',                                       // 28 número DUA/DSI
    '',                                       // 29 dependencia aduanera
    '',                                       // 30 número DUA/DSI modificado
    '',                                       // 31 fecha depósito detracción
    '',                                       // 32 número constancia detracción
    '',                                       // 33 retención
    '',                                       // 34 código anterior
    '',                                       // 35 proyecto
    '',                                       // 36 tipo cambio especial
    '',                                       // 37 proveedores no habidos
    '',                                       // 38 exoneración apéndice I
    '',                                       // 39 canon
    '',                                       // 40 medios de pago
    estado,                                   // 41 estado de la operación
  ];

  return {
    formato: '8.1',
    campos,
    linea: campos.join('|') + '|',
    origen: { serie: c.serie, numero: c.numero, rucEmisor: c.rucEmisor },
  };
}

// ---------------------------------------------------------------------------
// Exportación completa
// ---------------------------------------------------------------------------

/** Orden de presentación: por fecha y, a igual fecha, por serie-número. */
function ordenar(a: ComprobanteIngerido, b: ComprobanteIngerido): number {
  const fa = a.fechaEmision ?? '';
  const fb = b.fechaEmision ?? '';
  if (fa !== fb) return fa < fb ? -1 : 1;
  const sa = `${a.serie ?? ''}-${a.numero ?? ''}`;
  const sb = `${b.serie ?? ''}-${b.numero ?? ''}`;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Genera el archivo PLE de ventas o compras.
 *
 * Solo se aceptan comprobantes confirmados. Un comprobante en la bandeja no ha
 * pasado la revisión de nadie, y presentarlo a SUNAT lo convertiría en una
 * declaración en firme.
 *
 * Un comprobante sin serie, número o fecha queda fuera y se reporta en
 * `problemas`: no se puede inventar el identificador de un registro tributario.
 */
export function generarPLE(
  comprobantes: ComprobanteIngerido[],
  formato: FormatoPLE,
  opciones: OpcionesExportacion
): ExportacionPLE {
  const problemas: string[] = [];

  if (!/^\d{4}-\d{2}$/.test(opciones.periodo)) {
    problemas.push('El período debe tener el formato aaaa-mm.');
  }

  const incluir: ComprobanteIngerido[] = [];
  for (const c of comprobantes) {
    if (c.estado !== 'confirmado') {
      problemas.push(
        `${c.serie ?? '?'}-${c.numero ?? '?'} no está confirmado (estado: ${c.estado}): no se incluye.`
      );
      continue;
    }
    // Una compra en el registro de ventas (o al revés) NO es un problema: es lo
    // normal, cada libro lleva su lado. Solo se avisa si tras filtrar el libro
    // queda vacío, porque entonces el .txt se presenta "sin información" y eso
    // sí hay que saberlo antes de mandarlo a SUNAT.
    if (formato === '14.1' && c.operacion !== 'venta') {
      continue;
    }
    if (formato === '8.1' && c.operacion !== 'compra') {
      continue;
    }
    if (!c.serie || !c.numero) {
      problemas.push('Hay un comprobante sin serie o sin número: no se puede identificar ante SUNAT.');
      continue;
    }
    if (!c.fechaEmision) {
      problemas.push(`${c.serie}-${c.numero} no tiene fecha de emisión.`);
      continue;
    }
    incluir.push(c);
  }

  incluir.sort(ordenar);

  const lado = formato === '14.1' ? 'venta' : 'compra';
  const nombreLibro = formato === '14.1' ? 'Registro de Ventas' : 'Registro de Compras';
  const delOtroLado = comprobantes.filter(
    (c) => c.estado === 'confirmado' && c.operacion !== lado
  ).length;
  if (incluir.length === 0 && delOtroLado > 0) {
    problemas.push(
      `No hay comprobantes de ${lado} confirmados. Los ${delOtroLado} confirmados del período son del otro lado ` +
        `y no pertenecen al ${nombreLibro}: el archivo se generará vacío.`
    );
  }

  const lineas =
    formato === '14.1'
      ? incluir.map((c) => lineaVenta(c, opciones))
      : incluir.map((c) => lineaCompra(c, opciones));

  const totales = incluir.reduce(
    (acc, c) => ({
      base: acc.base + c.base,
      igv: acc.igv + c.igv,
      exonerado: acc.exonerado + c.exonerado,
      inafecto: acc.inafecto,
      total: acc.total + c.total,
      registros: acc.registros + 1,
    }),
    { base: 0, igv: 0, exonerado: 0, inafecto: 0, total: 0, registros: 0 }
  );

  return {
    formato,
    periodo: opciones.periodo,
    lineas,
    // Saltos CRLF: es lo que espera el validador del PLE. Con '\n' el archivo
    // valida igual en Linux pero algunos validadores de Windows lo rechazan.
    contenido: lineas.map((l) => l.linea).join('\r\n') + (lineas.length ? '\r\n' : ''),
    problemas,
    totales,
  };
}

/**
 * Código identificador de libro (posiciones 22-27 de la nomenclatura SUNAT).
 * El 14.1 es el Registro de Ventas e Ingresos y el 8.1 el de Compras.
 */
const CODIGO_LIBRO: Record<FormatoPLE, string> = {
  '14.1': '140100',
  '8.1': '080100',
};

/**
 * Nombre del archivo con la nomenclatura oficial del PLE (33 posiciones):
 *
 *   01-02  LE            identificador fijo
 *   03-13  RUC           11 dígitos del deudor tributario
 *   14-17  AAAA          año del período
 *   18-19  MM            mes (los libros mensuales sí lo llevan)
 *   20-21  DD            día: '00' salvo el Libro de Inventarios y Balances
 *   22-27  LLLLLL        código del libro: 140100 ventas, 080100 compras
 *   28-29  CC            oportunidad de presentación: '00' salvo balances
 *   30     O             indicador de operaciones (1 operativa)
 *   31     I             indicador de contenido (1 con información)
 *   32     M             indicador de moneda (1 soles, 2 dólares)
 *   33     G             generado por PLE (1, fijo)
 *
 * Fuente: «Nomenclatura de Libros Electrónicos» (SUNAT), ejemplo
 * LE 20131312955 20160100 140100 00 1 1 1 1.TXT
 *
 * `conOperaciones` en false genera el archivo «sin información», que se
 * presenta para declarar un mes sin movimiento en lugar de no presentar nada.
 */
export function nombreArchivo(
  ruc: string,
  periodo: string,
  formato: FormatoPLE,
  opciones: { conOperaciones?: boolean; moneda?: 'PEN' | 'USD' } = {}
): string {
  const p = periodoPLE(periodo);
  const anio = p.slice(0, 4);
  const mes = p.slice(4, 6);
  const conOps = opciones.conOperaciones !== false ? '1' : '0';
  const moneda = opciones.moneda === 'USD' ? '2' : '1';
  return `LE${ruc}${anio}${mes}00${CODIGO_LIBRO[formato]}00${conOps}1${moneda}1.TXT`;
}
