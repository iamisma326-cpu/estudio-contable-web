import useReveal from '../hooks/useReveal';
import styles from '../styles/Process.module.css';

const steps = [
  {
    num: '01',
    title: 'Diagnóstico gratuito',
    desc: 'Revisamos tu situación: régimen actual, declaraciones pendientes y estado de planillas. Detectamos riesgos y oportunidades.',
  },
  {
    num: '02',
    title: 'Propuesta a tu medida',
    desc: 'Recibes un plan de trabajo con alcance, responsables y honorarios fijos mensuales, sin costos escondidos.',
  },
  {
    num: '03',
    title: 'Puesta al día',
    desc: 'Regularizamos libros, declaraciones atrasadas y planillas. En 2 a 4 semanas tu empresa queda al día con SUNAT.',
  },
  {
    num: '04',
    title: 'Acompañamiento continuo',
    desc: 'Operamos el mes contable, reportamos resultados y respondemos tus consultas en menos de 24 horas.',
  },
];

export default function Process() {
  useReveal();

  return (
    <section className={styles.section}>
      <div className="container">
        <div className={`${styles.header} reveal`}>
          <span className="eyebrow">Cómo trabajamos</span>
          <h2 className="section-title">De la incertidumbre al control en 4 pasos</h2>
          <p className="section-subtitle">
            Un proceso probado con más de 320 empresas, claro desde el primer día.
          </p>
        </div>

        <ol className={styles.steps}>
          {steps.map((s) => (
            <li key={s.num} className={`${styles.step} reveal`}>
              <span className={styles.num}>{s.num}</span>
              <h3 className={styles.stepTitle}>{s.title}</h3>
              <p className={styles.stepDesc}>{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
