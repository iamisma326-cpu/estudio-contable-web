/**
 * Pestaña WhatsApp del admin.
 *
 * El navegador nunca habla con el servicio Go: pide el QR a
 * /api/admin/whatsapp/vincular (Vercel, requireAdmin) y renueva el QR cada
 * 5 s mientras está en pantalla. El token interno no se expone.
 */

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Unlink } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import type { EstadoWhatsapp } from '../../lib/noticiasTypes';
import styles from '../../styles/AdminPage.module.css';

interface EstadoResponse {
  ok: boolean;
  estado: EstadoWhatsapp;
  error?: string;
}

interface QrResponse {
  ok: boolean;
  qr: string | null;
  conectado?: boolean;
  error?: string;
}

function comoImagen(qr: string | null): string | null {
  if (!qr) return null;
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}

export default function WhatsAppPanel() {
  const [estado, setEstado] = useState<EstadoWhatsapp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);

  const consultar = useCallback(async () => {
    const res = await apiGet<EstadoResponse>('/api/admin/whatsapp/estado');
    if (res.ok && res.data) {
      setEstado(res.data.estado);
      if (res.data.estado.conectado) {
        setQr(null);
        setError(null);
      } else if (res.data.error) {
        setError(res.data.error);
      }
    } else {
      setError('No se pudo consultar el estado del servicio de WhatsApp.');
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  // Mientras hay QR, el código caduca a los ~20 s. Se vuelve a pedir el par
  // cada 5 s: el servicio devuelve el QR vigente o el nuevo que emitió
  // whatsmeow, y el panel lo reemplaza sin que el admin haga nada.
  useEffect(() => {
    if (!qr) return;
    const id = window.setInterval(() => {
      void (async () => {
        const res = await apiSend<QrResponse>('/api/admin/whatsapp/vincular', 'POST', {});
        if (!res.ok || !res.data?.ok) return;
        if (res.data.conectado) {
          setQr(null);
          setError(null);
          await consultar();
          return;
        }
        const nuevo = comoImagen(res.data.qr);
        if (nuevo) setQr(nuevo);
      })();
    }, 5000);
    return () => window.clearInterval(id);
  }, [qr, consultar]);

  async function vincular() {
    setBusy(true);
    setError(null);
    const res = await apiSend<QrResponse>('/api/admin/whatsapp/vincular', 'POST', {});
    setBusy(false);
    if (!res.ok || !res.data?.ok) {
      setError(res.data?.error || 'No se pudo iniciar el emparejamiento.');
      return;
    }
    if (res.data.conectado) {
      setQr(null);
      await consultar();
      return;
    }
    setQr(comoImagen(res.data.qr));
  }

  async function desvincular() {
    setBusy(true);
    setError(null);
    const res = await apiSend<{ ok: boolean; error?: string }>(
      '/api/admin/whatsapp/desvincular',
      'POST',
      {}
    );
    setBusy(false);
    if (!res.ok || !res.data?.ok) {
      setError(res.data?.error || 'No se pudo desvincular el número.');
      return;
    }
    setQr(null);
    await consultar();
  }

  const conectado = estado?.conectado === true;
  const numero = estado?.jid || estado?.numero || null;

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <MessageCircle size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>WhatsApp del estudio</h1>
          <p className={styles.sectionLead}>
            Vincula el número que enviará los avisos. La sesión se guarda fuera de
            Vercel, así que reiniciar el servicio no vuelve a pedir el QR.
          </p>
        </div>
      </header>

      {error && <p role="alert" className={styles.alert}>{error}</p>}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Estado de la sesión</h2>
        {cargando ? (
          <p className={styles.muted}>Consultando el servicio…</p>
        ) : (
          <>
            <p className={styles.cellTitle}>
              <span className={`${styles.statusDot} ${conectado ? styles.statusDotOn : ''}`} />
              {conectado ? 'Vinculado' : 'Sin vincular'}
            </p>
            {numero && <p className={styles.cellSub}>Número: {numero}</p>}
            {estado?.desde && <p className={styles.cellSub}>Conectado desde: {estado.desde}</p>}
            {estado?.ultimo_error && (
              <p className={styles.cellSub}>Último error: {estado.ultimo_error}</p>
            )}
          </>
        )}

        <div className={styles.formActions} style={{ marginTop: 14 }}>
          <button type="button" className={styles.primaryBtn} onClick={() => void vincular()} disabled={busy}>
            <RefreshCw size={14} /> {conectado ? 'Volver a vincular' : 'Vincular número'}
          </button>
          <button
            type="button"
            className={styles.miniBtnDanger}
            onClick={() => void desvincular()}
            disabled={busy || (!conectado && !qr)}
          >
            <Unlink size={14} /> {qr ? 'Cancelar vinculación' : 'Desvincular'}
          </button>
          <button type="button" className={styles.miniBtn} onClick={() => void consultar()}>
            Actualizar estado
          </button>
        </div>

        {qr && (
          <div className={styles.qrBox}>
            <img className={styles.qrImage} src={qr} alt="Código QR para vincular WhatsApp" />
            <div>
              <p className={styles.cellTitle}>Escanea con WhatsApp</p>
              <p className={styles.cellSub}>
                WhatsApp → Dispositivos vinculados → Vincular un dispositivo. El código
                caduca en unos 20–60 segundos y se renueva solo mientras esta pantalla esté abierta.
              </p>
              <p className={styles.muted}>
                Usa un chip dedicado al estudio, no el número personal del dueño.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Qué hace este servicio</h2>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <span className={styles.listTitle}>No envía nada por su cuenta</span>
            <span className={styles.listMeta}>Solo atiende los envíos que encola el panel o el cron.</span>
          </li>
          <li className={styles.listItem}>
            <span className={styles.listTitle}>Solo a suscriptores con opt-in</span>
            <span className={styles.listMeta}>La preferencia se guarda en «Mi cuenta» de cada cliente.</span>
          </li>
          <li className={styles.listItem}>
            <span className={styles.listTitle}>Riesgo de ban</span>
            <span className={styles.listMeta}>
              whatsmeow no es la API oficial. Volumen bajo, pausas y un chip dedicado reducen el riesgo.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
