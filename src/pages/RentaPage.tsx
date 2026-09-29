import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, CheckCircle2, Clock, FileText } from 'lucide-react';
import useSEO from '../hooks/useSEO';
import useRevealAnimations from '../hooks/useRevealAnimations';
import ContactCta from '../components/ContactCta';
import { IconWhatsApp } from '../components/icons/BrandIcons';
import { whatsappLink } from '../config/contact';
import {
  RENTA_GENERAL_2025,
  RENTA_AMPLIADO_2025,
  MONTH_NAMES,
} from '../data/sunatSchedule';
import { RENTA_FAQS } from '../data/rentaFaqs';
import styles from '../styles/RentaPage.module.css';

/** Etiqueta de fila: dígito o Buenos Contribuyentes (índice 10) */
function rowLabel(i: number): string {
  return i === 10 ? 'Buenos Contribuyentes y no obligados a RUC' : String(i);
}

function RentaTable({ title, subtitle, dates }: { title: string; subtitle: string; dates: Date[] }) {
  return (
    <div className={styles.tableCard}>
      <h3 className={styles.tableTitle}>{title}</h3>
      <p className={styles.tableSubtitle}>{subtitle}</p>
      <div className={styles.tableScroll} role="region" aria-label={title} tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Último dígito del RUC</th>
              <th scope="col">Fecha de vencimiento</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((d, i) => (
              <tr key={i}>
                <th scope="row">{rowLabel(i)}</th>
                <td>
                  {d.getDate()} de {MONTH_NAMES[d.getMonth()].toLowerCase()} de {d.getFullYear()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function RentaPage() {
  useRevealAnimations();

  useSEO({
    title: 'Declaración Anual de Renta 2025: fechas y guía completa — Sánchez Delgado & Asociados',
    description:
      'Cronograma oficial SUNAT de la Declaración Anual de Renta 2025: vencimientos por dígito de RUC para empresas (marzo-abril 2026) y personas naturales/MYPE (mayo-junio 2026), formularios 710 y 709, multas y fraccionamiento.',
    keywords:
      'declaración anual renta 2025, cronograma renta 2026 SUNAT, formulario 710, formulario 709, impuesto a la renta empresas Perú, DJ anual MYPE',
    canonical: 'https://sanchezdelgado.pe/renta-anual-2025',
    breadcrumb: [{ name: 'Renta Anual 2025', path: '/renta-anual-2025' }],
    faq: RENTA_FAQS,
  });

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <span className={styles.eyebrow} data-reveal="up">Guía tributaria 2026</span>
          <h1 className={styles.title} data-reveal="up" data-reveal-delay="0.08">
            Declaración Anual de Renta 2025
          </h1>
          <p className={styles.lead} data-reveal="up" data-reveal-delay="0.16">
            Fechas oficiales de vencimiento según el último dígito de tu RUC, los
            formularios que te tocan y qué hacer si se te pasó la fecha — explicado
            por contadores, no por el burocrático.
          </p>
          <div className={styles.heroMeta} data-reveal="up" data-reveal-delay="0.24">
            <span><CalendarDays size={15} /> RS 386-2025/SUNAT</span>
            <span><Clock size={15} /> Actualizado: setiembre 2026</span>
          </div>
        </div>
      </section>

      <section className={styles.intro}>
        <div className="container">
          <div className={styles.introGrid}>
            <article className={styles.stepCard} data-reveal="up">
              <FileText size={22} className={styles.stepIcon} />
              <h3>1. Identifica tu cronograma</h3>
              <p>
                Hay dos calendarios distintos. Si eres <strong>empresa</strong> fuera del
                alcance de la Ley N° 31940, te toca el <strong>cronograma general</strong>{' '}
                (marzo-abril). Si eres <strong>persona natural</strong> o{' '}
                <strong>MYPE</strong> con ingresos 2024 de hasta 1,700 UIT (S/ 9'095,000),
                te toca el <strong>ampliado</strong> (mayo-junio).
              </p>
            </article>
            <article className={styles.stepCard} data-reveal="up" data-reveal-delay="0.08">
              <CheckCircle2 size={22} className={styles.stepIcon} />
              <h3>2. Prepara la información</h3>
              <p>
                Las empresas declaran con el <strong>Formulario Virtual 710</strong>{' '}
                (Simplificado o Completo, disponible desde el 2 de enero de 2026). Las
                personas naturales con el <strong>709</strong> (desde el 31 de marzo de
                2026, también en la app Personas SUNAT).
              </p>
            </article>
            <article className={styles.stepCard} data-reveal="up" data-reveal-delay="0.16">
              <Clock size={22} className={styles.stepIcon} />
              <h3>3. Declara dentro de tu fecha</h3>
              <p>
                Presentar fuera de plazo genera multa (típicamente 1 UIT = S/ 5,500 en
                2026) más intereses diarios. Si regularizas antes de una notificación,
                la rebaja por subsanación voluntaria llega hasta el <strong>90 %</strong>.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.tables}>
        <div className="container">
          <div className={styles.sectionHead} data-reveal="up">
            <div>
              <h2 className={styles.subtitle}>Cronogramas oficiales de vencimiento</h2>
              <p className={styles.sectionLead}>
                Resolución de Superintendencia N° 386-2025/SUNAT. Busca el último dígito
                de tu RUC en la primera columna.
              </p>
            </div>
          </div>

          <div className={styles.tablesGrid} data-reveal-group="up">
            <RentaTable
              title="a) Cronograma General — Empresas"
              subtitle="Negocios fuera del alcance de la Ley N° 31940: ingresos 2024 mayores a 1,700 UIT, iniciaron operaciones en 2025, pertenecen a grupos económicos o gozan de beneficios especiales."
              dates={RENTA_GENERAL_2025}
            />
            <RentaTable
              title="b) Cronograma Ampliado — Personas y MYPE"
              subtitle="Personas naturales y micro/small empresas de la Ley N° 31940 con ingresos netos 2024 de hasta 1,700 UIT."
              dates={RENTA_AMPLIADO_2025}
            />
          </div>

          <p className={styles.legalNote} data-reveal="fade">
            Fuente:{' '}
            <a
              href="https://www.sunat.gob.pe/orientacion/cronogramas/2026/cRenta2025.html"
              target="_blank"
              rel="noreferrer"
            >
              Cronograma oficial en sunat.gob.pe
            </a>
            . Las fechas pueden variar por prórrogas por estado de emergencia en
            distritos afectados.
          </p>
        </div>
      </section>

      <section className={styles.faq}>
        <div className="container">
          <div className={styles.sectionHead} data-reveal="up">
            <div>
              <h2 className={styles.subtitle}>Preguntas frecuentes</h2>
              <p className={styles.sectionLead}>
                Lo que más nos preguntan en temporada de renta.
              </p>
            </div>
          </div>

          <div className={styles.faqList} data-reveal-group="up">
            {RENTA_FAQS.map((f) => (
              <article key={f.q} className={styles.faqItem}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.midCta}>
        <div className="container">
          <div className={styles.midCtaInner} data-reveal="clip">
            <div>
              <h2>¿Prefieres que la hagamos nosotros?</h2>
              <p>
                Preparamos y presentamos tu Declaración Anual completa: revisamos tus
                libros, maximizamos deducciones y respondemos ante SUNAT por ti.
              </p>
            </div>
            <div className={styles.midCtaActions}>
              <Link to="/contacto" className={styles.btnPrimary}>
                Agendar diagnóstico <ArrowRight size={16} />
              </Link>
              <a
                href={whatsappLink('Hola Sánchez Delgado & Asociados, necesito ayuda con mi Declaración Anual de Renta 2025.')}
                target="_blank"
                rel="noreferrer"
                className={styles.btnGhost}
              >
                <IconWhatsApp size={16} /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      <ContactCta />
    </>
  );
}
