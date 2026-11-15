/**
 * Reglas de validación SUNAT para comprobantes electrónicos.
 *
 * Aritmética pura, sin IA y sin red: todo se decide en la app antes de tocar
 * la base. La propuesta lo pone como bloqueante ("un libro de compras con un
 * RUC inventado es un problema legal, no un bug"), así que las reglas duras
 * (ERROR) impiden confirmar y las blandas (AVISO) solo fuerzan revisión humana.
 *
 * Este módulo NO guarda nada ni llama a la BD: valida el objeto y devuelve el
 * veredicto. El que decide qué hacer con él es quien llama (bandeja de revisión
 * o el confirmador).
 *
 * Ver docs/PROPUESTA-AUTOMATIZACION.md §4.
 */

export type Gravedad = 'error' | 'aviso';

export interface Hallazgo {
  /** Código estable para traducir en la UI; no es texto para mostrar. */
  codigo: string;
  gravedad: Gravedad;
  /** Campo del comprobante al que se refiere, cuando aplica. */
  campo?: string;
  /** Explicación en español para el asistente contable. */
  mensaje: string;
}

export type TipoComprobante =
  | 'factura'
  | 'boleta'
  | 'nota_credito'
  | 'nota_debito';

export type Afectacion = '10' | '20' | '30';

/**
 * Lo mínimo para validar. Todo es opcional a propósito: un comprobante recién
 * leído por visión puede tener huecos, y el validador debe poder decir "esto
 * falta" en vez de reventar con un undefined.
 */
export interface ComprobanteAValidar {
  tipo: TipoComprobante;
  serie?: string | null;
  numero?: string | null;
  fechaEmision?: string | null;
  rucEmisor?: string | null;
  rucReceptor?: string | null;
  base?: number | null;
  igv?: number | null;
  exonerado?: number | null;
  total?: number | null;
  afectacion?: Afectacion | string | null;
  retencion?: number | null;
  /** yyyy-mm del período que se está registrando. */
  periodo: string;
}

/** Tasas de IGV por afectación (código 10 admite rebajas en rubros especiales). */
export const IGV_GRAVADO = 0.18;

/** Tolerancia de redondeo para base + IGV = total: 5 céntimos (S/ 0.05). */
export const TOLERANCIA = 0.05;

/**
 * Prefijos de RUC válidos según SUNAT:
 * 10 persona natural, 15 no domiciliado, 17 extranjero/legado, 20 persona jurídica.
 */
const PREFIJOS_RUC = ['10', '15', '17', '20'];

/** Pesos del algoritmo módulo 11 del dígito verificador. */
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Valida un RUC peruano (11 dígitos + dígito verificador).
 *
 * Algoritmo oficial SUNAT: cada uno de los diez primeros dígitos se multiplica
 * por su peso, se suman los productos, y el verificador es 11 menos el resto de
 * dividir entre 11. Si da 10 el dígito es 0; si da 11, es 1 — esas dos
 * excepciones son donde fallan casi todas las implementaciones.
 */
export function rucValido(ruc: string | null | undefined): boolean {
  if (!ruc) return false;
  const limpio = ruc.trim();
  if (!/^\d{11}$/.test(limpio)) return false;
  if (!PREFIJOS_RUC.includes(limpio.slice(0, 2))) return false;

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += Number(limpio[i]) * PESOS_RUC[i];
  }

  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 10) verificador = 0;
  if (verificador === 11) verificador = 1;

  return verificador === Number(limpio[10]);
}

/** Calcula el dígito verificador de los 10 primeros dígitos (para mensajes). */
export function digitoVerificador(diezDigitos: string): number | null {
  if (!/^\d{10}$/.test(diezDigitos)) return null;
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(diezDigitos[i]) * PESOS_RUC[i];
  const resto = suma % 11;
  let v = 11 - resto;
  if (v === 10) v = 0;
  if (v === 11) v = 1;
  return v;
}

/**
 * Serie del comprobante.
 *
 * En electrónica la serie es de 4 caracteres y empieza por la letra del tipo:
 * F factura, B boleta, E (y variantes) para otros documentos. En físico la
 * factura lleva 3 (F001 → F + 001). Se acepta 4 estricto y se avisa si la
 * letra no corresponde al tipo, porque eso infla o desinfla el IGV del libro.
 */
