/**
 * Tokens de motion del sitio.
 *
 * Centralizar duraciones y curvas evita que cada sección elija números
 * distintos y que el conjunto se lea como animado por-suertes. Tres
 * intensidades, y nada por encima de dos efectos simultáneos en pantalla.
 */

/** Entrada suave: el reveal por defecto de cualquier bloque. */
export const REVEAL = {
  duration: 0.7,
  y: 26,
  ease: 'power3.out',
  stagger: 0.09,
  start: 'top 84%',
} as const;

/** Entrada de revelado: recorte con clip-path, para tarjetas y bloques con fondo. */
export const CLIP = {
  duration: 0.85,
  ease: 'power4.out',
  stagger: 0.08,
  start: 'top 88%',
} as const;

/**
 * Parallax: desplazamiento ligado al scroll. Sólo escritorio.
 *
 * `amount` es deliberadamente pequeño (30px). Con 70px la tarjeta más baja
 * se salía de su sección y el `overflow: hidden` la recortaba a media frase:
 * un efecto que borra contenido no es un efecto, es un defecto.
 */
export const PARALLAX = {
  amount: 30,
  ease: 'none',
  start: 'top bottom',
  end: 'bottom top',
} as const;

/** Contadores numéricos (Hero, hitos). */
export const COUNT = {
  duration: 1.6,
  ease: 'power2.out',
  start: 'top 78%',
} as const;

/** Splash de apertura. Corto a propósito: bloquea la lectura del contenido. */
export const SPLASH = {
  drawTotal: 0.62,
  holdMs: 260,
  outDuration: 0.45,
  outY: -18,
} as const;

export default { REVEAL, CLIP, PARALLAX, COUNT, SPLASH };

/* ============================================================
   Coordinación con el splash de apertura
   El Hero no debe animar su entrada mientras el logo de apertura
   está encima. En vez de acoplar ambos componentes, el splash
   avisa por evento y el Hero espera la señal (con un respaldo por
   tiempo, para que la entrada ocurra siempre).
   ============================================================ */

export const INTRO_DONE_EVENT = 'sd:intro-done';

/** Avisa a los oyentes de que la intro terminó (o no llegó a existir). */
export function signalIntroDone() {
  window.dispatchEvent(new Event(INTRO_DONE_EVENT));
}

/** Se suscribe a la señal. Devuelve la función para desuscribirse. */
export function onIntroDone(cb: () => void): () => void {
  window.addEventListener(INTRO_DONE_EVENT, cb, { once: true });
  return () => window.removeEventListener(INTRO_DONE_EVENT, cb);
}
