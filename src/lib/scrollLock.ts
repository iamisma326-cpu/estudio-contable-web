/**
 * Bloqueo de scroll con contador de referencias.
 *
 * El splash de apertura y el menú móvil necesitan bloquear el scroll, y a
 * veces coexisten. Con `document.body.style.overflow = 'hidden'` cada uno
 * borraba el estado del otro al cerrarse. Aquí el bloqueo es una clase y un
 * contador: el scroll solo se devuelve cuando el último consumidor suelta.
 *
 * Se bloquea `html` (y no solo `body`) porque en iOS es el elemento que
 * efectivamente detiene el Rubber Band.
 */

let holders = 0;

function apply() {
  const root = document.documentElement;
  if (holders > 0) root.classList.add('scroll-locked');
  else root.classList.remove('scroll-locked');
}

/** Bloquea el scroll. Devuelve la función de liberación. */
export function lockScroll(): () => void {
  holders += 1;
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    apply();
  };
}
