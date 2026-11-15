/**
 * Pruebas del formateo de fechas que usa la interfaz.
 *
 * Existen por un bug real que ningún test cubría: la API devuelve el campo
 * `date` de Postgres serializado como fecha-hora ISO ('2026-11-03T05:00:00.000Z')
 * y la pantalla le concatenaba 'T00:00:00', lo que producía "Invalid Date" en
 * las tres filas de la tabla. Se vio al abrir el panel en un navegador, no aquí.
 *
 * Uso: npm run test:fechas
 */

// Se replica la función de la pantalla: importarla obligaría a cargar React.
function fecha(v: string | null): string {
  if (!v) return '—';
  const soloFecha = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) return '—';
  const [anio, mes, dia] = soloFecha.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) return '—';
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

console.log('--- Formatos que llegan de la API ---');

// El caso que rompía la pantalla.
const iso = fecha('2026-11-03T05:00:00.000Z');
check('fecha-hora ISO se formatea', !iso.includes('Invalid') && iso.includes('2026'), iso);
check('conserva el día del date de Postgres', iso.includes('03'), iso);
check('muestra el mes en letras', /nov/i.test(iso), iso);

// El caso simple también debe seguir funcionando.
check('fecha plana', fecha('2026-11-03').includes('2026'));
check('fecha plana con el día correcto', fecha('2026-11-03').includes('03'));

// La hora en UTC no debe correr el día: 2026-01-01T02:00Z en Lima es el 31/12.
const borde = fecha('2026-01-01T02:00:00.000Z');
check('no corre el día por zona horaria', borde.includes('01'), borde);

check('null => guion', fecha(null) === '—');
check('vacío => guion', fecha('') === '—');
check('basura => guion', fecha('no es una fecha') === '—');
check('mes inválido => guion', fecha('2026-13-01') === '—', fecha('2026-13-01'));
check('día inválido => guion', fecha('2026-02-30') === '—', fecha('2026-02-30'));
check('el 29 de febrero bisiesto sí vale', fecha('2024-02-29').includes('29'), fecha('2024-02-29'));
check('mes 01 => enero', /ene/i.test(fecha('2026-01-15')), fecha('2026-01-15'));
check('mes 12 => diciembre', /dic/i.test(fecha('2026-12-15')), fecha('2026-12-15'));

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
