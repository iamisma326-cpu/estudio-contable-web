import { useEffect, useState, useCallback } from 'react';
import { Quote, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import useReveal from '../hooks/useReveal';
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
    name: 'Martín Torresweld',
    role: 'Socio, Andes Coffee Trading S.A.C.',
  },
];

export default function Testimonials() {
  useReveal();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setIndex((i) => (i + 1) % testimonials.length), []);
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + testimonials.length) % testimonials.length),
    []
  );

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 4000);
    return () => clearInterval(id);
  }, [paused, next]);

  return (
    <section
      className={styles.section}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="container">
        <div className={`${styles.header} reveal`}>
          <span className="eyebrow">Testimonios</span>
          <h2 className="section-title">Lo que dicen nuestros clientes</h2>
        </div>

        <div className={`${styles.carousel} reveal`}>
          <button className={styles.arrow} onClick={prev} aria-label="Testimonio anterior">
            <ChevronLeft size={22} />
          </button>

          <div className={styles.viewport}>
            <div className={styles.track} style={{ transform: `translateX(-${index * 100}%)` }}>
              {testimonials.map((t) => (
                <figure key={t.name} className={styles.slide}>
                  <Quote size={34} className={styles.quoteIcon} />
                  <div className={styles.stars} aria-label="5 de 5 estrellas">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={15} className={styles.star} fill="currentColor" />
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

          <button className={styles.arrow} onClick={next} aria-label="Siguiente testimonio">
            <ChevronRight size={22} />
          </button>
        </div>

        <div className={styles.dots}>
          {testimonials.map((_, i) => (
            <button
              key={i}
              className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Ir al testimonio ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
