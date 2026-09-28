import useSEO from '../hooks/useSEO';
import IntroSplash from '../components/IntroSplash';
import Hero from '../components/Hero';
import Services from '../components/Services';
import WhyUs from '../components/WhyUs';
import Process from '../components/Process';
import Faq from '../components/Faq';

export default function Home() {
  useSEO({
    title: 'Sánchez Delgado & Asociados | Estudio Contable y Tributario en Lima, Perú',
    description:
      'Asesoría contable y tributaria en Lima, Perú: contabilidad general, declaraciones SUNAT, planillas y auditoría. Diagnóstico gratuito.',
    keywords:
      'estudio contable Lima, asesoría contable y tributaria, contador para empresas Perú, declaraciones SUNAT, outsourcing contable',
  });

  return (
    <>
      {/* Animación de apertura: solo en Inicio, una vez por sesión */}
      <IntroSplash />
      <Hero />
      <Services />
      <WhyUs />
      <Process />
      <Faq />
    </>
  );
}
