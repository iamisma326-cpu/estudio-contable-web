/**
 * Auditoría del .txt PLE contra la especificación oficial de SUNAT.
 *
 * No sustituye al validador oficial (ese necesita Clave SOL), pero comprueba
 * mecánicamente las reglas del anexo que sí se pueden verificar sin presentar
 * nada: número de campos, longitudes, formato del período, la prohibición del
 * '&' en el CUO, el separador y el fin de línea. Es la clase de error que el
 * validador rechaza con un mensaje genérico y que aquí sale con nombre y línea.
 *
 * Las reglas están tomadas del Anexo N.° 1 (14.1 ventas) y Anexo N.° 2
 * (8.1 compras) de la Resolución de Superintendencia N.° 361-2015/SUNAT.
 *
 * Uso: npm run test:ple-validador
 */

import { generarPLE, nombreArchivo, type FormatoPLE } from '../api/_lib/ple.ts';
import type { ComprobanteIngerido } from '../api/_lib/ingesta.ts';

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

/** Campos por formato, según la tabla del anexo. */
const CAMPOS: Record<FormatoPLE, number> = { '14.1': 34, '8.1': 41 };

/**
 * Posiciones obligatorias (índice 0-based) según el anexo.
 *
 * En 14.1: período(1), fecha(4), tipo(6), serie(7), número(8), doc identidad(10),
 *          RUC(11), base(14), IGV(16), total(24), estado(34).
 * En 8.1:  período(1), CUO(2), fecha(4), tipo(6), serie(7), número(9),
 *          doc proveedor(11), RUC(12), razón social(13), base(14), IGV(15),
 *          total(23), moneda(24), estado(41).
 */
const OBLIGATORIOS: Record<FormatoPLE, number[]> = {
  '14.1': [0, 3, 5, 6, 7, 9, 10, 13, 15, 23, 33],
  '8.1': [0, 1, 3, 5, 6, 8, 10, 11, 12, 13, 14, 22, 23, 40],
};

/**
 * Longitudes máximas de los campos de texto, tomadas de la tabla del anexo
 * (índice 0-based).
 */
const LONGITUDES: Record<FormatoPLE, Record<number, number>> = {
  // 2 CUO ≤40, 4 fecha 10, 7 serie ≤20, 8 número ≤20, 9 doc ≤20,
  // 11 RUC ≤15, 12 razón social ≤100, 25 moneda 3.
  '14.1': { 1: 40, 3: 10, 6: 20, 7: 20, 8: 20, 10: 15, 11: 100, 24: 3 },
  // 2 CUO ≤40, 4 fecha 10, 7 serie ≤20, 9 número ≤20, 12 RUC ≤15,
  // 13 razón social ≤100, 24 moneda 3.
  '8.1': { 1: 40, 3: 10, 6: 20, 8: 20, 11: 15, 12: 100, 23: 3 },
};

type Error_ = { linea: number; campo: number; regla: string; valor: string };

/**
 * Revisa un .txt completo y devuelve los incumplimientos.
 *
 * Se escribió como validador independiente de `generarPLE`: si compartiera
 * código con lo que valida, un error de criterio pasaría las dos veces.
 */
function auditar(txt: string, formato: FormatoPLE): Error_[] {
  const errores: Error_[] = [];
  const nCampos = CAMPOS[formato];

  if (!txt.includes('\r\n')) {
    errores.push({ linea: 0, campo: 0, regla: 'falta el fin de línea CRLF', valor: 'LF o ninguno' });
  }

  const lineas = txt.split('\r\n').filter((l) => l.length > 0);
  if (lineas.length === 0) {
    errores.push({ linea: 0, campo: 0, regla: 'el archivo no tiene líneas', valor: '' });
    return errores;
  }

  lineas.forEach((linea, i) => {
    const n = i + 1;

    if (!linea.endsWith('|')) {
      errores.push({ linea: n, campo: 0, regla: 'la línea no termina en |', valor: linea.slice(-12) });
    }

    const campos = linea.split('|');
    // Con el '|' final, el último elemento es cadena vacía.
    if (campos.length - 1 !== nCampos) {
      errores.push({
        linea: n, campo: 0,
        regla: `se esperaban ${nCampos} campos y hay ${campos.length - 1}`,
        valor: String(campos.length - 1),
      });
    }

    for (const idx of OBLIGATORIOS[formato]) {
      const v = campos[idx];
      if (v === undefined || v === '') {
        errores.push({ linea: n, campo: idx + 1, regla: 'campo obligatorio vacío', valor: '' });
      }
    }

    const periodo = campos[0] ?? '';
    if (!/^\d{6}00$/.test(periodo)) {
      errores.push({ linea: n, campo: 1, regla: 'el período debe ser AAAAMM00', valor: periodo });
    } else {
      const mm = Number(periodo.slice(4, 6));
      if (mm < 1 || mm > 12) {
        errores.push({ linea: n, campo: 1, regla: 'mes fuera de 01..12', valor: periodo });
      }
    }

    // Campo 2 (CUO): el anexo prohíbe explícitamente el '&'.
    const cuo = campos[1] ?? '';
    if (formato === '14.1' && cuo.includes('&')) {
      errores.push({ linea: n, campo: 2, regla: 'el CUO no acepta "&"', valor: cuo });
    }

    for (const [idx, max] of Object.entries(LONGITUDES[formato])) {
      const v = campos[Number(idx)];
      if (v && v.length > max) {
        errores.push({
          linea: n, campo: Number(idx) + 1,
          regla: `excede la longitud ${max}`, valor: v.slice(0, 30),
        });
      }
    }

    // Los importes no llevan separador de miles ni símbolos.
    const idxImportes = formato === '14.1'
      ? [13, 15, 17, 18, 23]
      : [13, 14, 19, 22];
    for (const idx of idxImportes) {
      const v = campos[idx];
      if (!v) continue;
      if (v.includes(',')) {
        errores.push({ linea: n, campo: idx + 1, regla: 'importe con coma de miles', valor: v });
      }
      if (!/^-?\d+(\.\d{1,10})?$/.test(v)) {
        errores.push({ linea: n, campo: idx + 1, regla: 'importe no numérico', valor: v });
      }
    }

    // Campos de libre utilización: el anexo pide no incluirlos si no se usan,
    // pero si se incluyen no pueden llevar el separador de campos.
    const libre = formato === '14.1' ? [34, 35] : [41];
    for (const idx of libre) {
      const v = campos[idx];
      if (v && v.includes('|')) {
        errores.push({ linea: n, campo: idx + 1, regla: 'campo libre con | dentro', valor: v });
      }
    }
  });

  return errores;
}

