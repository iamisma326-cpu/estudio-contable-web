import { useEffect, useState } from 'react';
import LogoMark from './icons/LogoMark';
import styles from '../styles/IntroSplash.module.css';

const SESSION_KEY = 'sd-intro-played';
const VISIBLE_MS = 2300; // tiempo antes de iniciar el fade-out
const FADE_MS = 600;     // duración del fade-out

/**
 * Animación de apertura del sitio: el logotipo de la balanza se dibuja,
 * se asienta con un balanceo sutil y aparece la marca. Se muestra solo en
 * la página de inicio y una vez por sesión. Respeta prefers-reduced-motion.
 */
export default function IntroSplash() {
  const [phase, setPhase] = useState<'hidden' | 'playing' | 'leaving' | 'done'>('hidden');

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || sessionStorage.getItem(SESSION_KEY)) {
      setPhase('done');
      return;
    }

    setPhase('playing');
    document.body.style.overflow = 'hidden';

    const t1 = setTimeout(() => {
      setPhase('leaving');
      sessionStorage.setItem(SESSION_KEY, '1');
    }, VISIBLE_MS);

    const t2 = setTimeout(() => {
      setPhase('done');
      document.body.style.overflow = '';
    }, VISIBLE_MS + FADE_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.body.style.overflow = '';
    };
  }, []);

  if (phase === 'hidden' || phase === 'done') return null;

  return (
    <div
      className={`${styles.overlay} ${phase === 'leaving' ? styles.leaving : ''}`}
      aria-hidden="true"
    >
      <div className={styles.center}>
        <div className={styles.logoWrap}>
          <LogoMark size={96} className={styles.logo} />
        </div>

        <h1 className={styles.name}>
          Sánchez Delgado <em>&amp;</em> Asociados
        </h1>
        <span className={styles.divider} aria-hidden="true" />
        <p className={styles.tagline}>Estudio Contable y Tributario · Lima, Perú</p>
      </div>
    </div>
  );
}
