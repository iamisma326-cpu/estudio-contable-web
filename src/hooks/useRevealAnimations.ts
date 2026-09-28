/**
 * Sistema de entrada por scroll, uno solo para toda la página.
 *
 * Antes: cada sección llamaba a useReveal(), que escaneaba el documento
 * entero con su propio IntersectionObserver. Ocho páginas y componentes
 * producían ocho observadores para el mismo trabajo, y el estado inicial
 * vivía en CSS (opacity: 0), así que sin JS el contenido era invisible.
 * ResourcesPage incluso tenía que forzar `reveal visible` a mano en el
 * glosario, porque el observer perdía contra el render de los chunks.
 *
 * Ahora: el estado inicial lo pone GSAP desde JS y los triggers se crean
 * por atributo. Con JS desactivado no hay nada oculto; con reduced-motion
 * no hay nada que anime.
 *
 *   <div data-reveal="up" />                       entrada individual
 *   <div data-reveal-group="clip">                 cascada de los hijos
 *     <article data-reveal />…
 *   </div>
 *
 * data-reveal: fade | up | clip | left | right | scale
 */
import { useEffect } from 'react';
import { gsap, ScrollTrigger, prefersReducedMotion } from '../lib/gsap';
import { REVEAL, CLIP } from '../lib/motion';

type RevealKind = 'fade' | 'up' | 'clip' | 'left' | 'right' | 'scale';

interface RevealPreset {
  from: gsap.TweenVars;
  to: gsap.TweenVars;
  duration: number;
  ease: string;
  stagger: number;
}

const END: gsap.TweenVars = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  clipPath: 'inset(0 0 0% 0)',
  clearProps: 'transform',
};

const PRESETS: Record<RevealKind, RevealPreset> = {
  fade: { from: { opacity: 0 }, to: END, duration: REVEAL.duration, ease: REVEAL.ease, stagger: 0.07 },
  up: { from: { opacity: 0, y: REVEAL.y }, to: END, duration: REVEAL.duration, ease: REVEAL.ease, stagger: REVEAL.stagger },
  clip: { from: { opacity: 0, clipPath: 'inset(0 0 100% 0)' }, to: END, duration: CLIP.duration, ease: CLIP.ease, stagger: CLIP.stagger },
  left: { from: { opacity: 0, x: -32 }, to: END, duration: REVEAL.duration, ease: REVEAL.ease, stagger: 0.08 },
  right: { from: { opacity: 0, x: 32 }, to: END, duration: REVEAL.duration, ease: REVEAL.ease, stagger: 0.08 },
  scale: { from: { opacity: 0, scale: 0.94 }, to: END, duration: REVEAL.duration, ease: REVEAL.ease, stagger: 0.08 },
};

const resolve = (kind: string | undefined): RevealPreset => PRESETS[(kind as RevealKind) ?? 'up'] ?? PRESETS.up;

/**
 * Prepara y dispara las entradas de scroll de todo el subárbol.
 *
 * Se llama UNA vez por página (no por sección) para que el trabajo de
 * medición y los triggers se creen una sola vez por ruta.
 */
export default function useRevealAnimations() {
  useEffect(() => {
    // Sin preferencia de movimiento el contenido ya es visible por CSS:
    // no hay nada que preparar ni que revertir.
    if (prefersReducedMotion()) return;

    const scope = document.querySelector<HTMLElement>('main') ?? document.body;
    const grouped = new Set<HTMLElement>();

    const ctx = gsap.context(() => {
      // 1) Cascadas: un trigger por grupo, stagger entre los hijos.
      scope.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
        const children = Array.from(group.querySelectorAll<HTMLElement>('[data-reveal]'));
        if (children.length === 0) return;

        const preset = resolve(group.dataset.revealGroup);
        children.forEach((c) => grouped.add(c));

        gsap.fromTo(children, preset.from, {
          ...preset.to,
          duration: preset.duration,
          ease: preset.ease,
          stagger: preset.stagger,
          scrollTrigger: {
            trigger: group,
            start: REVEAL.start,
            once: true,
            invalidateOnRefresh: true,
          },
        });
      });

      // 2) Entradas individuales: lo que no pertenece a una cascada.
      scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        if (grouped.has(el)) return;
        const preset = resolve(el.dataset.reveal);

        gsap.fromTo(el, preset.from, {
          ...preset.to,
          duration: preset.duration,
          ease: preset.ease,
          delay: Number(el.dataset.revealDelay) || 0,
          scrollTrigger: {
            trigger: el,
            start: REVEAL.start,
            once: true,
            invalidateOnRefresh: true,
          },
        });
      });
    }, scope);

    // Las fuentes cambian la métrica de las líneas: sin refrescar, los
    // triggers medirían con la tipografía de reserva.
    const refresh = () => ScrollTrigger.refresh();
    if (document.fonts?.ready) document.fonts.ready.then(refresh).catch(() => {});
    const t = window.setTimeout(refresh, 400);

    return () => {
      window.clearTimeout(t);
      ctx.revert();
    };
  }, []);
}
