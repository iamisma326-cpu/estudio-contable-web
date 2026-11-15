/**
 * Persistencia de comprobantes y asientos.
 *
 * Cada función recibe la conexión (`query`/`queryOne` de api/_db) en vez de
 * importarla: así el módulo se prueba sin servidor y sin base real, y no hay
 * dos formas distintas de conectarse.
 *
 * AtOmIcIdAd: el driver HTTP de Neon no mantiene sesión entre consultas, así
 * que no se usa BEGIN/COMMIT. La operación pesada (comprobante + asiento +
 * líneas) va en UNA sola sentencia con CTEs encadenados. Si algo falla, no se
 * escribe nada de nada, que es justo lo que da la transacción.
 *
 * Ver docs/PROPUESTA-AUTOMATIZACION.md §10.
 */

/**
 * Forma mínima de un comprobante ingerido. Se declara aquí en vez de importar
 * de src/lib/ingesta.ts para que la API no dependa del árbol del frontend: son
 * imports de tipo (se borran al compilar), pero atar la API a src/ hace que un
 * cambio de estructura en la UI rompa el despliegue sin motivo.
 */
export interface ComprobanteIngerido {
  tipo: string;
  operacion: 'venta' | 'compra';
  serie: string | null;
  numero: string | null;
  fechaEmision: string | null;
  rucEmisor: string | null;
  rucReceptor: string | null;
  razonEmisor: string | null;
  /** Razón social de la contraparte: cliente en venta, proveedor en compra. */
  razonReceptor?: string | null;
  moneda: string;
  tipoCambio: number | null;
  base: number;
  igv: number;
  exonerado: number;
  total: number;
  afectacion: string | null;
  origen: string;
  confianza: number;
  estado: string;
}

/** Línea de asiento ya calculada (la produce src/lib/asientos.ts). */
export interface AsientoGenerado {
  fecha: string;
  glosa: string;
  lineas: Array<{
    cuenta: string;
    cuentaNombre: string;
    debe: number;
    haber: number;
    detalle?: string;
  }>;
  totalDebe: number;
  totalHaber: number;
}

export interface Consultas {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
  queryOne: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T | null>;
}

