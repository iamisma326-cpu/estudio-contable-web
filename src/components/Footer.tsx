import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin } from 'lucide-react';
import LogoMark from './icons/LogoMark';
import styles from '../styles/Footer.module.css';

const navLinks = [
  { label: 'Inicio', link: '/' },
  { label: 'Nosotros', link: '/nosotros' },
  { label: 'Servicios', link: '/servicios' },
  { label: 'Recursos', link: '/recursos' },
  { label: 'Contacto', link: '/contacto' },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      {/* Barra única: marca · navegación · redes */}
      <div className={styles.bar}>
        <Link to="/" className={styles.brand} aria-label="Sánchez Delgado & Asociados — Inicio">
          <LogoMark size={32} className={styles.logoMark} />
          <span className={styles.name}>
            Sánchez Delgado <em>&amp;</em> Asociados
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Mapa del sitio">
          {navLinks.map((l) => (
            <Link key={l.link} to={l.link} className={styles.navLink}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.social}>
          <a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook" className={styles.socialBtn}>
            <Facebook size={15} />
          </a>
          <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram" className={styles.socialBtn}>
            <Instagram size={15} />
          </a>
          <a href="https://linkedin.com" target="_blank" rel="noreferrer" aria-label="LinkedIn" className={styles.socialBtn}>
            <Linkedin size={15} />
          </a>
        </div>
      </div>

      {/* Línea legal */}
      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} Sánchez Delgado &amp; Asociados</p>
        <p className={styles.contact}>
          <a href="mailto:contacto@sanchezdelgado.pe">contacto@sanchezdelgado.pe</a>
          <span aria-hidden="true"> · </span>
          <a href="tel:+5114802600">(01) 480-2600</a>
          <span aria-hidden="true"> · </span>
          San Isidro, Lima — Perú
        </p>
      </div>
    </footer>
  );
}
