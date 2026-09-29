import { useCallback, useState } from 'react';
import { IconCalendar, IconNews, IconSearchTerm, IconCalc } from '../components/icons/BrandIcons';
import useSEO from '../hooks/useSEO';
import useRevealAnimations from '../hooks/useRevealAnimations';
import ContactCta from '../components/ContactCta';
import DeadlineConsult from '../components/DeadlineConsult';
import DeadlineTable from '../components/DeadlineTable';
import ExchangeRate from '../components/ExchangeRate';
import RegimeCalculator from '../components/RegimeCalculator';
import styles from '../styles/ResourcesPage.module.css';

/**
 * Hitos del calendario tributario peruano (no dependen del dígito del RUC).
 * Las obligaciones mensuales (PDT 621, PLAME, SIRE/PLE) SÍ dependen del
 * dígito: las cubre el consultor y la tabla de arriba con el cronograma
 * oficial 2026.
 */
const deadlines = [
  { date: 'Mar-Abr 2026', title: 'DJ Anual de Renta — empresas', desc: 'Cronograma General SUNAT: del 26 de marzo al 13 de abril de 2026 según el último dígito del RUC, para empresas fuera del alcance de la Ley N° 31940.' },
  { date: 'May-Jun 2026', title: 'DJ Anual de Renta — personas y MYPE', desc: 'Cronograma ampliado (Ley N° 31940): del 27 de mayo al 10 de junio de 2026 para personas naturales y MYPE con ingresos hasta 1,700 UIT.' },
  { date: 'Mayo', title: 'CTS primer depósito', desc: 'Depósito semestral de la Compensación por Tiempo de Servicios en el banco elegido por el trabajador.' },
  { date: 'Julio', title: 'Gratificaciones de Fiestas Patrias', desc: 'Pago de la primera gratificación (julio) más la bonificación extraordinaria del 9 %, con su aporte a EsSalud.' },
  { date: 'Noviembre', title: 'CTS segundo depósito', desc: 'Segundo depósito semestral de la CTS (mayo y noviembre de cada año).' },
  { date: 'Diciembre', title: 'Gratificaciones de Navidad', desc: 'Segunda gratificación legal más bonificación del 9 %, antes del cierre del ejercicio contable.' },
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
  useRevealAnimations();
  const [query, setQuery] = useState('');
  const [activeDigit, setActiveDigit] = useState<number | null>(null);

  const handleDigitChange = useCallback((digit: number | null) => {
    setActiveDigit(digit);
  }, []);

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
    breadcrumb: [{ name: 'Recursos', path: '/recursos' }],
  });

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className={styles.eyebrow} data-reveal="up">Recursos</span>
          <h1 className={styles.title} data-reveal="up" data-reveal-delay="0.08">
            Herramientas para entender tu contabilidad
          </h1>
          <p className={styles.lead} data-reveal="up" data-reveal-delay="0.16">
            Calendario de obligaciones, actualidad tributaria y un glosario en
            español sencillo. Todo gratuito, sin registro.
          </p>
        </div>
      </section>

      {/* Calendario */}
      <section className={styles.deadlines}>
        <div className="container">
          <div className={styles.sectionHead} data-reveal="up">
            <IconCalendar size={26} className={styles.sectionIcon} />
            <div>
              <h2 className={styles.subtitle}>Cronograma SUNAT 2026</h2>
              <p className={styles.sectionLead}>
                Tu vencimiento no es un día fijo del mes: depende del último dígito de
                tu RUC y cambia cada mes. Consulta tus fechas exactas aquí —
                gratis, sin registro.
              </p>
            </div>
          </div>

          <div data-reveal="up" data-reveal-delay="0.08">
            <DeadlineConsult onDigitChange={handleDigitChange} />
          </div>

          <div className={styles.tableWrap}>
            <DeadlineTable activeDigit={activeDigit} />
          </div>

          <p className={styles.timelineNote} data-reveal="fade">
            Además del cronograma mensual, estos son los hitos del año que no
            dependen del dígito de tu RUC:
          </p>

          <div className={styles.timeline} data-reveal-group="up">
            {deadlines.map((d) => (
              <article key={d.title} className={styles.deadline} data-reveal>
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

      {/* Herramientas: tipo de cambio + calculadora */}
      <section className={styles.tools}>
        <div className="container">
          <div className={styles.sectionHead} data-reveal="up">
            <IconCalc size={26} className={styles.sectionIcon} />
            <div>
              <h2 className={styles.subtitle}>Herramientas del día a día</h2>
              <p className={styles.sectionLead}>
                Datos oficiales y estimaciones rápidas para tus decisiones de hoy.
                Gratis, sin registro.
              </p>
            </div>
          </div>

          <div className={styles.toolsGrid} data-reveal="up" data-reveal-delay="0.08">
            <div className={styles.toolsCol}>
              <h3 className={styles.toolsSubtitle}>Tipo de cambio SUNAT</h3>
              <p className={styles.toolsNote}>
                Compra y venta oficiales del dólar, referencia para tus
                facturaciones y regularizaciones en moneda extranjera.
              </p>
              <ExchangeRate />
            </div>
            <div className={styles.toolsCol}>
              <h3 className={styles.toolsSubtitle}>¿Qué régimen te conviene?</h3>
              <p className={styles.toolsNote}>
                Compara el impuesto anual estimado entre RER, RMT y Régimen
                General con tus ventas y gastos del año.
              </p>
              <RegimeCalculator />
            </div>
          </div>
        </div>
      </section>

      {/* Actualidad */}
      <section className={styles.articles}>
        <div className="container">
          <div className={styles.sectionHead} data-reveal="up">
            <IconNews size={26} className={styles.sectionIcon} />
            <div>
              <h2 className={styles.subtitle}>Actualidad tributaria</h2>
              <p className={styles.sectionLead}>
                Lo que está cambiando en SUNAT, MTPE y la normativa laboral —
                explicado en minutos, sin tecnicismos.
              </p>
            </div>
          </div>

          <div className={styles.articlesGrid} data-reveal-group="clip">
            {articles.map((a) => (
              <article key={a.title} className={styles.articleCard} data-reveal>
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
          <div className={styles.sectionHead} data-reveal="up">
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
              <div key={g.term} className={styles.termCard} data-reveal="fade">
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