/** Fila de comprobante tal como sale de la base. */
export interface ComprobanteFila {
  id: string;
  cliente_id: string;
  periodo_id: string;
  tipo: string;
  operacion: string;
  serie: string | null;
  numero: string | null;
  fecha_emision: string | null;
  ruc_emisor: string | null;
  razon_emisor: string | null;
  razon_receptor: string | null;
  moneda: string;
  tipo_cambio: string | number | null;
  base: string | number | null;
  igv: string | number | null;
  exonerado: string | number | null;
  total: string | number | null;
  afectacion: string | null;
  origen: string;
  confianza: string | number | null;
  estado: string;
  file_key: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Devuelve el id del período (cliente, año, mes), creándolo si no existe.
 *
 * El período se crea 'abierto'. Cerrar un período es una decisión del contador,
 * no un efecto secundario de subir una factura.
 */
export async function asegurarPeriodo(
  db: Consultas,
  clienteId: string,
  anio: number,
  mes: number
): Promise<string> {
  // DO NOTHING en el conflicto: crear el período no debe alterar uno existente,
  // y la tabla no tiene updated_at justamente porque no se actualiza.
  const fila = await db.queryOne<{ id: string }>(
    `WITH nuevo AS (
       INSERT INTO public.periodos (cliente_id, anio, mes, estado)
       VALUES ($1, $2, $3, 'abierto')
       ON CONFLICT (cliente_id, anio, mes) DO NOTHING
       RETURNING id
     )
     SELECT id FROM nuevo
     UNION ALL
     SELECT id FROM public.periodos
      WHERE cliente_id = $1 AND anio = $2 AND mes = $3
     LIMIT 1`,
    [clienteId, anio, mes]
  );
  if (!fila) throw new Error('No se pudo crear ni obtener el período.');
  return fila.id;
}

/**
 * ¿Ya existe este comprobante? Se consulta por la misma clave única de la
 * tabla, para que la app y la base no puedan discrepar.
 */
export async function existeComprobante(
  db: Consultas,
  clienteId: string,
  rucEmisor: string | null,
  serie: string | null,
  numero: string | null
): Promise<boolean> {
  if (!rucEmisor || !serie || !numero) return false;
  const fila = await db.queryOne<{ existe: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM public.comprobantes
        WHERE cliente_id = $1 AND ruc_emisor = $2 AND serie = $3 AND numero = $4
     ) AS existe`,
    [clienteId, rucEmisor, serie.trim().toUpperCase(), numero]
  );
  return fila?.existe === true;
}

/**
 * Guarda un comprobante ingerido.
 *
 * Si viene `asiento`, se guarda TODO en una sola sentencia: comprobante,
 * cabecera del asiento y sus líneas. Un comprobante sin su asiento, o un
 * asiento sin líneas, dejaría los libros inconsistentes.
 */
export async function guardarComprobante(
  db: Consultas,
  clienteId: string,
  periodoId: string,
  comp: ComprobanteIngerido,
  asiento?: AsientoGenerado | null
): Promise<{ comprobanteId: string; asientoId: string | null }> {
  if (asiento) {
    // Verificación previa: nunca se escribe un asiento descuadrado.
    const debe = asiento.lineas.reduce((s, l) => s + l.debe, 0);
    const haber = asiento.lineas.reduce((s, l) => s + l.haber, 0);
    if (Math.round(debe * 100) !== Math.round(haber * 100)) {
      throw new Error(`Se intentó guardar un asiento descuadrado (${debe} ≠ ${haber}).`);
    }
  }

  if (!asiento) {
    const fila = await db.queryOne<{ id: string }>(
      `INSERT INTO public.comprobantes (
         cliente_id, periodo_id, tipo, operacion, serie, numero, fecha_emision,
         ruc_emisor, ruc_receptor, razon_emisor, razon_receptor, moneda, tipo_cambio,
         base, igv, exonerado, total, afectacion, origen, confianza, estado
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [
        clienteId, periodoId, comp.tipo, comp.operacion, comp.serie, comp.numero,
        comp.fechaEmision, comp.rucEmisor, comp.rucReceptor, comp.razonEmisor,
        comp.razonReceptor ?? null,
        comp.moneda, comp.tipoCambio, comp.base, comp.igv, comp.exonerado,
        comp.total, comp.afectacion, comp.origen, comp.confianza, comp.estado,
      ]
    );
    if (!fila) throw new Error('No se pudo guardar el comprobante.');
    return { comprobanteId: fila.id, asientoId: null };
  }

  // Comprobante + asiento + líneas, en una sentencia.
  // $24 es un array JSON de líneas para no parametrizar un número variable.
  // Con razon_receptor los parámetros del comprobante llegan hasta $21.
  const fila = await db.queryOne<{ comprobante_id: string; asiento_id: string }>(
    `WITH nuevo_comprobante AS (
       INSERT INTO public.comprobantes (
         cliente_id, periodo_id, tipo, operacion, serie, numero, fecha_emision,
         ruc_emisor, ruc_receptor, razon_emisor, razon_receptor, moneda, tipo_cambio,
         base, igv, exonerado, total, afectacion, origen, confianza, estado
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id
     ),
     nuevo_asiento AS (
       INSERT INTO public.asientos (comprobante_id, fecha, glosa)
       SELECT id, $22::date, $23 FROM nuevo_comprobante
       RETURNING id, comprobante_id
     ),
     lineas AS (
       INSERT INTO public.asiento_lineas (asiento_id, cuenta, cuenta_nombre, debe, haber)
       SELECT nuevo_asiento.id, l.cuenta, l.cuenta_nombre, l.debe, l.haber
         FROM nuevo_asiento,
              jsonb_to_recordset($24::jsonb)
                AS l(cuenta text, cuenta_nombre text, debe numeric, haber numeric)
       RETURNING 1
     )
     SELECT nuevo_asiento.id AS asiento_id, nuevo_asiento.comprobante_id AS comprobante_id
       FROM nuevo_asiento`,
    [
      clienteId, periodoId, comp.tipo, comp.operacion, comp.serie, comp.numero,
      comp.fechaEmision, comp.rucEmisor, comp.rucReceptor, comp.razonEmisor,
      comp.razonReceptor ?? null,
      comp.moneda, comp.tipoCambio, comp.base, comp.igv, comp.exonerado,
      comp.total, comp.afectacion, comp.origen, comp.confianza, comp.estado,
      asiento.fecha, asiento.glosa,
      JSON.stringify(
        asiento.lineas.map((l) => ({
          cuenta: l.cuenta,
          cuenta_nombre: l.cuentaNombre,
          debe: l.debe,
          haber: l.haber,
        }))
      ),
    ]
  );

