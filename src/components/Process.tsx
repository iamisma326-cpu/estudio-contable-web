import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap';
import styles from '../styles/Process.module.css';

const steps = [
  {
    num: '01',
    title: 'Diagnóstico gratuito',
    desc: 'Revisamos tu situación: régimen actual, declaraciones pendientes y estado de planillas. Detectamos riesgos y oportunidades.',
  },
  {
    num: '02',
    title: 'Propuesta a tu medida',
    desc: 'Recibes un plan de trabajo con alcance, responsables y honorarios fijos mensuales, sin costos escondidos.',
  },
  {
    num: '03',
    title: 'Puesta al día',
    desc: 'Regularizamos libros, declaraciones atrasadas y planillas. En 2 a 4 semanas tu empresa queda al día con SUNAT.',
  },
  {
    num: '04',
    title: 'Acompañamiento continuo',
    desc: 'Operamos el mes contable, reportamos resultados y respondemos tus consultas en menos de 24 horas.',
  },
];

export default function Process() {
  const section = useRef<HTMLElement>(null);

  /* La línea de tiempo se dibuja ligada al scroll, en escritorio.
     En móvil la línea es vertical y la dibujan los propios pasos: dos
     mecanismos para lo mismo sería el doble de superficie que mantener. */
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const mm = gsap.matchMedia();
      mm.add('(min-width: 1025px)', () => {
        gsap.fromTo(
          '.rail',
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            transformOrigin: 'left center',
            scrollTrigger: {
              trigger: '.steps',
              start: 'top 78%',
              end: 'bottom 45%',
              scrub: 0.5,
              invalidateOnRefresh: true,
            },
          }
        );
      });
      return () => mm.revert();
    },
    { scope: section }
  );

  return (
    <section className={styles.section} ref={section}>
      <div className="container">
        <div className={styles.header} data-reveal="up">
          <span className="eyebrow">Cómo trabajamos</span>
          <h2 className="section-title">De la incertidumbre al control en 4 pasos</h2>
          <p className="section-subtitle">
            Un proceso probado con más de 320 empresas, claro desde el primer día.
          </p>
        </div>

        <div className={styles.stepsWrap}>
          {/* Riel que se dibuja con el scroll. Va fuera del <ol> porque
              un <ol> sólo admite <li> como hijo directo. */}
          <span className={`${styles.rail} rail`} aria-hidden="true" />
          <ol className={styles.steps}>
            {steps.map((s) => (
              <li key={s.num} className={styles.step} data-reveal="up">
                <span className={styles.num}>{s.num}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepDesc}>{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