export function serieCoherente(
  tipo: TipoComprobante,
  serie: string | null | undefined
): { ok: boolean; motivo?: string } {
  if (!serie) return { ok: false, motivo: 'Falta la serie.' };
  const s = serie.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(s)) {
    return { ok: false, motivo: `La serie "${serie}" no tiene un formato válido.` };
  }

  const letra = s[0];
  const esperada: Record<TipoComprobante, string[]> = {
    factura: ['F'],
    boleta: ['B'],
    nota_credito: ['F', 'B'], // una NC hereda la letra del documento que corrige
    nota_debito: ['F', 'B'],
  };

  if (!esperada[tipo].includes(letra)) {
    return {
      ok: false,
      motivo: `La serie "${s}" no corresponde a una ${tipo.replace('_', ' ')} (se esperaba ${esperada[tipo].join(' o ')}).`,
    };
  }
  return { ok: true };
}

/** Redondea a céntimos para comparar sin arrastrar errores de coma flotante. */
function centimos(n: number): number {
  return Math.round(n * 100) / 100;
}

/** yyyy-mm de una fecha ISO yyyy-mm-dd, sin interpretar zonas horarias. */
export function periodoDeFecha(fecha: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim());
  if (!m) return null;
  const [, anio, mes] = m;
  const mesNum = Number(mes);
  if (mesNum < 1 || mesNum > 12) return null;
  return `${anio}-${mes}`;
}

/**
 * Aplica las reglas de la propuesta §4.
 *
 * Devuelve TODOS los hallazgos, no el primero: el asistente necesita ver la
 * lista completa para arreglar el comprobante de una vez.
 */
