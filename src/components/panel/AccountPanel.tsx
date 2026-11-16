/**
 * Mi cuenta: datos del perfil de negocio (empresa, RUC, teléfono) y cierre de
 * sesión.
 *
 * El correo y el nombre los gestiona Neon Auth y no se editan aquí. El perfil
 * es la tabla `profiles`; `/api/auth/profile` solo actualiza los campos que
 * llegan, así que dejar un campo vacío no lo borra.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, LogOut, UserRound } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import type { Me } from '../../hooks/useSession';
import type { Suscripcion, SuscripcionResponse } from '../../lib/noticiasTypes';
import styles from '../../styles/PanelPage.module.css';

interface Props {
  me: Me;
  onSignOut: () => void | Promise<void>;
  onSave: () => void;
}

export default function AccountPanel({ me, onSignOut, onSave }: Props) {
  const [empresa, setEmpresa] = useState(me.profile?.empresa ?? '');
  const [ruc, setRuc] = useState(me.profile?.ruc ?? '');
  const [telefono, setTelefono] = useState(me.profile?.telefono ?? '');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Avisos del estudio (tabla `suscripciones`). El email viene marcado por
  // defecto para clientes existentes; WhatsApp exige número y consentimiento.
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [canalEmail, setCanalEmail] = useState(true);
  const [canalWhatsapp, setCanalWhatsapp] = useState(false);
  const [whatsapp, setWhatsapp] = useState(me.profile?.telefono ?? '');
  const [consentimiento, setConsentimiento] = useState(false);
  const [avisoStatus, setAvisoStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [avisoSaving, setAvisoSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<SuscripcionResponse>('/api/suscripcion');
      if (cancelled || !res.ok || !res.data) return;
      const sub = res.data.suscripcion;
      setSuscripcion(sub);
      setCanalEmail(sub ? sub.canal_email : true);
      setCanalWhatsapp(sub ? sub.canal_whatsapp : false);
      setWhatsapp(sub?.whatsapp ?? me.profile?.telefono ?? '');
      // No se premarca: si va a encender WhatsApp o reactivar la cuenta,
      // debe aceptarlo explícitamente en esta pantalla.
      setConsentimiento(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [me.profile?.telefono]);

  async function guardarAvisos(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAvisoStatus(null);

    if (canalWhatsapp && whatsapp.trim().length < 6) {
      setAvisoStatus({ kind: 'error', text: 'Escribe el número de WhatsApp con prefijo o 9 dígitos.' });
      return;
    }
    const requiereConsentimiento =
      (canalWhatsapp && !suscripcion?.canal_whatsapp) ||
      ((canalEmail || canalWhatsapp) && (!suscripcion || !suscripcion.activo));
    if (requiereConsentimiento && !consentimiento) {
      setAvisoStatus({
        kind: 'error',
        text: 'Marca la casilla de consentimiento para activar los avisos.',
      });
      return;
    }

    setAvisoSaving(true);
    const res = await apiSend<{ suscripcion: Suscripcion }>('/api/suscripcion', 'POST', {
      canal_email: canalEmail,
      canal_whatsapp: canalWhatsapp,
      whatsapp: whatsapp.trim(),
      consentimiento,
    });
    setAvisoSaving(false);

    if (res.ok && res.data?.suscripcion) {
      setSuscripcion(res.data.suscripcion);
      setAvisoStatus({ kind: 'ok', text: 'Preferencias de aviso guardadas.' });
    } else {
      setAvisoStatus({ kind: 'error', text: 'No se pudieron guardar los avisos. Revisa el número.' });
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);

    if (ruc && !/^\d{11}$/.test(ruc)) {
      setStatus({ kind: 'error', text: 'El RUC debe tener 11 dígitos.' });
      return;
    }

    setSaving(true);
    const res = await apiSend('/api/auth/profile', 'POST', {
      empresa: empresa.trim(),
      ruc,
      telefono: telefono.trim(),
    });
    setSaving(false);

    if (res.ok) {
      setStatus({ kind: 'ok', text: 'Datos guardados. Ya los tenemos actualizados.' });
      onSave();
    } else {
      setStatus({ kind: 'error', text: 'No se pudieron guardar los cambios. Inténtalo otra vez.' });
    }
  }

  const created = me.profile?.created_at
    ? new Date(me.profile.created_at).toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <UserRound size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>Mi cuenta</h1>
          <p className={styles.sectionLead}>
            Revisa tus datos de acceso y mantén actualizada la información de tu
            empresa.
          </p>
        </div>
      </header>

      <div className={styles.toolGrid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Acceso</h2>
          <dl className={styles.dataGrid}>
            <div>
              <dt className={styles.dataLabel}>Nombre</dt>
              <dd className={styles.dataValue}>{me.name || '—'}</dd>
            </div>
            <div>
              <dt className={styles.dataLabel}>Correo</dt>
              <dd className={styles.dataValue}>{me.email}</dd>
            </div>
            <div>
              <dt className={styles.dataLabel}>Cliente desde</dt>
              <dd className={styles.dataValue}>{created ?? '—'}</dd>
            </div>
          </dl>
          <p className={styles.panelNote}>
            El correo y la contraseña se cambian desde{' '}
            <Link className={styles.inlineLink} to="/recuperar">
              recuperar contraseña
            </Link>
            .
          </p>
          <button type="button" className={styles.dangerBtn} onClick={() => void onSignOut()}>
            <LogOut size={15} /> Cerrar sesión
          </button>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Datos de la empresa</h2>
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <label className={styles.field}>
              <span className={styles.label}>Empresa</span>
              <input
                type="text"
                className={styles.input}
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={saving}
                placeholder="Razón social o nombre comercial"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>RUC</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={11}
                className={styles.input}
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
                disabled={saving}
                placeholder="20123456789"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Teléfono</span>
              <input
                type="tel"
                className={styles.input}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={saving}
                placeholder="+51 999 999 999"
              />
            </label>

            {status && (
              <p
                role={status.kind === 'error' ? 'alert' : 'status'}
                className={`${styles.alert} ${status.kind === 'ok' ? styles.alertOk : ''}`}
              >
                {status.text}
              </p>
            )}

            <button type="submit" className={styles.primaryBtn} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar datos'}
            </button>
          </form>
        </section>
      </div>

      <section className={styles.panel}>
        <header className={styles.sectionHead} style={{ marginBottom: 6 }}>
          <span className={styles.sectionIcon}>
            <BellRing size={20} />
          </span>
          <div>
            <h2 className={styles.panelTitle}>Avisos del estudio</h2>
            <p className={styles.panelNote}>
              Avisos tributarios y novedades de SUNAT. No se comparte con terceros.
              {suscripcion && !suscripcion.activo && ' Ahora mismo estás dado de baja.'}
            </p>
          </div>
        </header>

        <form className={styles.form} onSubmit={guardarAvisos} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>
              <input
                type="checkbox"
                checked={canalEmail}
                onChange={(e) => setCanalEmail(e.target.checked)}
                disabled={avisoSaving}
              />{' '}
              Recibir por email en {me.email}
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              <input
                type="checkbox"
                checked={canalWhatsapp}
                onChange={(e) => setCanalWhatsapp(e.target.checked)}
                disabled={avisoSaving}
              />{' '}
              Recibir por WhatsApp
            </span>
          </label>

          {canalWhatsapp && (
            <label className={styles.field}>
              <span className={styles.label}>Número de WhatsApp</span>
              <input
                type="tel"
                className={styles.input}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                disabled={avisoSaving}
                placeholder="+51 999 999 999"
              />
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.label}>
              <input
                type="checkbox"
                checked={consentimiento}
                onChange={(e) => setConsentimiento(e.target.checked)}
                disabled={avisoSaving}
              />{' '}
              Acepto recibir avisos por los canales marcados
              {canalWhatsapp && whatsapp.trim() ? ` al número ${whatsapp.trim()}` : ''}.
            </span>
            <span className={styles.panelNote}>
              Puedes darte de baja cuando quieras. Guardamos la fecha de tu aceptación
              (Ley 29733).
            </span>
          </label>

          {avisoStatus && (
            <p
              role={avisoStatus.kind === 'error' ? 'alert' : 'status'}
              className={`${styles.alert} ${avisoStatus.kind === 'ok' ? styles.alertOk : ''}`}
            >
              {avisoStatus.text}
            </p>
          )}

          <button type="submit" className={styles.primaryBtn} disabled={avisoSaving}>
            {avisoSaving ? 'Guardando…' : 'Guardar avisos'}
          </button>
        </form>
      </section>
    </div>
  );
}
