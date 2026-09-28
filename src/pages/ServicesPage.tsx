import { Check } from 'lucide-react';
import useSEO from '../hooks/useSEO';
import useReveal from '../hooks/useReveal';
import ContactCta from '../components/ContactCta';
import styles from '../styles/ServicesPage.module.css';

const services = [
  {
    tag: 'Contabilidad',
    title: 'Outsourcing contable',
    price: 'Desde S/ 350 / mes',
    desc: 'Nos encargamos de todo el ciclo contable mensual de tu empresa: desde el registro de cada comprobante hasta los estados financieros que presentas a tu banco o socios.',
    items: [
      'Registro y procesamiento de comprobantes',
      'Conciliaciones bancarias mensuales',
      'Libros electrónicos (PLE) y SIRE',
      'Estados financieros mensuales explicados',
      'Declaración mensual unificada (PDT 621)',
      'Archivador digital de documentos',
    ],
  },
  {
    tag: 'Impuestos',
    title: 'Asesoría tributaria',
    price: 'Desde S/ 250 / mes',
    desc: 'Cumplimiento total ante SUNAT y planificación fiscal legítima. Elegimos el régimen conveniente y defendemos tus criterios ante una eventual fiscalización.',
    items: [
      'Declaraciones mensuales y pagos a cuenta',
      'DJ Anual de Impuesto a la Renta (FV 710)',
      'Elección y cambio de régimen (NRUS, RER, RMT, RG)',
      'Recuperación de percepciones y retenciones',
      'Atención de cartas y requerimientos SUNAT',
      'Opinión escrita sobre operaciones puntuales',
    ],
  },
  {
    tag: 'Recursos humanos',
    title: 'Planillas y laboral',
    price: 'Desde S/ 30 / trabajador',
    desc: 'Administramos tu planilla completa bajo el régimen general o el régimen laboral MYPE, con cálculos exactos y presentación oportuna de todas las obligaciones.',
    items: [
      'Contratos, altas y bajas (T-Registro)',
      'Planilla electrónica mensual (PLAME)',
      'CTS, gratificaciones y vacaciones',
      'Declaración anual T4',
      'Cálculo de liquidaciones de beneficios',
      'Asesoría en regímenes laborales general y MYPE',
    ],
  },
  {
    tag: 'Garantía',
    title: 'Auditoría y revisión',
    price: 'Cotización por proyecto',
    desc: 'Otorgamos confianza sobre tus cifras ante bancos, inversionistas, directorios o procesos de compraventa, aplicando Normas Internacionales de Auditoría (NIA).',
    items: [
      'Auditoría de estados financieros',
      'Revisión de información financiera',
      'Auditorías internas y de procesos',
      'Auditorías tributarias preventivas',
      'Due diligence contable y tributario',
      'Dictamen y carta a la gerencia',
    ],
  },
  {
    tag: 'Inicio',
    title: 'Constitución de empresas',
    price: 'Desde S/ 900 único',
    desc: 'Creamos tu empresa de punta a punta: desde la búsqueda de nombre hasta tu RUC con clave SOL operativa, listo para facturar en semanas.',
    items: [
      'Búsqueda y reserva de nombre en SUNARP',
      'Elección del tipo societario (E.I.R.L., S.A.C., S.A.)',
      'Elaboración y elevación a pública de la minuta',
      'Inscripción en Registros Públicos',
      'Inscripción del RUC y clave SOL',
      'Elección del régimen tributario inicial',
    ],
  },
  {
    tag: 'Decisiones',
    title: 'Asesoría financiera',
    price: 'Desde S/ 600 / mes',
    desc: 'Convertimos tu contabilidad en herramientas de decisión: presupuestos, flujo de caja proyectado e indicadores para negociar con bancos o planificar inversión.',
    items: [
      'Presupuesto anual y control de desviaciones',
      'Flujo de caja proyectado a 12 meses',
      'Cuadro de mando con KPIs del negocio',
      'Preparación de información para bancos',
      'Valuación sencilla para socios o compradores',
      'Sesiones mensuales de lectura financiera',
    ],
  },
];

