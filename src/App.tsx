import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import { ScrollTrigger } from './lib/gsap';

// Lazy-loaded pages — each becomes its own chunk
const Home = lazy(() => import('./pages/Home'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'));
const RentaPage = lazy(() => import('./pages/RentaPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="page-loaderDot" aria-hidden="true" />
      <span>Cargando…</span>
    </div>
  );
}

export default function App() {
  /* La altura de cada ruta es distinta: sin refrescar, los triggers que
     nacen cerca del final de la página miden contra el documento anterior. */
  useEffect(() => {
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 120);
    return () => window.clearTimeout(id);
  });

  return (
    <BrowserRouter>
      <ScrollToTop />
      <div id="app-root">
        <Header />
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}
