import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap';

interface SuccessMomentOptions {
  /** Valor de `sent`: cuando pasa a true, se juega la entrada. */
  active: boolean;
}

/**
 * Micro-momento del estado de éxito del formulario.
 *
 * Se queda en 0,5 s: es la confirmación de que su mensaje salió, no un
 * espectáculo. Con reduced-motion los elementos aparecen en su estado final.
 */
export default function useSuccessMoment({ active }: SuccessMomentOptions) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!active || prefersReducedMotion()) return;
      const el = root.current;
      if (!el) return;

      const tl = gsap.timeline();
      tl.fromTo('[data-success="mark"]', { scale: 0.6, opacity: 0 }, {
        scale: 1,
        opacity: 1,
        duration: 0.4,
        ease: 'back.out(2)',
      })
        .fromTo(
          '[data-success="line"], .success p, .success ol, .success .btn, .success .backLink',
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'power3.out' },
          '-=0.15'
        );
    },
    { dependencies: [active], scope: root }
  );

  return root;
}
