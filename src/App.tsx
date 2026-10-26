import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ChatBot from './components/ChatBot';
import ScrollToTop from './components/ScrollToTop';
import { ScrollTrigger } from './lib/gsap';

// Páginas con carga perezosa: cada una es su propio chunk
const Home = lazy(() => import('./pages/Home'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'));
const RentaPage = lazy(() => import('./pages/RentaPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="page-loaderDot" aria-hidden="true" />
      <span>Cargando…</span>
    </div>
  );
}

/**
 * Cada ruta tiene una altura distinta y el navegador no dispara `resize`,
 * así que los triggers calculados contra el documento anterior se quedan
 * desfasados. Dos pasadas: la primera llega cuando la ruta casi siempre ya
 * montó; la segunda cubre el caso en que el chunk perezoso de la página
 * aterriza después. `refresh` es barato, no vale la pena una sincronía fina.
 */
function ScrollTriggerSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    const fast = window.setTimeout(() => ScrollTrigger.refresh(), 120);
    const slow = window.setTimeout(() => ScrollTrigger.refresh(), 900);
    return () => {
      window.clearTimeout(fast);
      window.clearTimeout(slow);
    };
  }, [pathname]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ScrollTriggerSync />
      <div id="app-root">
        <ChromeChrome />
        <ChatChrome />
        {/* tabIndex -1: es el destino del foco al cambiar de ruta */}
        <main id="contenido" tabIndex={-1}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/nosotros" element={<AboutPage />} />
              <Route path="/servicios" element={<ServicesPage />} />
              <Route path="/recursos" element={<ResourcesPage />} />
              <Route path="/renta-anual-2025" element={<RentaPage />} />
              <Route path="/contacto" element={<ContactPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
        <ChromeFooter />
      </div>
    </BrowserRouter>
  );
}

/**
 * En /login y /admin ocultamos la cabecera y el pie del sitio: la
 * experiencia interna no debe parecerse al marketing público.
 */
function ChromeChrome() {
  const { pathname } = useLocation();
  if (pathname === '/login' || pathname === '/admin') return null;
  return <Header />;
}

function ChromeFooter() {
  const { pathname } = useLocation();
  if (pathname === '/login' || pathname === '/admin') return null;
  return <Footer />;
}

/**
 * El asistente vive fuera de las rutas: se monta una sola vez y la
 * conversación sobrevive a los cambios de página. Como la cabecera y el
 * pie, desaparece en las áreas internas (/login, /admin).
 */
function ChatChrome() {
  const { pathname } = useLocation();
  if (pathname === '/login' || pathname === '/admin') return null;
  return <ChatBot />;
}
