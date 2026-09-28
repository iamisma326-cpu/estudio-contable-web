import { CheckCircle2 } from 'lucide-react';
import useReveal from '../hooks/useReveal';
import { IconLock, IconTimer, IconChat } from './icons/BrandIcons';
import styles from '../styles/WhyUs.module.css';

const advantages = [
  {
    icon: IconTimer,
    title: 'Puntuales con SUNAT',
    desc: 'Calendario de vencimientos controlado y doble revisión antes de cada presentación: cero multas evitables.',
  },
  {
    icon: IconChat,
    title: 'Explicaciones claras',
    desc: 'Traducimos tus números a decisiones: cuánto pagar, cuándo y por qué. Sin tecnicismos, sin letras pequeñas.',
  },
  {
    icon: IconLock,
    title: 'Confidencialidad garantizada',
    desc: 'Tus estados financieros y declaraciones se manejan con reserva profesional respaldada por contrato.',
  },
];

export default function WhyUs() {
  useReveal();

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <div className={`${styles.content} reveal`}>
          <span className={styles.eyebrow}>¿Por qué nosotros?</span>
          <h2 className={styles.title}>
            Más que declaraciones: un aliado de tu negocio
          </h2>
          <p className={styles.lead}>
            Cualquier despacho puede presentar tus declaraciones. Nosotros vamos más
            allá: revisamos tu contabilidad, anticipamos tu carga tributaria y te
            acompañamos ante SUNAT.
          </p>

          <ul className={styles.list}>
            {advantages.map((a) => (
              <li key={a.title} className={styles.item}>
                <span className={styles.itemIcon}><a.icon size={24} /></span>
                <div>
                  <h3>{a.title}</h3>
                  <p>{a.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className={`${styles.aside} reveal`}>
          <div className={styles.asideCard}>
            <CheckCircle2 size={26} className={styles.asideIcon} />
            <h3>Contadores colegiados</h3>
            <p>
              Equipo inscrito en la Junta de Decanos de Colegios de Contadores Públicos
              del Perú, con capacitación permanente en normativa SUNAT y NIIF.
            </p>
          </div>
          <div className={styles.asideCard}>
            <CheckCircle2 size={26} className={styles.asideIcon} />
            <h3>Atención en todo el Perú</h3>
            <p>
              Servicio 100 % digital con clientes en Lima, Arequipa, Trujillo y Cusco.
              Reuniones presenciales en San Isidro cuando las necesites.
            </p>
          </div>
          <div className={styles.asideCardGold}>
            <p className={styles.goldLabel}>Nuestro compromiso</p>
            <p className={styles.goldText}>
              «Si presentamos una declaración tarde, la multa la asumimos nosotros».
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
