import { useState } from 'react';
import { IconCalendar, IconNews, IconSearchTerm } from '../components/icons/BrandIcons';
import useSEO from '../hooks/useSEO';
import useReveal from '../hooks/useReveal';
import ContactCta from '../components/ContactCta';
import styles from '../styles/ResourcesPage.module.css';

const deadlines = [
  { date: '12 de cada mes', title: 'Planilla electrónica (PLAME)', desc: 'Envío de la información de las remuneraciones del mes anterior.' },
  { date: '14 de cada mes', title: 'Libros electrónicos (PLE/SIRE)', desc: 'Registro de Compras y Ventas según cronograma por último dígito del RUC.' },
  { date: '18 de cada mes', title: 'Declaración mensual (PDT 621)', desc: 'IGV, Impuesto a la Renta mensual y pagos a cuenta según cronograma SUNAT.' },
  { date: 'Enero', title: 'Planilla anual T4', desc: 'Declaración anual de remuneraciones de todo el personal.' },
  { date: 'Marzo', title: 'Gratificaciones Fiestas Patrias', desc: 'Pago al personal más depósito de la EsSalud correspondiente.' },
  { date: 'Abril', title: 'DJ Anual de Renta (FV 710)', desc: 'Declaración Jurada anual para RMT y Régimen General.' },
  { date: 'Julio', title: 'Gratificaciones de Fiestas Patrias (2.ª)', desc: 'Segunda gratificación y bonificación extraordinaria del 9 %.' },
  { date: 'Diciembre', title: 'Gratificaciones de Navidad', desc: 'Pago de la gratificación de Navidad y CTS pendientes.' },
];

const articles = [
  {
    date: 'Sep 2026',
    tag: 'SUNAT',
    title: 'SIRE Integral: SUNAT amplía su uso obligatorio',
    excerpt: 'Más contribuyentes deben llevar el Registro de Compras y Ventas por el sistema en línea. Verifica si tu RUC entra en el nuevo cronograma.',
  },
  {
    date: 'Ene 2026',
    tag: 'Normativo',
    title: 'La UIT 2026 sube a S/ 5,500',
    excerpt: 'El incremento ajusta los umbrales de los regímenes: el RER sigue en S/ 525,000 y el RMT llega a S/ 9,350,000 de ingresos anuales.',
  },
  {
    date: 'Ago 2026',
    tag: 'Laboral',
    title: 'Gratificaciones: errores que cuestan multas',
    excerpt: 'Pagar fuera de fecha u omitir la bonificación extraordinaria del 9 % es de lo más fiscalizado por el MTPE y SUNAT.',
  },
  {
    date: 'Jul 2026',
    tag: 'Tributario',
    title: 'Pagos en efectivo: topes de detección',
    excerpt: 'Las operaciones en efectivo por montos altos quedan sujetas a control de SUNAT. Recomendamos usar canales bancarios para cobros importantes.',
  },
];

const glossary = [
  { term: 'UIT', def: 'Unidad Impositiva Tributaria. Para 2026 vale S/ 5,500 y es la base de los umbrales de regímenes e impuestos.' },
  { term: 'IGV', def: 'Impuesto General a las Ventas: 18 % (incluye 2 % de promoción municipal) que se cobra en cada venta y se paga mensualmente a SUNAT.' },
  { term: 'PDT 621', def: 'Programa informático con el que se declara el IGV y el Impuesto a la Renta mensual de tercera categoría.' },
  { term: 'RMT', def: 'Régimen MYPE Tributario: para empresas con ingresos hasta 1,700 UIT. IR del 10 % hasta 15 UIT de renta neta.' },
  { term: 'PLE', def: 'Programa de Libros Electrónicos: sistema para presentar los libros contables de forma digital ante SUNAT.' },
  { term: 'T-Registro', def: 'Registro virtual de trabajadores ante el MTPE, obligatorio al iniciar y finalizar contratos laborales.' },
  { term: 'CTS', def: 'Compensación por Tiempo de Servicios: beneficio social que se deposita en mayo y noviembre.' },
  { term: 'PCGE', def: 'Plan Contable General Empresarial: catálogo de cuentas obligatorio para la contabilidad completa.' },
];

