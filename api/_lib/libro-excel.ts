/**
 * Excel de salida del mes: las cinco hojas de la propuesta (§7).
 *
 *   Ventas      orden del Registro 14.1
 *   Compras     orden del Registro 8.1
 *   Diario      libro diario clásico (cuenta, debe, haber)
 *   Resumen     totales, IGV del mes y pago a cuenta de renta
 *   Pendientes  lo que NO entró al libro, para que no se olvide
 *
 * La hoja de Pendientes es la razón de ser del archivo. Sin ella el Excel miente
 * por omisión: el total cuadra con lo que se procesó, no con lo que el cliente
 * facturó, y nadie nota la diferencia hasta la fiscalización.
 *
 * Las columnas de Ventas y Compras siguen el orden del PLE a propósito, para que
 * el contador reconozca el libro y para poder cotejar cada hoja contra el .txt
 * que se presenta a SUNAT.
 */

import { crearXlsx, type Celda, type Hoja } from './xlsx.js';
import type { ComprobanteIngerido } from './ingesta.js';
import type { ResultadoIGV, PagoACuenta } from './igv-mensual.js';

export interface DatosLibro {
  periodo: string;
  cliente: { ruc: string; razonSocial: string; regimen: string };
  /** Solo confirmados: los que entran al libro. */
  confirmados: ComprobanteIngerido[];
  /** Los que quedaron fuera, con su estado. */
  pendientes: Array<{ comprobante: ComprobanteIngerido; motivo: string }>;
  igv: ResultadoIGV;
  renta: PagoACuenta;
}

