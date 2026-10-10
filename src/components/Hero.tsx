import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { gsap, useGSAP, SplitText, prefersReducedMotion, BREAKPOINTS } from '../lib/gsap';
import { COUNT, onIntroDone } from '../lib/motion';
import styles from '../styles/Hero.module.css';

/**
 * Cifra que cuenta desde 0 hasta su valor al entrar en pantalla.
 *
 * Con reduced-motion renderiza el número final directamente: el dato es
 * contenido, no decoración, y siempre tiene que ser legible.
 */
function Counter({ to, prefix = '' }: { to: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = prefersReducedMotion();

  useGSAP(
    () => {
      if (reduced || !ref.current) return;
      const proxy = { n: 0 };
      const write = () => {
        if (ref.current) ref.current.textContent = prefix + Math.round(proxy.n).toLocaleString('es-PE');
      };
      gsap.to(proxy, {
        n: to,
        duration: COUNT.duration,
        ease: COUNT.ease,
        onUpdate: write,
        scrollTrigger: { trigger: ref.current, start: COUNT.start, once: true },
      });
      write();
    },
    { dependencies: [to, prefix, reduced], scope: ref }
  );

  return <span ref={ref}>{prefix}{reduced ? to.toLocaleString('es-PE') : 0}</span>;
}

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);

  useGSAP(
    () => {
      // La entrada espera a que el splash se retire (o a su respaldo).
      if (!ready) return;

      const mm = gsap.matchMedia();

      mm.add(
        {
          full: '(min-width: 0px)',
          reduce: BREAKPOINTS.reduceMotion,
        },
        (context) => {
          const { reduce } = context.conditions as { full: boolean; reduce: boolean };
          if (reduce) return;

          const split = new SplitText('.heroTitle', { type: 'words', wordsClass: 'word' });
          // Un fallback por palabras: si el título no se puede trocear,
          // el bloque se anima entero en lugar de romperse.
          const targets: gsap.TweenTarget = split.words.length
            ? (split.words as unknown as HTMLElement[])
            : ['.heroTitle'];

          const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

          tl.from('.heroEyebrow', { opacity: 0, y: 18, duration: 0.6 })
            .from(targets, { opacity: 0, yPercent: 105, duration: 0.75, stagger: 0.055 }, '-=0.35')
            .from('.heroSubtitle', { opacity: 0, y: 22, duration: 0.65 }, '-=0.5')
            .from('.heroCta > *', { opacity: 0, y: 18, duration: 0.55, stagger: 0.08 }, '-=0.45')
            .from('.heroStat', { opacity: 0, y: 20, duration: 0.6, stagger: 0.09 }, '-=0.4')
            .from('.heroStatDivider', { scaleY: 0, duration: 0.5, stagger: 0.09 }, '<0.1');

          // Parallax muy leve del halo: da profundidad sin robar lectura.
          // Sólo si hay sitio para moverlo; en móvil el halo se queda quieto.
          if (window.matchMedia(BREAKPOINTS.isDesktop).matches) {
            gsap.to('.heroGlow', {
              yPercent: 22,
              ease: 'none',
              scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
            });
          }
        }
      );

      return () => mm.revert();
    },
    { dependencies: [ready], scope: root }
  );

  // Suscripción a la señal del splash, montada una sola vez.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setReady(true);
      return;
    }
    const off = onIntroDone(() => setReady(true));
    // Respaldo: si la intro nunca llega (ya se vio en esta sesión),
    // la entrada del Hero ocurre igual.
    const t = window.setTimeout(() => setReady(true), 1900);
    return () => {
      off();
      window.clearTimeout(t);
    };
  }, []);

  return (
    <section className={styles.hero} ref={root}>
      <span className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.inner}>
        <span className={`${styles.eyebrow} heroEyebrow`}>Estudio contable y tributario · Lima, Perú</span>

        <h1 className={`${styles.title} heroTitle`}>
          Tus números en orden,<br />
          tu empresa <em>en calma</em>
        </h1>

        <p className={`${styles.subtitle} heroSubtitle`}>
          Asesoría contable y tributaria especializada: llevamos tu contabilidad,
          cumplimos tus obligaciones ante SUNAT y te explicamos qué significan tus
          números para decidir mejor.
        </p>

        <div className={`${styles.ctaRow} heroCta`}>
          <Link to="/contacto" className="btn btn-primary">
            Agendar diagnóstico gratuito <ArrowRight size={17} />
          </Link>
          <Link to="/servicios" className="btn btn-outline">
            Ver servicios
          </Link>
        </div>

        <dl className={styles.stats}>
          <div className={`${styles.stat} heroStat`}>
            <dt>Más de <Counter to={15} /> años</dt>
            <dd>de experiencia en el Perú</dd>
          </div>
          <span className={`${styles.statDivider} heroStatDivider`} aria-hidden="true" />
          <div className={`${styles.stat} heroStat`}>
            <dt><Counter to={320} prefix="+" /> empresas</dt>
            <dd>asesoradas cada mes</dd>
          </div>
          <span className={`${styles.statDivider} heroStatDivider`} aria-hidden="true" />
          <div className={`${styles.stat} heroStat`}>
            <dt><Counter to={98} /> % puntualidad</dt>
            <dd>en declaraciones SUNAT</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