export default function ServicesPage() {
  useReveal();

  useSEO({
    title: 'Servicios | Contabilidad, Tributación, Planillas y Auditoría en Perú',
    description:
      'Outsourcing contable, asesoría tributaria SUNAT, planillas, auditorías, constitución de empresas y asesoría financiera en Lima, Perú. Honorarios desde S/ 250 mensuales.',
    canonical: 'https://sanchezdelgado.pe/servicios',
  });

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className={`${styles.eyebrow} reveal`}>Servicios</span>
          <h1 className={`${styles.title} reveal`}>
            Soluciones contables integrales para tu empresa
          </h1>
          <p className={`${styles.lead} reveal`}>
            Seis líneas de servicio que cubren todo el ciclo de tu negocio: desde su
            constitución hasta la auditoría de sus estados financieros.
          </p>
        </div>
      </section>

      <section className={styles.list}>
        <div className="container">
          <div className={styles.grid}>
            {services.map((s) => (
              <article key={s.title} className={`${styles.card} reveal`}>
                <div className={styles.cardHead}>
                  <span className={styles.tag}>{s.tag}</span>
                  <span className={styles.price}>{s.price}</span>
                </div>
                <h2 className={styles.cardTitle}>{s.title}</h2>
                <p className={styles.cardDesc}>{s.desc}</p>
                <ul className={styles.items}>
                  {s.items.map((i) => (
                    <li key={i}>
                      <Check size={15} className={styles.check} />
                      {i}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <p className={styles.note}>
            Los precios son de referencia y se confirman tras el diagnóstico gratuito,
            según el volumen de comprobantes y trabajadores de tu empresa.
          </p>
        </div>
      </section>

      <section className={styles.comparison}>
        <div className="container">
          <span className={`${styles.eyebrow} reveal`}>Guía rápida</span>
          <h2 className={`${styles.subtitle} reveal`}>¿Qué régimen tributario te conviene?</h2>
          <p className={`${styles.comparisonLead} reveal`}>
            Referencia 2026 con UIT de S/ 5,500. En el diagnóstico comparamos escenarios
            con tus cifras reales antes de recomendar.
          </p>

          <div className={`${styles.tableWrap} reveal`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Característica</th>
                  <th>NRUS</th>
                  <th>RER</th>
                  <th>RMT (MYPE)</th>
                  <th>Régimen General</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Ingresos anuales máximos</td>
                  <td>S/ 96,000</td>
                  <td>S/ 525,000</td>
                  <td>1,700 UIT (S/ 9,350,000)</td>
                  <td>Sin límite</td>
                </tr>
                <tr>
                  <td>Impuesto a la Renta</td>
                  <td>Cuota fija mensual</td>
                  <td>1.5 % de ingresos netos</td>
                  <td>10 % hasta 15 UIT; 29.5 % exceso</td>
                  <td>29.5 % sobre utilidad</td>
                </tr>
                <tr>
                  <td>IGV (18 %)</td>
                  <td>No paga</td>
                  <td>Sí</td>
                  <td>Sí</td>
                  <td>Sí</td>
                </tr>
                <tr>
                  <td>Comprobantes</td>
                  <td>Solo boletas</td>
                  <td>Facturas y boletas</td>
                  <td>Facturas y boletas</td>
                  <td>Facturas y boletas</td>
                </tr>
                <tr>
                  <td>Libros contables</td>
                  <td>Ninguno</td>
                  <td>Registro de Compras y Ventas</td>
                  <td>Simplificado según ingresos</td>
                  <td>Contabilidad completa (PCGE)</td>
                </tr>
                <tr>
                  <td>DJ Anual</td>
                  <td>No presenta</td>
                  <td>No presenta</td>
                  <td>Sí (FV 710)</td>
                  <td>Sí (FV 710)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ContactCta />
    </>
  );
}
