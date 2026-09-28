import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import styles from '../styles/Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <span className={styles.eyebrow}>Estudio contable y tributario · Lima, Perú</span>

        <h1 className={styles.title}>
          Tus números en orden,<br />
          tu empresa <em>en calma</em>
        </h1>

        <p className={styles.subtitle}>
          Asesoría contable y tributaria especializada: llevamos tu contabilidad,
          cumplimos tus obligaciones ante SUNAT y te explicamos qué significan tus
          números para decidir mejor.
        </p>

        <div className={styles.ctaRow}>
          <Link to="/contacto" className="btn btn-primary">
            Agendar diagnóstico gratuito <ArrowRight size={17} />
          </Link>
          <Link to="/servicios" className="btn btn-outline">
            Ver servicios
          </Link>
        </div>

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Más de 15 años</dt>
            <dd>de experiencia en el Perú</dd>
          </div>
          <span className={styles.statDivider} aria-hidden="true" />
          <div className={styles.stat}>
            <dt>+320 empresas</dt>
            <dd>asesoradas cada mes</dd>
          </div>
          <span className={styles.statDivider} aria-hidden="true" />
          <div className={styles.stat}>
            <dt>98 % puntualidad</dt>
            <dd>en declaraciones SUNAT</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
