import { useState } from 'react';
import { Plus } from 'lucide-react';
import useReveal from '../hooks/useReveal';
import styles from '../styles/Faq.module.css';

const faqs = [
  {
    q: '¿Cuánto cobra un estudio contable en Perú?',
    a: 'Depende del volumen de operaciones. Para una pequeña empresa en RER o RMT con hasta 50 comprobantes mensuales, los honorarios típicos van de S/ 250 a S/ 450 mensuales. Empresas en Régimen General o con planilla de varios trabajadores pueden pagar entre S/ 500 y S/ 1,500. Nosotros siempre entregamos una propuesta con precio fijo tras el diagnóstico gratuito.',
  },
  {
    q: '¿En qué régimen tributario debería inscribir mi empresa?',
    a: 'Depende de tus ingresos, compras, tipo de clientes y utilidades esperadas. Como referencia: el NRUS para negocios muy pequeños (cuota fija de S/ 20 o S/ 50), el RER para ingresos hasta S/ 525,000 con IR de 1.5 %, el RMT para MYPEs con ingresos hasta 1,700 UIT con IR del 10 % sobre los primeros S/ 82,500 de utilidad, y el Régimen General para empresas grandes (29.5 % sobre la utilidad). En el diagnóstico gratuito comparamos escenarios con tus números reales.',
  },
  {
    q: 'Tengo declaraciones atrasadas ante SUNAT, ¿me pueden ayudar?',
    a: 'Sí, es una de nuestras especialidades. Regularizamos declaraciones mensuales y anuales atrasadas, coordinamos órdenes de pago y, en la mayoría de casos, logramos reducir las multas gracias a la rebaja por subsanación voluntaria que aplica SUNAT (hasta 92 % según la infracción).',
  },
  {
    q: '¿Llevan planillas de trabajadores?',
    a: 'Sí. Gestionamos altas y bajas en el T-Registro, planilla electrónica (PLAME), cálculo de CTS, gratificaciones, vacaciones y la declaración anual T4, tanto en régimen laboral general como en el régimen MYPE.',
  },
  {
    q: '¿Trabajan con empresas fuera de Lima?',
    a: 'Sí, atendemos clientes en todo el Perú de forma 100 % digital: firma electrónica, nube de documentos y videollamadas. Si lo deseas, coordinamos reuniones presenciales en nuestras oficinas de San Isidro.',
  },
  {
    q: '¿El primer diagnóstico tiene costo?',
    a: 'No. La primera reunión de 45 minutos es gratuita y sin compromiso: revisamos tu situación y te entregamos un informe con los riesgos detectados, aunque decidas no trabajar con nosotros.',
  },
];

export default function Faq() {
  useReveal();
  const [open, setOpen] = useState(0);

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <div className={`${styles.header} reveal`}>
          <span className="eyebrow">Preguntas frecuentes</span>
          <h2 className="section-title">Dudas que escuchamos cada semana</h2>
          <p className="section-subtitle">
            Si la tuya no está aquí, escríbenos y la respondemos el mismo día.
          </p>
        </div>

        <div className={`${styles.list} reveal`}>
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`}>
                <button
                  className={styles.question}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                >
                  <span>{f.q}</span>
                  <Plus size={19} className={styles.plus} />
                </button>
                <div className={styles.answer} role="region">
                  <p>{f.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
