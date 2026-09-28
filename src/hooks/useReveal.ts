import { useEffect } from 'react';

/**
 * Observa TODOS los elementos .reveal del documento y les añade "visible"
 * cuando entran en viewport.
 *
 * Es global a propósito: las páginas componen varias secciones y todas se
 * montan en el mismo commit, así que un único scan basta. Si el elemento
 * ya es visible al montar (páginas cortas), se marca inmediatamente.
 * Si IntersectionObserver no está disponible, muestra todo directamente.
 */
export default function useReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>('.reveal');
    if (targets.length === 0) return;

    // Fallback: sin IntersectionObserver, mostrar todo
    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach((t) => t.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );

    targets.forEach((t) => {
      // Si ya está en viewport al momento de observar, marcar visible de una vez
      const rect = t.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        t.classList.add('visible');
      } else {
        observer.observe(t);
      }
    });

    return () => observer.disconnect();
  }, []);

  // Ya no devuelve ref: es un efecto global de montaje
  return;
}