/** Fecha ISO a DD/MM/AAAA (el formato que se lee en Perú). */
function fecha(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

const TIPO: Record<string, string> = {
  factura: 'Factura',
  boleta: 'Boleta',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
};

const ESTADO: Record<string, string> = {
  pendiente: 'Pendiente de revisar',
  revisado: 'Revisado, sin confirmar',
  descartado: 'Descartado',
};

/**
 * Columnas comunes de Ventas y Compras.
 *
 * Son las del PLE en su orden: serie y número separados, RUC, razón social,
 * base, IGV, exonerado, total y moneda. Se añaden dos columnas que el PLE no
 * lleva y el contador sí necesita: el estado y el archivo de origen, para saber
 * de dónde salió cada línea si hay que volver a mirarla.
 */
const COLUMNAS_LIBRO = [
  'Fecha', 'Tipo', 'Serie', 'Número', 'RUC', 'Razón social',
  'Base', 'IGV', 'Exonerado', 'Total', 'Moneda', 'Origen',
];

function filaLibro(c: ComprobanteIngerido): Celda[] {
  return [
    fecha(c.fechaEmision),
    TIPO[c.tipo] ?? c.tipo,
    c.serie ?? '',
    c.numero ?? '',
    c.operacion === 'venta' ? (c.rucReceptor ?? '') : (c.rucEmisor ?? ''),
    c.razonEmisor ?? '',
    c.base,
    c.igv,
    c.exonerado,
    c.total,
    c.moneda || 'PEN',
    c.origen === 'xml' ? 'XML' : c.origen === 'pdf_texto' ? 'PDF' : 'Otro',
  ];
}

/** Hoja Ventas (orden del Registro 14.1). */
function hojaVentas(confirmados: ComprobanteIngerido[]): Hoja {
  const ventas = confirmados.filter((c) => c.operacion === 'venta');
  return {
    nombre: 'Ventas',
    encabezado: COLUMNAS_LIBRO,
    filas: ventas.map(filaLibro),
    dinero: [6, 7, 8, 9],
  };
}

/** Hoja Compras (orden del Registro 8.1). */
function hojaCompras(confirmados: ComprobanteIngerido[]): Hoja {
  const compras = confirmados.filter((c) => c.operacion === 'compra');
  return {
    nombre: 'Compras',
    encabezado: COLUMNAS_LIBRO,
    filas: compras.map(filaLibro),
    dinero: [6, 7, 8, 9],
  };
}

/**
 * Hoja Diario: el libro diario clásico.
 *
 * Se arma con la misma función de asientos que usa la base de datos, para que
 * el Excel y lo guardado no puedan discrepar. Una entrada por comprobante, con
 * sus líneas debajo.
 */
function hojaDiario(
  confirmados: ComprobanteIngerido[],
  generar: (c: ComprobanteIngerido) => Array<{ cuenta: string; nombre: string; debe: number; haber: number }> | null
): Hoja {
  const filas: Celda[][] = [];
  let n = 1;

  for (const c of confirmados) {
    const lineas = generar(c);
    if (!lineas) continue;
    const glosa = `${TIPO[c.tipo] ?? c.tipo} ${c.serie ?? ''}-${c.numero ?? ''} ${c.razonEmisor ?? ''}`.trim();
    for (const l of lineas) {
      filas.push([
        n,
        fecha(c.fechaEmision),
        glosa,
        l.cuenta,
        l.nombre,
        l.debe || null,
        l.haber || null,
      ]);
    }
    n++;
  }

  return {
    nombre: 'Diario',
    encabezado: ['N°', 'Fecha', 'Glosa', 'Cuenta', 'Nombre de cuenta', 'Debe', 'Haber'],
    filas,
    dinero: [5, 6],
  };
}

/** Hoja Resumen: los números de la declaración, con su resta visible. */
function hojaResumen(d: DatosLibro): Hoja {
  const r = d.igv;
  const filas: Celda[][] = [
    ['Cliente', d.cliente.razonSocial],
    ['RUC', d.cliente.ruc],
    ['Régimen', d.cliente.regimen],
    ['Período', d.periodo],
    [],
    ['IGV VENTAS'],
    ['Base imponible gravada', r.ventas.baseGravada],
    ['IGV', r.ventas.igv],
    ['Operaciones exoneradas', r.ventas.exonerado],
    ['Operaciones inafectas', r.ventas.inafecto],
    ['Total facturado', r.ventas.total],
    ['Comprobantes de venta', r.ventas.cantidad],
    [],
    ['IGV COMPRAS'],
    ['Base imponible gravada', r.compras.baseGravada],
    ['IGV (crédito fiscal)', r.compras.igv],
    ['Operaciones exoneradas', r.compras.exonerado],
    ['Total comprobantes', r.compras.total],
    ['Comprobantes de compra', r.compras.cantidad],
    [],
    ['LIQUIDACIÓN DEL MES'],
    ['IGV de ventas', r.ventas.igv],
    ['(−) Crédito fiscal de compras', -r.compras.igv],
    ['(−) Saldo a favor del mes anterior', -r.saldoAnterior],
    ['Resultado del IGV', r.resultadoIGV],
    ['IGV a pagar', r.igvAPagar],
    ['Saldo a favor para el mes siguiente', r.saldoAFavor],
    [],
    ['PAGO A CUENTA DE RENTA'],
    ['Ingresos netos del mes (sin IGV)', d.renta.ingresosNetos],
    ['Tasa aplicada', d.renta.tasa],
    ['Criterio', d.renta.criterio === 'coeficiente' ? 'Coeficiente (mayor)' : 'Tasa del régimen'],
    ['Pago a cuenta', d.renta.monto],
    [],
    ['TOTAL A PAGAR (IGV + Renta)', r.igvAPagar + d.renta.monto],
  ];

  // Los porcentajes se escriben como número para que la celda no sea texto.
  const iTasa = filas.findIndex((f) => f[0] === 'Tasa aplicada');
  if (iTasa >= 0) filas[iTasa][1] = Number(filas[iTasa][1]);

  return {
    nombre: 'Resumen',
    encabezado: ['Concepto', 'Importe'],
    filas,
    // Todas las celdas de la columna B son importes salvo los identificadores
    // de arriba, pero formatear un texto como moneda no rompe nada.
    dinero: [1],
    anchos: [42, 20],
  };
}

/**
 * Hoja Pendientes: lo que no entró al libro.
 *
 * Va con su motivo, no solo con el estado: "revisado, sin confirmar" no le dice
 * nada a quien cierra el mes sobre por qué falta esa factura.
 */
function hojaPendientes(d: DatosLibro): Hoja {
  return {
    nombre: 'Pendientes',
    encabezado: ['Fecha', 'Tipo', 'Serie', 'Número', 'RUC', 'Razón social', 'Total', 'Estado', 'Motivo'],
    filas: d.pendientes.map(({ comprobante: c, motivo }) => [
      fecha(c.fechaEmision),
      TIPO[c.tipo] ?? c.tipo,
      c.serie ?? '',
      c.numero ?? '',
      c.operacion === 'venta' ? (c.rucReceptor ?? '') : (c.rucEmisor ?? ''),
      c.razonEmisor ?? '',
      c.total,
      ESTADO[c.estado] ?? c.estado,
      motivo,
    ]),
    dinero: [6],
  };
}

/**
 * Genera el libro completo.
 *
 * `generarAsiento` se pasa desde fuera en vez de importar el módulo de asientos
 * aquí: el generador recibe el comprobante ya normalizado y devuelve sus líneas,
 * y así este archivo no depende de cómo se deciden las cuentas.
 */
export function crearLibroMensual(
  datos: DatosLibro,
  generarAsiento: (c: ComprobanteIngerido) => Array<{ cuenta: string; nombre: string; debe: number; haber: number }> | null
): Buffer {
  return crearXlsx([
    hojaVentas(datos.confirmados),
    hojaCompras(datos.confirmados),
    hojaDiario(datos.confirmados, generarAsiento),
    hojaResumen(datos),
    hojaPendientes(datos),
  ]);
}

/** Nombre del archivo: libro-{RUC}-{AAAA-MM}.xlsx */
export function nombreLibro(ruc: string, periodo: string): string {
  return `libro-${ruc}-${periodo}.xlsx`;
}
