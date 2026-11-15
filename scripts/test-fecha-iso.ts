/**
 * Pruebas de la conversión de fechas de la base.
 *
 * El caso que motivó esto: `String(new Date(...)).slice(0, 10)` devuelve
 * "Thu Oct 15", no "2026-10-15". Ningún test lo veía porque se comparaba contra
 * filas armadas a mano con texto; el objeto Date solo aparece cuando el driver
 * de la base interviene. El síntoma en producción era silencioso: el registro
 * PLE salía con la fecha vacía y SUNAT lo rechaza.
 *
 * Uso: npm run test:fecha-iso
 */

import { fechaISO } from '../api/_lib/fecha-iso.ts';

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}
function eq(desc: string, real: unknown, esperado: unknown) {
  check(desc, real === esperado, `${JSON.stringify(real)} != ${JSON.stringify(esperado)}`);
}

console.log('--- El caso que estaba roto: objeto Date ---');
{
  // Exactamente lo que devuelve el driver para una columna date.
  const d = new Date(2026, 9, 15); // 15 de octubre de 2026, hora local
  eq('Date -> AAAA-MM-DD', fechaISO(d), '2026-10-15');

  // La versión anterior daba esto, y es lo que hay que no volver a producir.
  check('String(Date).slice(0,10) NO se usa',
    String(d).slice(0, 10) !== '2026-10-15',
    'si esto falla, el entorno cambió y el comentario merece revisión');

  // Los bordes de mes y año, donde un despiste de índice se nota.
  eq('1 de enero', fechaISO(new Date(2027, 0, 1)), '2027-01-01');
  eq('31 de diciembre', fechaISO(new Date(2026, 11, 31)), '2026-12-31');
  eq('mes de un dígito se rellena', fechaISO(new Date(2026, 8, 5)), '2026-09-05');
}

console.log('\n--- Texto, que es la otra forma que llega ---');
{
  eq('AAAA-MM-DD tal cual', fechaISO('2026-10-15'), '2026-10-15');
  eq('ISO completo se recorta', fechaISO('2026-10-15T05:00:00.000Z'), '2026-10-15');
  eq('con espacios alrededor', fechaISO('  2026-10-15  '), '2026-10-15');
  // El caso real del driver de Neon: date se devuelve como ISO con hora.
  eq('date de Neon', fechaISO('2026-10-15T05:00:00.000Z'), '2026-10-15');
}

console.log('\n--- Lo que no es una fecha no se inventa ---');
{
  eq('null', fechaISO(null), null);
  eq('undefined', fechaISO(undefined), null);
  eq('texto vacío', fechaISO(''), null);
  eq('texto sin fecha', fechaISO('Thu Oct 15 2026'), null);
  eq('Date inválido', fechaISO(new Date('no es fecha')), null);
  eq('número suelto', fechaISO(20261015), null);
  eq('objeto cualquiera', fechaISO({ anio: 2026 }), null);
}

console.log('\n--- No se corre un día por la zona horaria ---');
{
  // Una fecha a medianoche local, que con toISOString() al oeste de Greenwich
  // se convertiría en el día anterior. El 15 debe seguir siendo 15.
  const medianoche = new Date(2026, 9, 15, 0, 0, 0);
  eq('medianoche local no retrocede', fechaISO(medianoche), '2026-10-15');

  const casiMedianoche = new Date(2026, 9, 15, 23, 59, 59);
  eq('23:59 no adelanta', fechaISO(casiMedianoche), '2026-10-15');
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
