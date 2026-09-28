import { IconTarget, IconEye, IconHandshake, IconShieldCheck, IconBulb, IconBadgeCheck } from '../components/icons/BrandIcons';
import useSEO from '../hooks/useSEO';
import useRevealAnimations from '../hooks/useRevealAnimations';
import ContactCta from '../components/ContactCta';
import styles from '../styles/AboutPage.module.css';

const values = [
  {
    icon: IconShieldCheck,
    title: 'Integridad',
    desc: 'Decimos la verdad sobre tu situación tributaria, incluso cuando no es lo que quieres escuchar. Planificamos dentro de la ley, siempre.',
  },
  {
    icon: IconBulb,
    title: 'Proactividad',
    desc: 'No esperamos a que SUNAT escriba: anticipamos cambios normativos y te avisamos antes de que te afecten.',
  },
  {
    icon: IconBadgeCheck,
    title: 'Cercanía',
    desc: 'Un contador asignado que conoce tu negocio por su nombre. Nada de call centers ni respuestas genéricas.',
  },
];

const team = [
  { initials: 'MS', name: 'CPC Miguel Ángel Sánchez Delgado', role: 'Socio Director · Contador Público Colegiado' },
  { initials: 'JG', name: 'CPC Jorge Gutiérrez', role: 'Socio de Auditoría · Ex auditor senior de firma Big Four' },
  { initials: 'LP', name: 'CPC Lucía Paredes', role: 'Gerente Tributario · Especialista en fiscalizaciones SUNAT' },
  { initials: 'DR', name: 'CPC Diego Rojas', role: 'Gerente de Planillas · Laboralista contable' },
];

export default function AboutPage() {
  useRevealAnimations();

  useSEO({
    title: 'Nosotros | Sánchez Delgado & Asociados Estudio Contable',
    description:
      'Conoce a Sánchez Delgado & Asociados: estudio contable en Lima dirigido por el CPC Miguel Ángel Sánchez Delgado, con más de 15 años asesorando MYPEs y PYMES peruanas.',
    canonical: 'https://sanchezdelgado.pe/nosotros',
    breadcrumb: [{ name: 'Nosotros', path: '/nosotros' }],
  });

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className={styles.eyebrow} data-reveal="up">Nosotros</span>
          <h1 className={styles.title} data-reveal="up" data-reveal-delay="0.08">
            Contadores que entienden<br />de negocios, no solo de números
          </h1>
          <p className={styles.lead} data-reveal="up" data-reveal-delay="0.16">
            Fundado en 2010 por el CPC Miguel Ángel Sánchez Delgado con una convicción
            simple: las empresas peruanas merecen asesoría contable de nivel
            corporativo, explicada en lenguaje claro y a un precio justo. Hoy somos el
            estudio de confianza de más de 320 empresas en todo el país.
          </p>

          <div className={styles.milestones} data-reveal-group="up">
            <div className={styles.milestone} data-reveal>
              <strong>2010</strong>
              <span>Fundación en Lima con 3 clientes</span>
            </div>
            <div className={styles.milestone} data-reveal>
              <strong>2014</strong>
              <span>Primeras 100 empresas bajo administración</span>
            </div>
            <div className={styles.milestone} data-reveal>
              <strong>2019</strong>
              <span>Área de auditoría certificada NIA</span>
            </div>
            <div className={styles.milestone} data-reveal>
              <strong>2024</strong>
              <span>+320 clientes y 14 profesionales</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.mission}>
        <div className="container">
          <div className={styles.missionGrid} data-reveal-group="up">
            <div className={styles.missionCard} data-reveal>
              <IconTarget size={26} className={styles.missionIcon} />
              <h2>Misión</h2>
              <p>
                Dar a las empresas peruanas tranquilidad administrativa: contabilidad
                ordenada, impuestos pagados a tiempo y números que explican el negocio.
              </p>
            </div>
            <div className={styles.missionCard} data-reveal>
              <IconEye size={26} className={styles.missionIcon} />
              <h2>Visión</h2>
              <p>
                Ser el estudio contable de referencia para las MYPEs y PYMES que quieren
                crecer con formalidad, en Lima y en todo el Perú.
              </p>
            </div>
            <div className={styles.missionCard} data-reveal>
              <IconHandshake size={26} className={styles.missionIcon} />
              <h2>Compromiso</h2>
              <p>
                Cada cliente tiene un contador asignado, respuesta en menos de 24 horas
                y honorarios fijos acordados por escrito. Sin sorpresas.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.values}>
        <div className="container">
          <span className={styles.eyebrow} data-reveal="up">Nuestros valores</span>
          <h2 className={styles.subtitle} data-reveal="up">Lo que nos define frente al cliente</h2>
          <div className={styles.valuesGrid} data-reveal-group="clip">
            {values.map((v) => (
              <article key={v.title} className={styles.valueCard} data-reveal>
                <span className={styles.valueIcon}><v.icon size={24} /></span>
                <h3>{v.title}</h3>
                <p>{v.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.team}>
        <div className="container">
          <span className={styles.eyebrow} data-reveal="up">Equipo</span>
          <h2 className={styles.subtitle} data-reveal="up">Personas detrás de tus números</h2>
          <div className={styles.teamGrid} data-reveal-group="up">
            {team.map((m) => (
              <div key={m.name} className={styles.teamCard} data-reveal>
                <span className={styles.avatar} aria-hidden="true">{m.initials}</span>
                <strong>{m.name}</strong>
                <span className={styles.role}>{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ContactCta />
    </>
  );
}
