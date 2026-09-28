import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import useReveal from '../hooks/useReveal';
import { IconWhatsApp } from './icons/BrandIcons';
import { whatsappLink, WHATSAPP_GREETING } from '../config/contact';
import styles from '../styles/ContactCta.module.css';

export default function ContactCta() {
  useReveal();

  return (
    <section className={styles.section}>
      <div className={`${styles.inner} reveal`}>
        <div>
          <h2 className={styles.title}>¿Listo para tener tus números en orden?</h2>
          <p className={styles.subtitle}>
            Agenda hoy tu diagnóstico gratuito de 45 minutos. Sin compromiso:
            saldrás con claridad sobre tu situación ante SUNAT.
          </p>
        </div>
        <div className={styles.actions}>
          <Link to="/contacto" className={styles.btnDark}>
            Agendar diagnóstico <ArrowRight size={17} />
          </Link>
          <a
            href={whatsappLink(WHATSAPP_GREETING)}
            target="_blank"
            rel="noreferrer"
            className={styles.btnGhost}
          >
            <IconWhatsApp size={17} /> Escríbenos al WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}
