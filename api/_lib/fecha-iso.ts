/**
 * Conversión de fechas de la base a `AAAA-MM-DD`.
 *
 * El controlador de Neon puede devolver una columna `date` de dos formas: como
 * texto 'AAAA-MM-DD', o como objeto `Date` ya interpretado. Lo segundo rompe el
 * `String(valor).slice(0, 10)` que parecía inocente: `String(new Date(...))`
 * da "Thu Oct 15 2026 …", cuyos diez primeros caracteres son "Thu Oct 15".
 *
 * Ese texto no es una fecha, y quien lo consumía no fallaba de forma visible:
 * el registro PLE simplemente salía con el campo de fecha vacío. Un archivo
 * incompleto que se presenta ante SUNAT es peor que un error.
 *
 * Se normaliza aquí, en un solo lugar, para que los dos endpoints que leen
 * comprobantes no vuelvan a escribir cada uno su propia versión.
 */

/** Fecha como `AAAA-MM-DD`, o null si no se puede determinar. */
export function fechaISO(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;

  // Ya es texto: se acepta 'AAAA-MM-DD' o un ISO completo.
  if (typeof valor === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  // Objeto Date (o algo con getFullYear, típico de un driver).
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // getFullYear/getMonth/getDate usan la hora local, que es la que Neon
    // convierte. Con toISOString() una fecha a medianoche se correría un día
    // al oeste de Greenwich: el 15 se declararía como 14.
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}
