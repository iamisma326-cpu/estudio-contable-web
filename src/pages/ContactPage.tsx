import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { IconPin, IconPhone, IconMail, IconClock, IconWhatsApp, IconSend } from '../components/icons/BrandIcons';
import { WHATSAPP_DISPLAY, whatsappLink, buildFormMessage, WHATSAPP_GREETING } from '../config/contact';
import useSEO from '../hooks/useSEO';
import useReveal from '../hooks/useReveal';
import styles from '../styles/ContactPage.module.css';

const serviceOptions = [
  'Outsourcing contable',
  'Asesoría tributaria',
  'Planillas y laboral',
  'Auditoría',
  'Constitución de empresa',
  'Asesoría financiera',
  'Otro / no estoy seguro',
];

export default function ContactPage() {
  useReveal();
  const [sent, setSent] = useState(false);
  const [waUrl, setWaUrl] = useState('');
  const [service, setService] = useState(serviceOptions[0]);

  useSEO({
    title: 'Contacto | Agenda tu diagnóstico gratuito — Sánchez Delgado & Asociados',
    description:
      'Agenda tu diagnóstico contable gratuito en San Isidro, Lima. Escríbenos por WhatsApp, teléfono o formulario y te respondemos en menos de 24 horas.',
    canonical: 'https://sanchezdelgado.pe/contacto',
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const data = {
      nombre: String(formData.get('nombre') || ''),
      email: String(formData.get('email') || ''),
      telefono: String(formData.get('telefono') || ''),
      empresa: String(formData.get('empresa') || ''),
      servicio: service,
      mensaje: String(formData.get('mensaje') || ''),
    };

    const url = whatsappLink(buildFormMessage(data));

    // Ocurre dentro del gesto del click: los bloqueadores de popups no lo impiden
    window.open(url, '_blank', 'noopener,noreferrer');

    setWaUrl(url);
    setSent(true);
  };

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        {/* Columna información */}
        <div className={styles.info}>
          <span className={`${styles.eyebrow} reveal`}>Contacto</span>
          <h1 className={`${styles.title} reveal`}>Hablemos de tu empresa</h1>
          <p className={`${styles.lead} reveal`}>
            Cuéntanos tu situación y agendamos una reunión de diagnóstico de 45 minutos,
            presencial u online, sin costo ni compromiso.
          </p>

          <ul className={styles.infoList}>
            <li className="reveal">
              <span className={styles.infoIcon}><IconPin size={19} /></span>
              <div>
                <strong>Oficina</strong>
                <p>Av. Canaval y Moreyra 480, Piso 12, Of. 1203 — San Isidro, Lima</p>
              </div>
            </li>
            <li className="reveal">
              <span className={styles.infoIcon}><IconPhone size={19} /></span>
              <div>
                <strong>Teléfono</strong>
                <p><a href="tel:+5114802600">(01) 480-2600</a></p>
              </div>
            </li>
            <li className="reveal">
              <span className={styles.infoIcon}><IconWhatsApp size={19} /></span>
              <div>
                <strong>WhatsApp</strong>
                <p>
                  <a
                    href={whatsappLink(WHATSAPP_GREETING)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {WHATSAPP_DISPLAY}
                  </a>
                </p>
              </div>
            </li>
            <li className="reveal">
              <span className={styles.infoIcon}><IconMail size={19} /></span>
              <div>
                <strong>Correo</strong>
                <p><a href="mailto:contacto@sanchezdelgado.pe">contacto@sanchezdelgado.pe</a></p>
              </div>
            </li>
            <li className="reveal">
              <span className={styles.infoIcon}><IconClock size={19} /></span>
              <div>
                <strong>Horario</strong>
                <p>Lun–Vie 8:30–18:00 · Sáb 9:00–13:00</p>
              </div>
            </li>
          </ul>

          <div className={`${styles.mapWrap} reveal`}>
            <iframe
              title="Ubicación de la oficina en San Isidro, Lima"
              src="https://www.google.com/maps?q=Av.+Canaval+y+Moreyra+480,+San+Isidro,+Lima,+Peru&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>

        {/* Columna formulario */}
        <div className={`${styles.formCol} reveal`}>
          {sent ? (
            <div className={styles.success}>
              <CheckCircle2 size={52} className={styles.successIcon} />
              <h2>¡Listo para enviar!</h2>
              <p>
                Se abrió WhatsApp con tu mensaje ya escrito hacia nuestro número{' '}
                <strong>{WHATSAPP_DISPLAY}</strong>. Solo presiona <strong>enviar</strong> en
                la app y un especialista te responderá dentro de las próximas 24 horas hábiles.
              </p>
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
              >
                ¿No se abrió? Toca aquí
              </a>
              <button type="button" className={styles.backLink} onClick={() => setSent(false)}>
                Volver al formulario
              </button>
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              <h2 className={styles.formTitle}>Agenda tu diagnóstico gratuito</h2>

              <label className={styles.field}>
                <span>Nombre completo *</span>
                <input type="text" name="nombre" required placeholder="Ej. María Torres" />
              </label>

              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span>Correo electrónico *</span>
                  <input type="email" name="email" required placeholder="tu@empresa.pe" />
                </label>
                <label className={styles.field}>
                  <span>Teléfono / WhatsApp *</span>
                  <input type="tel" name="telefono" required placeholder="999 999 999" />
                </label>
              </div>

              <label className={styles.field}>
                <span>Nombre de la empresa</span>
                <input type="text" name="empresa" placeholder="Ej. Mi Empresa S.A.C. (opcional)" />
              </label>

              <label className={styles.field}>
                <span>Servicio de interés *</span>
                <select
                  name="servicio"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  required
                >
                  {serviceOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Cuéntanos tu situación *</span>
                <textarea
                  name="mensaje"
                  rows={5}
                  required
                  placeholder="Ej. Tengo una bodega en RER con 2 años de operación y quiero revisar si estoy pagando de más…"
                />
              </label>

              <button type="submit" className={styles.submitBtn}>
                <IconSend size={17} /> Enviar por WhatsApp
              </button>
              <p className={styles.privacy}>
                Al enviar se abrirá WhatsApp con tu mensaje listo — solo debes presionar
                enviar. Tus datos se usan únicamente para responderte.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
