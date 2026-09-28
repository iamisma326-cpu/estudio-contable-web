import { useRef, useState, useCallback, useEffect } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Quote, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap';
import styles from '../styles/Testimonials.module.css';

const testimonials = [
  {
    quote: 'Llegamos con tres años de declaraciones atrasadas y una carta de SUNAT que no entendíamos. En dos meses todo estaba regularizado y hoy pagamos menos impuestos que antes.',
    name: 'Rocío Quispe Mamani',
    role: 'Gerente general, Distribuidora Andina E.I.R.L.',
  },
  {
    quote: 'Lo que más valoro es la explicación: cada mes entiendo de dónde sale cada cifra. Dejamos el RER y pasamos al RMT ahorrando más de S/ 14,000 al año.',
    name: 'Carlos Mendoza Ríos',
    role: 'Fundador, CM Servicios Industriales S.A.C.',
  },
  {
    quote: 'Llevan nuestra planilla de 22 trabajadores sin un solo error en dos años. El equipo responde el mismo día, incluso en fechas de cierre.',
    name: 'Ana Lucía Fernández',
    role: 'Directora de RR. HH., Clínica Dental Sonrisa E.I.R.L.',
  },
  {
    quote: 'Nos constituyeron la empresa, consiguieron el RUC y hoy llevan toda la contabilidad. Como extranjeros invirtiendo en Perú, necesitábamos exactamente esta guía.',
    name: 'Martín Torres',
    role: 'Socio, Andes Coffee Trading S.A.C.',
  },
];

/**
 * Testimonios en dos formatos según el dispositivo, no uno responsive.
 *
 *  · Escritorio: cinta ligada al scroll (`scrub`) con la fila duplicada, que
 *    es la forma de prueba social que la gente reconoce de inmediato.
 *  · Táctil y con reduced-motion: carrusel de una tarjeta con arrastre real
 *    de dedo. El scroll no debe robarse el gesto horizontal, y un autoplay
 *    sobre el texto de un cliente es una falta de respeto.
 */
export default function Testimonials() {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'marquee' | 'carousel'>('carousel');
  const reduced = prefersReducedMotion();

  const go = useCallback((dir: 1 | -1) => {
    setIndex((i) => (i + dir + testimonials.length) % testimonials.length);
  }, []);

  /* El formato se decide con matchMedia y no con un listener de resize:
     GSAP revierte por su cuenta lo que no aplica al cambiar de viewport. */
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add('(min-width: 769px)', () => {
        if (prefersReducedMotion()) {
          setMode('carousel');
          return;
        }
        setMode('marquee');
        const el = track.current;
        if (!el) return;
        gsap.to(el, {
          xPercent: -50,
          ease: 'none',
          scrollTrigger: {
            trigger: section.current,
            start: 'top 88%',
            end: 'bottom 60%',
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
      });

      mm.add('(max-width: 768px)', () => setMode('carousel'));

      return () => mm.revert();
    },
    { scope: section }
  );

  /* Posición del carrusel. Sin reduced-motion, el cambio es instantáneo. */
  useEffect(() => {
    if (mode !== 'carousel' || !track.current) return;
    gsap.to(track.current, {
      xPercent: -100 * index,
      duration: reduced ? 0 : 0.5,
      ease: 'power3.out',
      overwrite: true,
    });
  }, [index, mode, reduced]);

  /* Arrastre horizontal: solo en modo carrusel. */
  const drag = useRef<{ x: number; active: boolean }>({ x: 0, active: false });
  const onPointerDown = (e: ReactPointerEvent) => {
    if (mode !== 'carousel') return;
    drag.current = { x: e.clientX, active: true };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag.current.active) return;
    const delta = e.clientX - drag.current.x;
    drag.current.active = false;
    if (Math.abs(delta) < 40) return;
    go(delta < 0 ? 1 : -1);
  };

  const slides = mode === 'marquee' ? [...testimonials, ...testimonials] : testimonials;

  return (
    <section className={styles.section} ref={section}>
      <div className="container">
        <div className={styles.header} data-reveal="up">
          <span className="eyebrow">Testimonios</span>
          <h2 className="section-title">Lo que dicen nuestros clientes</h2>
        </div>

        <div className={styles.body} data-mode={mode}>
          {mode === 'carousel' && (
            <button className={styles.arrow} onClick={() => go(-1)} aria-label="Testimonio anterior">
              <ChevronLeft size={22} />
            </button>
          )}

          <div
            className={styles.viewport}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          >
            <div className={styles.track} ref={track}>
              {slides.map((t, i) => (
                <figure
                  key={`${t.name}-${i}`}
                  className={styles.slide}
                  aria-hidden={mode === 'marquee' && i >= testimonials.length ? true : undefined}
                >
                  <Quote size={30} className={styles.quoteIcon} />
                  <div className={styles.stars} aria-label="5 de 5 estrellas">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} size={15} className={styles.star} fill="currentColor" />
                    ))}
                  </div>
                  <blockquote className={styles.quote}>“{t.quote}”</blockquote>
                  <figcaption>
                    <strong className={styles.name}>{t.name}</strong>
                    <span className={styles.role}>{t.role}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          {mode === 'carousel' && (
            <button className={styles.arrow} onClick={() => go(1)} aria-label="Siguiente testimonio">
              <ChevronRight size={22} />
            </button>
          )}
        </div>

        {mode === 'carousel' && (
          <div className={styles.dots}>
            {testimonials.map((t, i) => (
              <button
                key={t.name}
                className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`Ir al testimonio ${i + 1}`}
                aria-current={i === index}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
