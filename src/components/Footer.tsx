import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram, Linkedin } from 'lucide-react';
import { useGSAP, gsap } from '../lib/gsap';
import LogoMark from './icons/LogoMark';
import styles from '../styles/Footer.module.css';

const navLinks = [
  { label: 'Inicio', link: '/' },
  { label: 'Nosotros', link: '/nosotros' },
  { label: 'Servicios', link: '/servicios' },
  { label: 'Recursos', link: '/recursos' },
  { label: 'Renta Anual 2025', link: '/renta-anual-2025' },
  { label: 'Contacto', link: '/contacto' },
];

export default function Footer() {
  const root = useRef<HTMLElement>(null);

  /* Entrada por columnas al llegar al final de la página. */
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-reveal]', {
          opacity: 0,
          y: 22,
          duration: 0.6,
          stagger: 0.08,
          ease: 'power3.out',
          scrollTrigger: { trigger: root.current, start: 'top 92%', once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <footer className={styles.footer} ref={root}>
      {/* Barra única: marca · navegación · redes */}
      <div className={styles.bar}>
        <Link
          to="/"
          className={styles.brand}
          data-reveal
          aria-label="Sánchez Delgado & Asociados — Inicio"
        >
          <LogoMark size={32} className={styles.logoMark} />
          <span className={styles.name}>
            Sánchez Delgado <em>&amp;</em> Asociados
          </span>
        </Link>

        <nav className={styles.nav} data-reveal aria-label="Mapa del sitio">
          {navLinks.map((l) => (
            <Link key={l.link} to={l.link} className={styles.navLink}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className={styles.social} data-reveal>
          <a
            href="https://www.facebook.com/sanchezdelgadope"
            target="_blank"
            rel="noreferrer"
            aria-label="Facebook"
            className={styles.socialBtn}
          >
            <Facebook size={15} />
          </a>
          <a
            href="https://www.instagram.com/sanchezdelgadope"
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
            className={styles.socialBtn}
          >
            <Instagram size={15} />
          </a>
          <a
            href="https://www.linkedin.com/company/sanchezdelgadope"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
            className={styles.socialBtn}
          >
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
