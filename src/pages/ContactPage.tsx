import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Paperclip, X } from 'lucide-react';
import { IconPin, IconPhone, IconMail, IconClock, IconWhatsApp, IconSend } from '../components/icons/BrandIcons';
import {
  WHATSAPP_DISPLAY,
  whatsappLink,
  buildFormMessage,
  WHATSAPP_GREETING,
  MAX_FILE_SIZE,
  formatFileSize,
} from '../config/contact';
import useSEO from '../hooks/useSEO';
import useRevealAnimations from '../hooks/useRevealAnimations';
import useSuccessMoment from '../hooks/useSuccessMoment';
import useFileAttachment from '../hooks/useFileAttachment';
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

/** Cómo terminó el envío: share = archivo compartido directo, manual = adjuntar a mano */
type SendMode = 'none' | 'share' | 'manual';

export default function ContactPage() {
  useRevealAnimations();
  const [sent, setSent] = useState(false);
  const successRef = useSuccessMoment({ active: sent });
  const [waUrl, setWaUrl] = useState('');
  const [service, setService] = useState(serviceOptions[0]);
  const [sendMode, setSendMode] = useState<SendMode>('none');
  const [sentFile, setSentFile] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { file, error, inputKey, inputRef, handleChange, clear, openPicker, canShareFiles } =
    useFileAttachment();

  useSEO({
    title: 'Contacto | Agenda tu diagnóstico gratuito — Sánchez Delgado & Asociados',
    description:
      'Agenda tu diagnóstico contable gratuito en San Isidro, Lima. Escríbenos por WhatsApp, teléfono o formulario y te respondemos en menos de 24 horas.',
    canonical: 'https://sanchezdelgado.pe/contacto',
    breadcrumb: [{ name: 'Contacto', path: '/contacto' }],
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNotice(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      nombre: String(formData.get('nombre') || ''),
      email: String(formData.get('email') || ''),
      telefono: String(formData.get('telefono') || ''),
      empresa: String(formData.get('empresa') || ''),
      servicio: service,
      mensaje: String(formData.get('mensaje') || ''),
    };

    const willShare = canShareFiles(file);
    const text = buildFormMessage(data, { adjunto: file?.name, adjuntoViaja: willShare });

    // 1) Con archivo y soporte de Web Share: el sistema comparte mensaje + archivo.
    //    Se llama dentro del gesto del submit (sin awaits previos) para conservar
    //    la activación del usuario que exige navigator.share.
    if (file && willShare) {
      try {
        await navigator.share({ files: [file], text });
        setWaUrl('');
        setSentFile(file.name);
        setSendMode('share');
        setSent(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // El cliente cerró la hoja de compartir: no damos por enviado nada.
          setNotice(
            'Cancelaste el envío. Tu formulario sigue aquí: vuelve a presionar enviar cuando quieras.'
          );
          return;
        }
        // Otro fallo de share: caemos a wa.me con instrucciones de adjuntar a mano.
        const fallbackText = buildFormMessage(data, { adjunto: file.name, adjuntoViaja: false });
        const url = whatsappLink(fallbackText);
        window.open(url, '_blank', 'noopener,noreferrer');
        setWaUrl(url);
        setSentFile(file.name);
        setSendMode('manual');
        setSent(true);
      }
      return;
    }

    // 2) Sin archivo, o sin soporte de Web Share: wa.me como hasta ahora.
    //    Con archivo, la pantalla de éxito explica cómo adjuntarlo en el chat.
    const url = whatsappLink(text);
    window.open(url, '_blank', 'noopener,noreferrer');

    setWaUrl(url);
    setSentFile(file?.name ?? null);
    setSendMode(file ? 'manual' : 'none');
    setSent(true);
  };

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        {/* Columna información */}
        <div className={styles.info}>
          <span className={styles.eyebrow} data-reveal="up">Contacto</span>
          <h1 className={styles.title} data-reveal="up" data-reveal-delay="0.08">Hablemos de tu empresa</h1>
          <p className={styles.lead} data-reveal="up" data-reveal-delay="0.16">
            Cuéntanos tu situación y agendamos una reunión de diagnóstico de 45 minutos,
            presencial u online, sin costo ni compromiso.
          </p>

          <ul className={styles.infoList} data-reveal-group="left">
            <li data-reveal>
              <span className={styles.infoIcon}><IconPin size={19} /></span>
              <div>
                <strong>Oficina</strong>
                <p>Av. Canaval y Moreyra 480, Piso 12, Of. 1203 — San Isidro, Lima</p>
              </div>
            </li>
            <li data-reveal>
              <span className={styles.infoIcon}><IconPhone size={19} /></span>
              <div>
                <strong>Teléfono</strong>
                <p><a href="tel:+5114802600">(01) 480-2600</a></p>
              </div>
            </li>
            <li data-reveal>
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
            <li data-reveal>
              <span className={styles.infoIcon}><IconMail size={19} /></span>
              <div>
                <strong>Correo</strong>
                <p><a href="mailto:contacto@sanchezdelgado.pe">contacto@sanchezdelgado.pe</a></p>
              </div>
            </li>
            <li data-reveal>
              <span className={styles.infoIcon}><IconClock size={19} /></span>
              <div>
                <strong>Horario</strong>
                <p>Lun–Vie 8:30–18:00 · Sáb 9:00–13:00</p>
              </div>
            </li>
          </ul>

          <div className={styles.mapWrap} data-reveal="scale">
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
        <div className={styles.formCol} data-reveal="right">
          {sent ? (
            /* aria-live: el cambio de estado del formulario es el único
               punto donde el usuario necesita que le avisen. */
            <div className={styles.success} role="status" aria-live="polite" ref={successRef}>
              <CheckCircle2 size={52} className={styles.successIcon} data-success="mark" />
              <h2 data-success="line">
                {sendMode === 'share' ? '¡Mensaje y archivo listos!' : '¡Listo para enviar!'}
              </h2>

              {sendMode === 'share' ? (
                <p>
                  Se abrió el menú para compartir y elegiste WhatsApp: tu mensaje y{' '}
                  <strong>{sentFile}</strong> viajan juntos hacia nuestro número{' '}
                  <strong>{WHATSAPP_DISPLAY}</strong>. Solo presiona <strong>enviar</strong> y un
                  especialista te responderá dentro de las próximas 24 horas hábiles.
                </p>
              ) : sendMode === 'manual' ? (
                <>
                  <p>
                    Se abrió WhatsApp con tu mensaje hacia nuestro número{' '}
                    <strong>{WHATSAPP_DISPLAY}</strong>. Falta un paso: adjunta{' '}
                    <strong>{sentFile}</strong> en el chat.
                  </p>
                  <ol className={styles.successSteps}>
                    <li>Toca el clip <strong>📎</strong> junto a la barra de mensajes.</li>
                    <li>Elige <strong>Documentos</strong> (o <strong>Galería</strong>, si es una foto).</li>
                    <li>Busca y selecciona <strong>{sentFile}</strong>.</li>
                    <li>Presiona <strong>enviar</strong>.</li>
                  </ol>
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                  >
                    ¿No se abrió? Toca aquí
                  </a>
                </>
              ) : (
                <>
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
                </>
              )}

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

              <div className={styles.fileField}>
                <span className={styles.fileLabel}>Adjunta tu escrito o documento (opcional)</span>
                <input
                  key={inputKey}
                  ref={inputRef}
                  type="file"
                  name="adjunto"
                  className={styles.fileInput}
                  onChange={handleChange}
                  tabIndex={-1}
                  aria-hidden="true"
                />
                {file ? (
                  <div className={styles.fileChip}>
                    <Paperclip size={15} aria-hidden="true" />
                    <span className={styles.fileName} title={file.name}>{file.name}</span>
                    <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      className={styles.fileRemove}
                      onClick={clear}
                      aria-label={`Quitar archivo ${file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className={styles.fileZone} onClick={openPicker}>
                    <Paperclip size={17} aria-hidden="true" />
                    <span>Selecciona un archivo</span>
                    <small>Cualquier formato · máx. {formatFileSize(MAX_FILE_SIZE)}</small>
                  </button>
                )}
                {error && (
                  <p className={styles.fileError} role="alert">{error}</p>
                )}
              </div>

              {notice && (
                <p className={styles.notice} role="status">{notice}</p>
              )}

              <button type="submit" className={styles.submitBtn}>
                <IconSend size={17} /> Enviar por WhatsApp
              </button>
              <p className={styles.privacy}>
                Al enviar se abrirá WhatsApp con tu mensaje listo — solo debes presionar
                enviar. Si adjuntaste un archivo, podrás compartirlo directo o
                adjuntarlo en el chat. Tus datos se usan únicamente para responderte.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
