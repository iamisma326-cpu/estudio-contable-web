/**
 * Página pública de baja: /baja?token=… o /baja/:token.
 *
 * El enlace del email llega aquí sin pedir sesión. La API desactiva la
 * suscripción y esta página solo confirma el resultado; no revela el correo.
 */

import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import styles from '../styles/BajaPage.module.css';

type Estado = 'cargando' | 'ok' | 'error';

export default function BajaPage() {
  useSEO({
    title: 'Darse de baja | Sánchez Delgado & Asociados',
    description: 'Confirma la baja de los avisos por email y WhatsApp del estudio.',
    noindex: true,
  });

  const params = useParams();
  const [search] = useSearchParams();
  const token = params.token ?? search.get('token');
  const [estado, setEstado] = useState<Estado>('cargando');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setEstado('error');
      setMensaje('El enlace no incluye un token de baja.');
      return;
    }

    (async () => {
      try {
        // Primero se valida el token sin modificarlo (los escáneres de correo
        // abren el enlace, pero no ejecutan este POST). Solo si sigue activa
        // se aplica la baja.
        const infoRes = await fetch(`/api/baja?token=${encodeURIComponent(token)}`);
        const info = (await infoRes.json().catch(() => null)) as
          | { ok?: boolean; valido?: boolean; activo?: boolean; error?: string }
          | null;
        if (cancelled) return;

        if (!infoRes.ok || !info?.ok || !info.valido) {
          setEstado('error');
          setMensaje('El enlace no es válido o la suscripción ya no existe.');
          return;
        }
        if (info.activo === false) {
          setEstado('ok');
          setMensaje('Esta suscripción ya estaba dada de baja.');
          return;
        }

        const res = await fetch('/api/baja', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; mensaje?: string; error?: string }
          | null;
        if (cancelled) return;
        if (res.ok && data?.ok) {
          setEstado('ok');
          setMensaje(data.mensaje || 'Listo. No volverás a recibir avisos del estudio.');
        } else {
          setEstado('error');
          setMensaje('No se pudo confirmar la baja. Inténtalo otra vez en un momento.');
        }
      } catch {
        if (!cancelled) {
          setEstado('error');
          setMensaje('No se pudo procesar la baja. Inténtalo otra vez en un momento.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite">
        <p className={styles.eyebrow}>Sánchez Delgado & Asociados</p>

        {estado === 'cargando' && (
          <>
            <h1 className={styles.title}>Procesando tu baja…</h1>
            <p className={styles.text}>Estamos desactivando los avisos de tu cuenta.</p>
          </>
        )}

        {estado === 'ok' && (
          <>
            <h1 className={styles.title}>Baja confirmada</h1>
            <p className={styles.text}>{mensaje}</p>
            <p className={styles.text}>
              Si quieres volver a recibirlos, puedes activarlos desde «Mi cuenta» en tu panel.
            </p>
          </>
        )}

        {estado === 'error' && (
          <>
            <h1 className={styles.title}>No pudimos procesar la baja</h1>
            <p className={styles.text}>{mensaje}</p>
            <p className={styles.text}>
              Escríbenos y lo resolvemos manualmente, o revisa las preferencias en tu panel.
            </p>
          </>
        )}

        <div className={styles.actions}>
          <Link className={styles.link} to="/panel?tab=cuenta" referrerPolicy="no-referrer">
            Ir a mi cuenta
          </Link>
          <Link className={styles.linkMuted} to="/" referrerPolicy="no-referrer">
            Volver al sitio
          </Link>
        </div>
      </section>
    </main>
  );
}
