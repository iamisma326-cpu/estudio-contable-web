/**
 * Escritor de ZIP mínimo, para armar archivos .xlsx sin dependencias.
 *
 * Un .xlsx es un ZIP con XML dentro. ExcelJS pesa 21 MB y este proyecto vive en
 * una función serverless que ya carga 1.9 MB; así que el ZIP se escribe aquí.
 *
 * Implementado: la parte del formato ZIP que hace falta para un .xlsx de hojas
 * de cálculo — entradas DEFLATE o almacenadas, directorio central y fin del
 * directorio. No se implementa ZIP64, cifrado ni multi-volumen: un libro de
 * contabilidad no llega a 4 GB.
 *
 * Referencia: PKWARE APPNOTE.TXT, sección 4.3 (estructura de archivo).
 */

import { deflateRawSync } from 'node:zlib';

interface Entrada {
  nombre: string;
  datos: Buffer;
  /** CRC-32 ya calculado. */
  crc: number;
  /** Tamaño comprimido. */
  comprimido: Buffer;
}

/** Tabla del CRC-32 (polinomio 0xEDB88320), que ZIP exige en cada entrada. */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32 de un buffer, como lo espera el encabezado local del ZIP. */
export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Arma el ZIP.
 *
 * Los nombres de entrada de un .xlsx van en UTF-8 (por eso la bandera 0x0800),
 * aunque las rutas internas son ASCII; se deja puesta igual porque un descriptor
 * o un nombre de hoja podría traer acentos.
 */
export function crearZip(archivos: Array<{ nombre: string; contenido: string | Buffer }>): Buffer {
  const entradas: Entrada[] = [];

  for (const a of archivos) {
    const datos = Buffer.isBuffer(a.contenido) ? a.contenido : Buffer.from(a.contenido, 'utf8');
    // -1 = esfuerzo por defecto de zlib. Subirlo no merece la pena: el XML de
    // una hoja de cálculo ya es muy redundante y comprime bien.
    const comprimido = deflateRawSync(datos, { level: 9 });
    entradas.push({ nombre: a.nombre, datos, crc: crc32(datos), comprimido });
  }

  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;

  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // firma del encabezado local
    local.writeUInt16LE(20, 4); // versión necesaria: 2.0
    local.writeUInt16LE(0x0800, 6); // bandera: nombres en UTF-8
    local.writeUInt16LE(8, 8); // método: 8 = DEFLATE
    local.writeUInt16LE(0, 10); // hora (no se usa)
    local.writeUInt16LE(0x21, 12); // fecha: 1980-01-01, valor fijo
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.comprimido.length, 18);
    local.writeUInt32LE(e.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28); // campo extra: ninguno

    locales.push(local, nombre, e.comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // firma del directorio central
    central.writeUInt16LE(20, 4); // versión que lo creó
    central.writeUInt16LE(20, 6); // versión necesaria
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.comprimido.length, 20);
    central.writeUInt32LE(e.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentario
    central.writeUInt16LE(0, 34); // disco
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(offset, 42); // dónde empieza su encabezado local

    centrales.push(central, nombre);

    offset += local.length + nombre.length + e.comprimido.length;
  }

  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(offset, 16);
  fin.writeUInt16LE(0, 20);

  return Buffer.concat([...locales, directorio, fin]);
}