export function validarComprobante(c: ComprobanteAValidar): Hallazgo[] {
  const h: Hallazgo[] = [];
  const esNota = c.tipo === 'nota_credito' || c.tipo === 'nota_debito';

  // --- RUC emisor: la regla dura más importante ---
  if (!c.rucEmisor) {
    h.push({
      codigo: 'ruc_emisor_falta',
      gravedad: 'error',
      campo: 'rucEmisor',
      mensaje: 'No se leyó el RUC del emisor.',
    });
  } else if (!rucValido(c.rucEmisor)) {
    h.push({
      codigo: 'ruc_emisor_invalido',
      gravedad: 'error',
      campo: 'rucEmisor',
      mensaje: `El RUC del emisor "${c.rucEmisor}" no pasa el dígito verificador.`,
    });
  }

  // El receptor es opcional en boletas (consumidor final), pero si viene debe
  // ser válido: un receptor inventado rompe el libro de ventas del cliente.
  if (c.rucReceptor && !rucValido(c.rucReceptor)) {
    h.push({
      codigo: 'ruc_receptor_invalido',
      gravedad: 'error',
      campo: 'rucReceptor',
      mensaje: `El RUC del receptor "${c.rucReceptor}" no pasa el dígito verificador.`,
    });
  }

  // --- Serie coherente con el tipo ---
  const serie = serieCoherente(c.tipo, c.serie);
  if (!serie.ok) {
    h.push({
      codigo: 'serie_incoherente',
      gravedad: 'error',
      campo: 'serie',
      mensaje: serie.motivo ?? 'Serie inválida.',
    });
  }

  if (!c.numero || !/^\d{1,8}$/.test(c.numero.trim())) {
    h.push({
      codigo: 'numero_invalido',
      gravedad: 'error',
      campo: 'numero',
      mensaje: 'Falta el número del comprobante o no es numérico.',
    });
  }

  // --- Importes: base + IGV + exonerado = total ---
  const tieneImportes =
    typeof c.base === 'number' && typeof c.igv === 'number' && typeof c.total === 'number';

  if (!tieneImportes) {
    h.push({
      codigo: 'importes_incompletos',
      gravedad: 'error',
      mensaje: 'Faltan importes (base, IGV o total).',
    });
  } else {
    const base = c.base as number;
    const igv = c.igv as number;
    const total = c.total as number;
    const exonerado = c.exonerado ?? 0;

    const suma = centimos(base + igv + exonerado);
    if (Math.abs(suma - centimos(total)) > TOLERANCIA) {
      h.push({
        codigo: 'importes_no_cuadran',
        gravedad: 'error',
        mensaje: `Base + IGV + exonerado = ${suma.toFixed(2)}, pero el total dice ${centimos(total).toFixed(2)}.`,
      });
    }

    // --- IGV 18% cuando está gravado (aviso, no error: hay tasas especiales) ---
    if (c.afectacion === '10' && base > 0) {
      const esperado = centimos(base * IGV_GRAVADO);
      if (Math.abs(centimos(igv) - esperado) > TOLERANCIA) {
        h.push({
          codigo: 'igv_no_es_18',
          gravedad: 'aviso',
          campo: 'igv',
          mensaje: `El IGV es ${centimos(igv).toFixed(2)} y el 18% de la base sería ${esperado.toFixed(2)}. Puede ser una tasa especial.`,
        });
      }
    }

    // Exonerado con IGV a la vez es contradictorio.
    if (exonerado > 0 && igv > 0 && c.afectacion === '10') {
      h.push({
        codigo: 'gravado_y_exonerado',
        gravedad: 'aviso',
        mensaje: 'El comprobante tiene importe exonerado y afectación gravada: revisar el desglose.',
      });
    }

    // --- Retención/detracción no puede superar el total ---
    if (typeof c.retencion === 'number' && c.retencion > 0) {
      if (centimos(c.retencion) > centimos(total) + TOLERANCIA) {
        h.push({
          codigo: 'retencion_excede_total',
          gravedad: 'error',
          mensaje: `La retención (${centimos(c.retencion).toFixed(2)}) supera el total del comprobante (${centimos(total).toFixed(2)}).`,
        });
      }
    }

    // --- Notas de crédito: signo coherente ---
    if (esNota) {
      if (total === 0) {
        h.push({
          codigo: 'nota_sin_importe',
          gravedad: 'aviso',
          mensaje: 'La nota no tiene importe: revisar si está vinculada a un comprobante.',
        });
      }
      if (c.tipo === 'nota_credito' && total < 0) {
        h.push({
          codigo: 'nota_credito_negativa',
          gravedad: 'aviso',
          mensaje: 'La nota de crédito viene en negativo; se leerá como devolución del IGV.',
        });
      }
    } else if (total < 0) {
      h.push({
        codigo: 'importe_negativo',
        gravedad: 'error',
        mensaje: 'Una factura o boleta no puede tener total negativo.',
      });
    }
  }

  // --- Fecha dentro del período (aviso: el devengado lo decide el contador) ---
  if (!c.fechaEmision) {
    h.push({
      codigo: 'fecha_falta',
      gravedad: 'error',
      campo: 'fechaEmision',
      mensaje: 'Falta la fecha de emisión.',
    });
  } else {
    const periodo = periodoDeFecha(c.fechaEmision);
    if (!periodo) {
      h.push({
        codigo: 'fecha_invalida',
        gravedad: 'error',
        campo: 'fechaEmision',
        mensaje: `La fecha "${c.fechaEmision}" no tiene formato yyyy-mm-dd.`,
      });
    } else if (periodo !== c.periodo) {
      h.push({
        codigo: 'fecha_fuera_periodo',
        gravedad: 'aviso',
        campo: 'fechaEmision',
        mensaje: `La factura es de ${periodo} y se está registrando en ${c.periodo}.`,
      });
    }
  }

  return h;
}

/** Atajo: ¿bloquea la confirmación? */
export function tieneErrores(hallazgos: Hallazgo[]): boolean {
  return hallazgos.some((x) => x.gravedad === 'error');
}

/**
 * Clave única antiduplicado: (cliente, RUC emisor, serie, número).
 * Se normaliza a mayúsculas y sin espacios para que "f001 " y "F001" colisionen.
 */
export function claveDuplicado(
  clienteId: string,
  rucEmisor: string | null | undefined,
  serie: string | null | undefined,
  numero: string | null | undefined
): string | null {
  if (!rucEmisor || !serie || !numero) return null;
  const r = rucEmisor.trim();
  const s = serie.trim().toUpperCase();
  const n = numero.trim().replace(/^0+(?=\d)/, ''); // 0001 y 1 son el mismo
  return `${clienteId}|${r}|${s}|${n}`;
}