export default function ResourcesPage() {
  useReveal();
  const [query, setQuery] = useState('');

  const filtered = glossary.filter(
    (g) =>
      g.term.toLowerCase().includes(query.toLowerCase()) ||
      g.def.toLowerCase().includes(query.toLowerCase())
  );

  useSEO({
    title: 'Recursos | Calendario Tributario, Actualidad y Glosario — Sánchez Delgado & Asociados',
    description:
      'Calendario de vencimientos SUNAT 2026, actualidad tributaria y glosario contable-tributario para empresas peruanas.',
    canonical: 'https://sanchezdelgado.pe/recursos',
  });

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className={`${styles.eyebrow} reveal`}>Recursos</span>
          <h1 className={`${styles.title} reveal`}>
            Herramientas para entender tu contabilidad
          </h1>
          <p className={`${styles.lead} reveal`}>
            Calendario de obligaciones, actualidad tributaria y un glosario en
            español sencillo. Todo gratuito, sin registro.
          </p>
        </div>
      </section>

      {/* Calendario */}
      <section className={styles.deadlines}>
        <div className="container">
          <div className={`${styles.sectionHead} reveal`}>
            <IconCalendar size={26} className={styles.sectionIcon} />
            <div>
              <h2 className={styles.subtitle}>Vencimientos clave del año</h2>
              <p className={styles.sectionLead}>
                Las fechas exactas varían según el último dígito de tu RUC. Nuestro
                equipo controla tu cronograma personalizado cada mes.
              </p>
            </div>
          </div>

          <div className={styles.timeline}>
            {deadlines.map((d) => (
              <article key={d.title} className={`${styles.deadline} reveal`}>
                <span className={styles.date}>{d.date}</span>
                <div>
                  <h3>{d.title}</h3>
                  <p>{d.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Actualidad */}
      <section className={styles.articles}>
        <div className="container">
          <div className={`${styles.sectionHead} reveal`}>
            <IconNews size={26} className={styles.sectionIcon} />
            <div>
              <h2 className={styles.subtitle}>Actualidad tributaria</h2>
              <p className={styles.sectionLead}>
                Lo que está cambiando en SUNAT, MTPE y la normativa laboral —
                explicado en minutos, sin tecnicismos.
              </p>
            </div>
          </div>

          <div className={styles.articlesGrid}>
            {articles.map((a) => (
              <article key={a.title} className={`${styles.articleCard} reveal`}>
                <div className={styles.articleMeta}>
                  <span className={styles.articleDate}>{a.date}</span>
                  <span className={styles.articleTag}>{a.tag}</span>
                </div>
                <h3>{a.title}</h3>
                <p>{a.excerpt}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Glosario */}
      <section className={styles.glossary}>
        <div className="container">
          <div className={`${styles.sectionHead} reveal`}>
            <IconSearchTerm size={26} className={styles.sectionIcon} />
            <div>
              <h2 className={styles.subtitle}>Glosario contable</h2>
              <p className={styles.sectionLead}>
                Los términos que escuchas cada mes, explicados sin tecnicismos.
              </p>
            </div>
          </div>

          <input
            type="search"
            className={styles.searchInput}
            placeholder="Buscar término… (ej. IGV, CTS, UIT)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar término en el glosario"
          />

          <dl className={styles.glossaryGrid}>
            {filtered.map((g) => (
              <div key={g.term} className={`${styles.termCard} reveal visible`}>
                <dt>{g.term}</dt>
                <dd>{g.def}</dd>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className={`${styles.termCard} ${styles.noResults}`}>
                <dt>Sin resultados</dt>
                <dd>
                  No encontramos ese término. Escríbenos y te lo explicamos
                  personalmente.
                </dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <ContactCta />
    </>
  );
}