  if (!fila) throw new Error('No se pudo guardar el comprobante con su asiento.');
  return { comprobanteId: fila.comprobante_id, asientoId: fila.asiento_id };
}

/** Comprobantes de un período, del más reciente al más viejo. */
export async function listarComprobantes(
  db: Consultas,
  periodoId: string,
  estado?: string
): Promise<ComprobanteFila[]> {
  if (estado) {
    return db.query<ComprobanteFila>(
      `SELECT * FROM public.comprobantes
        WHERE periodo_id = $1 AND estado = $2
        ORDER BY fecha_emision DESC NULLS LAST, created_at DESC`,
      [periodoId, estado]
    );
  }
  return db.query<ComprobanteFila>(
    `SELECT * FROM public.comprobantes
      WHERE periodo_id = $1
      ORDER BY fecha_emision DESC NULLS LAST, created_at DESC`,
    [periodoId]
  );
}

/**
 * Marca un comprobante como confirmado. Es el único punto donde se escribe
 * 'confirmado', y deja rastro de quién lo hizo.
 */
export async function confirmarComprobante(
  db: Consultas,
  comprobanteId: string,
  userId: string
): Promise<boolean> {
  const fila = await db.queryOne<{ id: string }>(
    `UPDATE public.comprobantes
        SET estado = 'confirmado', confirmado_por = $2, confirmado_at = now(), updated_at = now()
      WHERE id = $1 AND estado <> 'descartado'
      RETURNING id`,
    [comprobanteId, userId]
  );
  return fila !== null;
}

/** Descarta un comprobante (no se borra: queda el rastro). */
export async function descartarComprobante(
  db: Consultas,
  comprobanteId: string
): Promise<boolean> {
  const fila = await db.queryOne<{ id: string }>(
    `UPDATE public.comprobantes
        SET estado = 'descartado', updated_at = now()
      WHERE id = $1 AND estado <> 'confirmado'
      RETURNING id`,
    [comprobanteId]
  );
  return fila !== null;
}

/**
 * Totales de un período por operación.
 *
 * Devuelve strings->number convertidos: numeric de Postgres llega como texto
 * por el driver, y sumar strings produce basura.
 */
export async function totalesPeriodo(
  db: Consultas,
  periodoId: string
): Promise<{
  ventas: { base: number; igv: number; total: number; cantidad: number };
  compras: { base: number; igv: number; total: number; cantidad: number };
}> {
  const filas = await db.query<{
    operacion: string;
    base: string;
    igv: string;
    total: string;
    cantidad: string;
  }>(
    `SELECT operacion,
            COALESCE(SUM(base), 0)::text AS base,
            COALESCE(SUM(igv), 0)::text AS igv,
            COALESCE(SUM(total), 0)::text AS total,
            COUNT(*)::text AS cantidad
       FROM public.comprobantes
      WHERE periodo_id = $1 AND estado <> 'descartado'
      GROUP BY operacion`,
    [periodoId]
  );

  const vacio = { base: 0, igv: 0, total: 0, cantidad: 0 };
  const out = { ventas: { ...vacio }, compras: { ...vacio } };
  for (const f of filas) {
    const destino = f.operacion === 'venta' ? out.ventas : out.compras;
    destino.base = Number(f.base);
    destino.igv = Number(f.igv);
    destino.total = Number(f.total);
    destino.cantidad = Number(f.cantidad);
  }
  return out;
}
