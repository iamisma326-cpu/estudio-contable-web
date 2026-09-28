import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Phone } from 'lucide-react';
import { gsap, useGSAP, ScrollTrigger } from '../lib/gsap';
import { lockScroll } from '../lib/scrollLock';
import useFocusTrap from '../hooks/useFocusTrap';
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
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const droppedRef = useRef(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /* Estado "scrolled" con ScrollTrigger en vez de un listener de scroll con
     setState por evento: el callback solo corre al cruzar el umbral. */
  useGSAP(
    () => {
      const st = ScrollTrigger.create({
        start: 'top -80',
        end: 99999,
        onUpdate: (self) => setIsScrolled(self.scroll() > 80),
        onRefresh: (self) => setIsScrolled(self.scroll() > 80),
      });
      return () => st.kill();
    },
    { scope: headerRef }
  );

  /* Micro-gesto al compactarse: la navegación se asienta con un stagger
     corto. Sólo la primera vez, y sólo si el motion está permitido.
     Los selectores usan las clases del CSS Module porque Vite las hashea:
     un literal como '.navLink' no existiría en el DOM. */
  useGSAP(
    () => {
      if (!isScrolled || droppedRef.current) return;
      droppedRef.current = true;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from([`.${styles.navLink}`, `.${styles.contactBtn}`], {
          y: -10,
          opacity: 0,
          duration: 0.45,
          stagger: 0.04,
          ease: 'power3.out',
        });
      });
      return () => mm.revert();
    },
    { dependencies: [isScrolled], scope: headerRef }
  );

  /* Menú móvil: foco atrapado, Escape para salir y el foco vuelve al botón. */
  useFocusTrap(menuOpen, menuRef, closeMenu);

  /* Bloqueo de scroll compartido con el splash (ver lib/scrollLock.ts). */
  useEffect(() => {
    if (!menuOpen) return;
    return lockScroll();
  }, [menuOpen]);

  /* El menú se cierra solo al cambiar de ruta. */
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  /* Al abrir el menú, ScrollTrigger debe re-medir: el overlay fija el alto
     del documento y dejar triggers desalineados produce saltos al cerrar. */
  useEffect(() => {
    ScrollTrigger.refresh();
  }, [menuOpen]);

  /* Las pestañas del móvil entran escalonadas; con reduced-motion el CSS
     global las deja en su estado final, y aquí solo hay que limitarlas. */
  useGSAP(
    () => {
      if (!menuOpen) return;
      const items = menuRef.current?.querySelectorAll('[data-menu-item]');
      if (!items?.length) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: 'power3.out', overwrite: true }
      );
    },
    { dependencies: [menuOpen], scope: menuRef }
  );

  return (
    <>
      <header
        className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}
        ref={headerRef}
      >
        <div className={styles.inner}>
          <Link
            to="/"
            className={`${styles.logo} headerLogo`}
            aria-label="Sánchez Delgado & Asociados — Inicio"
          >
            <LogoMark size={42} className={styles.logoMark} />
            <span className={styles.logoText}>
              Sánchez Delgado <em>&amp;</em> Asociados
              <small className={styles.logoSub}>Estudio Contable y Tributario</small>
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
            <Link to="/contacto" className={`${styles.contactBtn} contactBtn`}>
              <Phone size={15} />
              Contactar
            </Link>
          </nav>

          <button
            className={styles.mobileToggle}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="menu-movil"
          >
            {menuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </header>

      {/* Overlay a pantalla completa — FUERA del header para que position:fixed
          no se vea afectado por el backdrop-filter del header */}
      <div
        id="menu-movil"
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}
        ref={menuRef}
        aria-hidden={!menuOpen}
      >
        <nav className={styles.mobileNav} aria-label="Navegación móvil">
          {navItems.map((item, i) => (
            <NavLink
              key={item.link}
              to={item.link}
              end={item.link === '/'}
              data-menu-item
              className={({ isActive }) =>
                `${styles.mobileLink} ${isActive ? styles.mobileLinkActive : ''}`
              }
            >
              <span className={styles.mobileNum}>0{i + 1}</span>
              {item.label}
            </NavLink>
          ))}
          <Link to="/contacto" className={styles.mobileContact} data-menu-item>
            <Phone size={18} />
            Agendar una consulta
          </Link>
        </nav>
      </div>
    </>
  );
}