// ---------------------------------------------------------------------------
// Casos de prueba
// ---------------------------------------------------------------------------

function comp(o: Partial<ComprobanteIngerido> = {}): ComprobanteIngerido {
  return {
    tipo: 'factura', operacion: 'venta', serie: 'F001', numero: '1',
    fechaEmision: '2026-11-03', rucEmisor: '20999999999', rucReceptor: '20400000001',
    razonEmisor: 'CLIENTE ANDES SAC', moneda: 'PEN', tipoCambio: null,
    base: 1000, igv: 180, exonerado: 0, total: 1180, afectacion: '10',
    origen: 'xml', confianza: 0.99, estado: 'confirmado',
    hallazgos: [], avisos: [], clave: 'k',
    ...o,
  } as ComprobanteIngerido;
}

const OPC = { periodo: '2026-11' } as const;

console.log('--- El archivo que genera el sistema cumple el anexo ---');
{
  const v = generarPLE([comp()], '14.1', OPC);
  check('14.1 sin incumplimientos', auditar(v.contenido, '14.1').length === 0,
    JSON.stringify(auditar(v.contenido, '14.1')).slice(0, 400));

  const c = generarPLE([comp({ operacion: 'compra', serie: 'F002', numero: '9' })], '8.1', OPC);
  check('8.1 sin incumplimientos', auditar(c.contenido, '8.1').length === 0,
    JSON.stringify(auditar(c.contenido, '8.1')));
}

console.log('\n--- Varios documentos y tipos ---');
{
  const lista = [
    comp({ numero: '1' }),
    comp({ numero: '2', base: 2500, igv: 450, total: 2950 }),
    comp({ tipo: 'nota_credito', numero: '3', base: 100, igv: 18, total: 118 }),
    comp({ tipo: 'boleta', serie: 'B001', numero: '4', base: 50, igv: 9, total: 59 }),
    comp({ moneda: 'USD', tipoCambio: 3.758, numero: '5' }),
    comp({ exonerado: 500, base: 0, igv: 0, total: 500, afectacion: '20', numero: '6' }),
  ];
  const v = generarPLE(lista, '14.1', OPC);
  const e = auditar(v.contenido, '14.1');
  check('mezcla de tipos sin incumplimientos', e.length === 0, JSON.stringify(e).slice(0, 300));
  check('una línea por comprobante', v.lineas.length === 6, String(v.lineas.length));
}

console.log('\n--- El validador detecta lo que debe detectar ---');
{
  // Se comprueba que el auditor no diga "todo bien" por ser permisivo.
  const roto = {
    'campo de menos': `20261100|X|${'|'.repeat(30)}\r\n`,
    'sin CRLF': `20261100|${Array(33).fill('0').join('|')}|\n`,
    'sin barra final': `20261100|${Array(33).fill('0').join('|')}`,
    'periodo malo': `2026-11|${Array(33).fill('0').join('|')}|\r\n`,
  };
  for (const [nombre, txt] of Object.entries(roto)) {
    check(`detecta ${nombre}`, auditar(txt, '14.1').length > 0, 'no detectó nada');
  }
  check('detecta el & en el CUO',
    auditar(`20261100|A&1|${Array(32).fill('0').join('|')}|\r\n`, '14.1').some((e) => /CUO/.test(e.regla)));
  // 34 campos con coma en el 14 (base imponible).
  // 34 campos exactos; la coma va en el 14 (base imponible).
  const conComa = Array(34).fill('0');
  conComa[0] = '20261100'; conComa[1] = 'X'; conComa[3] = '03/11/2026';
  conComa[5] = '01'; conComa[6] = 'F001'; conComa[7] = '1';
  conComa[9] = '1'; conComa[10] = '20400000001'; conComa[11] = 'C';
  conComa[13] = '1,000.00'; conComa[24] = 'PEN'; conComa[33] = '1';
  check('detecta coma de miles',
    auditar(conComa.join('|') + '|\r\n', '14.1').some((e) => /coma/.test(e.regla)),
    JSON.stringify(auditar(conComa.join('|') + '|\r\n', '14.1')).slice(0, 200));
}

console.log('\n--- Nomenclatura del archivo ---');
{
  // 33 posiciones: LE + RUC(11) + AAAA + MM + 00 + libro(6) + 00 + C + moneda + 1
  const n = nombreArchivo('20131312955', '2026-01', '14.1');
  check('longitud de 37 caracteres', n.length === 37, `${n.length} :: ${n}`);
  check('empieza con LE', n.startsWith('LE'));
  check('lleva el RUC', n.includes('20131312955'));
  check('lleva el período', n.includes('202601'));
  check('código de libro de ventas', n.includes('140100'));
  check('extensión en mayúsculas', n.endsWith('.TXT'), n);
  check('libro de compras', nombreArchivo('20131312955', '2026-01', '8.1').includes('080100'));
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
