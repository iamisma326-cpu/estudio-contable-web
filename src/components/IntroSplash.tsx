import { useRef, useState } from 'react';
import { gsap, useGSAP, prefersReducedMotion, BREAKPOINTS } from '../lib/gsap';
import { SPLASH, signalIntroDone } from '../lib/motion';
import { lockScroll } from '../lib/scrollLock';
import LogoMark from './icons/LogoMark';
import styles from '../styles/IntroSplash.module.css';

const SESSION_KEY = 'sd-intro-played';

/**
 * Animación de apertura del sitio: el logotipo de la balanza se dibuja,
 * se asienta y aparece la marca.
 *
 * Decisiones que importan:
 *  - Es un timeline de GSAP, no CSS con timeouts: se puede pausar, accelerar
 *    y su limpieza es determinista. Antes ocupaba 2,9 s bloqueando el scroll.
 *  - En móvil no se juega. Un segundo y medio de pantalla bloqueada al abrir
 *    se lee como lentitud, no como marca.
 *  - El bloqueo de scroll es una clase con red de seguridad por tiempo: si el
 *    componente muere de forma inesperada, la página nunca queda inmóvil.
 *  - Avisa con un evento cuando termina; el Hero espera esa señal.
 */
export default function IntroSplash() {
  const overlay = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useGSAP(
    () => {
      const reduced = prefersReducedMotion();
      const alreadyPlayed = sessionStorage.getItem(SESSION_KEY) === '1';
      const mm = gsap.matchMedia();

      // Sin animación, o ya vista en esta sesión: no hay nada que montar.
      if (reduced || alreadyPlayed) {
        signalIntroDone();
        return;
      }

      let safety: number | undefined;
      let unlock: (() => void) | undefined;

      mm.add(
        { desktop: BREAKPOINTS.isDesktop, reduce: BREAKPOINTS.reduceMotion },
        (context) => {
          const { desktop, reduce } = context.conditions as { desktop: boolean; reduce: boolean };
          if (reduce) {
            signalIntroDone();
            return;
          }

          // En pantallas táctiles se marca como visto y se deja pasar el
          // contenido: la marca ya se ve en el header de todas formas.
          if (!desktop) {
            sessionStorage.setItem(SESSION_KEY, '1');
            signalIntroDone();
            return;
          }

          sessionStorage.setItem(SESSION_KEY, '1');
          setVisible(true);

          const el = overlay.current;
          if (!el) return;

          unlock = lockScroll();
          // Red de seguridad: aunque algo falle, el scroll vuelve.
          safety = window.setTimeout(() => unlock?.(), 4000);

          const tl = gsap.timeline({
            onComplete: () => {
              unlock?.();
              setVisible(false);
              signalIntroDone();
            },
          });

          tl.set(el, { autoAlpha: 1 })
            // Trazo del logo: los <path> con stroke se dibujan en cascada
            // y la balanza se asienta con un balanceo corto.
            .fromTo(
              el.querySelectorAll('path[stroke]'),
              { strokeDasharray: 140, strokeDashoffset: 140 },
              { strokeDashoffset: 0, duration: SPLASH.drawTotal, stagger: 0.07, ease: 'power2.inOut' }
            )
            .fromTo(
              el.querySelector('.splashLogoWrap'),
              { rotate: -6 },
              { rotate: 0, duration: 0.7, ease: 'elastic.out(1, 0.45)' },
              '-=0.3'
            )
            .fromTo(
              el.querySelectorAll('[fill]'),
              { opacity: 0 },
              { opacity: 1, duration: 0.28, stagger: 0.06 },
              '-=0.5'
            )
            .fromTo(
              el.querySelector('.splashName'),
              { opacity: 0, y: 14 },
              { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
              '-=0.3'
            )
            .fromTo(
              el.querySelector('.splashDivider'),
              { opacity: 0, scaleX: 0 },
              { opacity: 1, scaleX: 1, duration: 0.4, ease: 'power2.out' },
              '-=0.35'
            )
            .fromTo(
              el.querySelector('.splashTagline'),
              { opacity: 0, y: 10 },
              { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' },
              '-=0.3'
            )
            // Salida: se retira hacia arriba en lugar de desvanecerse en el sitio.
            .to(el, { opacity: 0, y: SPLASH.outY, duration: SPLASH.outDuration, ease: 'power2.in' }, '+=0.1');
        }
      );

      return () => {
        mm.revert();
        if (safety) window.clearTimeout(safety);
        unlock?.();
      };
    },
    { scope: overlay }
  );

  if (!visible) return null;

  return (
    <div className={styles.overlay} ref={overlay} aria-hidden="true">
      <div className={styles.center}>
        <div className={`${styles.logoWrap} splashLogoWrap`}>
          <LogoMark size={92} className={styles.logo} />
        </div>

        <p className={`${styles.name} splashName`}>
          Sánchez Delgado <em>&amp;</em> Asociados
        </p>
        <span className={`${styles.divider} splashDivider`} />
        <p className={`${styles.tagline} splashTagline`}>Estudio Contable y Tributario · Lima, Perú</p>
      </div>
    </div>
  );
}
