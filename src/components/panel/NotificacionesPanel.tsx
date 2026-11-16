/**
 * Bandeja de notificaciones del cliente.
 *
 * Muestra las noticias que el estudio ya le envió, con los canales usados.
 * El admin las dispara desde /admin → Noticias; aquí solo se consultan.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Mail, MessageCircle } from 'lucide-react';
import { apiGet } from '../../lib/api';
import type { Notificacion, NotificacionesResponse } from '../../lib/noticiasTypes';
import styles from '../../styles/PanelPage.module.css';

const ETIQUETAS: Record<string, string> = {
  sunat: 'SUNAT',
  tributario: 'Tributario',
  laboral: 'Laboral',
  estudio: 'Estudio',
};

function fecha(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default function NotificacionesPanel() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<NotificacionesResponse>('/api/noticias/notificaciones');
      if (!cancelled) setNotificaciones(res.ok && res.data ? res.data.notificaciones : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <BellRing size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>Notificaciones</h1>
          <p className={styles.sectionLead}>
            Aquí quedan las noticias que te enviamos por Gmail y WhatsApp. Si no
            quieres recibir más, puedes cambiar tu preferencia en «Mi cuenta».
          </p>
        </div>
      </header>

      {notificaciones === null ? (
        <p className={styles.muted}>Cargando notificaciones…</p>
      ) : notificaciones.length === 0 ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Todavía no hay notificaciones</h2>
          <p className={styles.panelNote}>
            Cuando el estudio publique una noticia y la envíe, aparecerá aquí con
            el canal por el que te llegó.
          </p>
          <Link className={styles.inlineLink} to="/panel?tab=cuenta">
            Revisar mis preferencias de aviso
          </Link>
        </section>
      ) : (
        <div className={styles.articleGrid}>
          {notificaciones.map((n) => (
            <article key={n.noticia_id} className={styles.articleCard}>
              <div className={styles.articleMeta}>
                <span className={styles.articleDate}>{fecha(n.enviado_en || n.publicada_en)}</span>
                <span className={styles.tag}>{ETIQUETAS[n.categoria] || n.categoria}</span>
              </div>
              <h3 className={styles.articleTitle}>{n.titulo}</h3>
              <p className={styles.articleText}>{n.resumen}</p>

              <div className={styles.noticeChannels}>
                {n.email && (
                  <span className={`${styles.channelTag} ${styles.channelOn}`}>
                    <Mail size={13} /> Enviado a tu Gmail
                  </span>
                )}
                {n.whatsapp && (
                  <span className={`${styles.channelTag} ${styles.channelOn}`}>
                    <MessageCircle size={13} /> Enviado a tu WhatsApp
                  </span>
                )}
              </div>

              <div className={styles.noticeActions}>
                {n.estado === 'publicada' && (
                  <Link className={styles.inlineLink} to={`/panel?tab=guia#noticia-${n.slug}`}>
                    Ver en la guía
                  </Link>
                )}
                {n.fuente_url && (
                  <a className={styles.inlineLink} href={n.fuente_url} target="_blank" rel="noreferrer">
                    Fuente oficial
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
