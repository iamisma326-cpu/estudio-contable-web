import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Phone } from 'lucide-react';
import LogoMark from './icons/LogoMark';
import styles from '../styles/Header.module.css';

const navItems = [
  { label: 'Inicio', link: '/' },
  { label: 'Nosotros', link: '/nosotros' },
  { label: 'Servicios', link: '/servicios' },
  { label: 'Recursos', link: '/recursos' },
];

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cierra el menú móvil al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Bloquea el scroll del body mientras el menú está abierto
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <>
      <header className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={styles.inner}>
          <Link to="/" className={styles.logo} aria-label="Sánchez Delgado & Asociados — Inicio">
            <LogoMark size={42} className={styles.logoMark} />
            <span className={styles.logoText}>
              Sánchez Delgado <em>&amp;</em> Asociados
              <small>Estudio Contable y Tributario</small>
            </span>
          </Link>

          <nav className={styles.nav} aria-label="Navegación principal">
            {navItems.map((item) => (
              <NavLink
                key={item.link}
                to={item.link}
                end={item.link === '/'}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link to="/contacto" className={styles.contactBtn}>
              <Phone size={15} />
              Contactar
            </Link>
          </nav>

          <button
            className={styles.mobileToggle}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </header>

      {/* Overlay a pantalla completa — FUERA del header para que position:fixed
          no se vea afectado por el backdrop-filter del header */}
      <div
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}
        aria-hidden={!menuOpen}
      >
        <nav className={styles.mobileNav} aria-label="Navegación móvil">
          {navItems.map((item, i) => (
            <NavLink
              key={item.link}
              to={item.link}
              end={item.link === '/'}
              className={({ isActive }) =>
                `${styles.mobileLink} ${isActive ? styles.mobileLinkActive : ''}`
              }
              style={{ transitionDelay: menuOpen ? `${80 + i * 60}ms` : '0ms' }}
            >
              <span className={styles.mobileNum}>0{i + 1}</span>
              {item.label}
            </NavLink>
          ))}
          <Link
            to="/contacto"
            className={styles.mobileContact}
            style={{ transitionDelay: menuOpen ? '380ms' : '0ms' }}
          >
            <Phone size={18} />
            Agendar una consulta
          </Link>
        </nav>
      </div>
    </>
  );
}
