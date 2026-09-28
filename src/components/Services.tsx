import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import useReveal from '../hooks/useReveal';
import { IconLedger, IconScale, IconPayroll, IconAudit } from './icons/BrandIcons';
import styles from '../styles/Services.module.css';

const services = [
  {
    icon: IconLedger,
    title: 'Contabilidad general',
    desc: 'Llevamos tu contabilidad completa: libros electrónicos, conciliaciones y estados financieros que sí vas a entender.',
    points: ['Libros electrónicos (PLE/SIRE)', 'Conciliaciones bancarias', 'Estados financieros mensuales'],
  },
  {
    icon: IconScale,
    title: 'Asesoría tributaria',
    desc: 'Cumple con SUNAT y paga solo lo que corresponde: régimen correcto, declaraciones a tiempo y respaldo ante fiscalizaciones.',
    points: ['Declaraciones mensuales y anuales', 'Elección de régimen (RER, RMT, RG)', 'Defensa ante requerimientos SUNAT'],
  },
  {
    icon: IconPayroll,
    title: 'Planillas y laboral',
    desc: 'Gestión de tu planilla en régimen general o MYPE: cálculos exactos y presentaciones sin retrasos.',
    points: ['T-Registro y PLAME', 'CTS, gratificaciones y vacaciones', 'Declaración anual T4'],
  },
  {
    icon: IconAudit,
    title: 'Auditoría y revisión',
    desc: 'Cifras confiables para bancos, socios e inversionistas, revisadas bajo NIA y NIIF para PYMES.',
    points: ['Auditoría de estados financieros', 'Revisión de información financiera', 'Auditorías internas'],
  },
];

export default function Services() {
  useReveal();

  return (
    <section className={styles.section}>
      <div className="container">
        <div className={`${styles.header} reveal`}>
          <span className="eyebrow">Servicios</span>
          <h2 className="section-title">Asesoría contable y tributaria integral</h2>
          <p className="section-subtitle">
            Un solo equipo a cargo de tus números: desde el libro diario hasta tu
            declaración anual ante SUNAT.
          </p>
        </div>

        <div className={styles.grid}>
          {services.map((s) => (
            <article key={s.title} className={`${styles.card} reveal`}>
              <span className={styles.icon}>
                <s.icon size={26} />
              </span>
              <h3 className={styles.cardTitle}>{s.title}</h3>
              <p className={styles.cardDesc}>{s.desc}</p>
              <ul className={styles.list}>
                {s.points.map((p) => (
                  <li key={p}>
                    <Check size={15} className={styles.check} />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className={`${styles.cta} reveal`}>
          <p>¿No sabes por dónde empezar? Te orientamos sin costo.</p>
          <Link to="/contacto" className="btn btn-outline-dark">
            Hablar con un especialista <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
