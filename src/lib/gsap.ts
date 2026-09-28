/**
 * Registro único de GSAP.
 *
 * Todo el sitio importa gsap y sus plugins desde aquí. Un solo punto de
 * registro evita que dos módulos compitan por el mismo plugin y hace que
 * `revert()` de un contexto limpie siempre los mismos objetos.
 *
 * GSAP 3.13+ es 100 % gratuito, incluidos ScrollTrigger y SplitText.
 */
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/**
 * Estado de preferencia de movimiento reducido.
 *
 * Se lee una vez y se cachea:.matchMedia en un listener por consumidor
 * multiplica los listeners sin ganar nada, y todos lee lo mismo.
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Condiciones de breakpoint compartidas.
 *
 * Se pasan a gsap.matchMedia() para que cada animación se registre bajo la
 * condición que la necesita y se revierta sola al cambiar el viewport.
 * Esto es lo que hace que el sitio sea responsive en su movimiento y no
 * solo en su CSS: la animación móvil no es la de escritorio "más corta".
 */
export const BREAKPOINTS = {
  isDesktop: '(min-width: 1025px)',
  isMobile: '(max-width: 1024px)',
  isTouch: '(hover: none) and (pointer: coarse)',
  reduceMotion: '(prefers-reduced-motion: reduce)',
} as const;

export { gsap, useGSAP, ScrollTrigger, SplitText };
export default gsap;
