import useSEO from '../hooks/useSEO';
import useRevealAnimations from '../hooks/useRevealAnimations';
import IntroSplash from '../components/IntroSplash';
import SeasonBanner from '../components/SeasonBanner';
import Hero from '../components/Hero';
import Services from '../components/Services';
import WhyUs from '../components/WhyUs';
import Process from '../components/Process';
import Testimonials from '../components/Testimonials';
import Faq from '../components/Faq';

export default function Home() {
  useSEO({
    title: 'Sánchez Delgado & Asociados | Estudio Contable y Tributario en Lima, Perú',
    description:
      'Asesoría contable y tributaria en Lima, Perú: contabilidad general, declaraciones SUNAT, planillas y auditoría. Diagnóstico gratuito.',
    keywords:
      'estudio contable Lima, asesoría contable y tributaria, contador para empresas Perú, declaraciones SUNAT, outsourcing contable',
  });

  // Una sola pasada de animaciones para toda la página: cada sección
  // declara sus entradas con data-reveal y el hook mide una vez.
  useRevealAnimations();

  return (
    <>
      {/* Animación de apertura: solo en Inicio, una vez por sesión */}
      <IntroSplash />
      <Hero />
      {/* Aviso estacional: solo si hoy cae dentro de una ventana de vencimientos */}
      <div className="container season-banner-wrap">
        <SeasonBanner />
      </div>
      <Services />
      <WhyUs />
      <Process />
      <Testimonials />
      <Faq />
    </>
  );
}
