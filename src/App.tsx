import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';

// Lazy-loaded pages — each becomes its own chunk
const Home = lazy(() => import('./pages/Home'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));

function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      fontFamily: 'var(--font-body)',
      color: 'var(--color-text-muted)',
      fontSize: '0.95rem'
    }}>
      <span>Cargando…</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div id="app-root">
        <Header />
        <main>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/nosotros" element={<AboutPage />} />
              <Route path="/servicios" element={<ServicesPage />} />
              <Route path="/recursos" element={<ResourcesPage />} />
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
