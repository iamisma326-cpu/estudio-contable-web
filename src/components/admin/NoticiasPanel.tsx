/**
 * Noticias del estudio: editor, publicación y envío.
 *
 * El detector de SUNAT solo crea BORRADORES. Desde aquí un humano corrige el
 * título y el resumen, publica y decide a quién y por qué canal se envía.
 * Nada sale sin esta decisión: no hay envío automático ni digest programado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, Eye, Mail, MessageCircle, Newspaper, Pencil, Send } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import type {
  CanalAviso,
  EnviosResponse,
  EnviarResponse,
  Noticia,
  NoticiasResponse,
} from '../../lib/noticiasTypes';
import styles from '../../styles/AdminPage.module.css';

interface FormState {
  titulo: string;
  resumen: string;
  cuerpo: string;
  categoria: string;
  fuente_url: string;
  estado: 'borrador' | 'publicada' | 'archivada';
}

const EMPTY_FORM: FormState = {
  titulo: '',
  resumen: '',
  cuerpo: '',
  categoria: 'sunat',
  fuente_url: '',
  estado: 'borrador',
};

const CATEGORIAS = [
  { value: 'sunat', label: 'SUNAT' },
  { value: 'tributario', label: 'Tributario' },
  { value: 'laboral', label: 'Laboral' },
  { value: 'estudio', label: 'Estudio' },
];

function formatFecha(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function etiquetaEstado(estado: Noticia['estado']): string {
  if (estado === 'publicada') return 'Publicada';
  if (estado === 'archivada') return 'Archivada';
  return 'Borrador';
}

export default function NoticiasPanel() {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [envios, setEnvios] = useState<EnviosResponse | null>(null);
  const [filtro, setFiltro] = useState<'todas' | Noticia['estado']>('todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [vista, setVista] = useState<'email' | 'whatsapp'>('email');
  const [canales, setCanales] = useState<Record<CanalAviso, boolean>>({
    email: true,
    whatsapp: true,
  });
  const [soloMi, setSoloMi] = useState(false);

  const load = useCallback(async () => {
    const [news, env] = await Promise.all([
      apiGet<NoticiasResponse>('/api/admin/noticias'),
      apiGet<EnviosResponse>('/api/admin/envios'),
    ]);
    if (news.ok && news.data) setNoticias(news.data.noticias);
    else setError('No se pudieron cargar las noticias.');
    if (env.ok && env.data) setEnvios(env.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resumenPorNoticia = useMemo(() => {
    const map = new Map<string, { enviados: number; pendientes: number; fallidos: number }>();
    for (const e of envios?.resumen ?? []) map.set(e.noticia_id, e);
    return map;
  }, [envios]);

  const visibles = useMemo(
    () => (filtro === 'todas' ? noticias : noticias.filter((n) => n.estado === filtro)),
    [noticias, filtro]
  );

  const canalesElegidos = (Object.keys(canales) as CanalAviso[]).filter((c) => canales[c]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setError(null);
    setAviso(null);
    setVista('email');
  }

  function openEdit(noticia: Noticia) {
    setEditingId(noticia.id);
    setForm({
      titulo: noticia.titulo,
      resumen: noticia.resumen,
      cuerpo: noticia.cuerpo,
      categoria: noticia.categoria,
      fuente_url: noticia.fuente_url ?? '',
      estado: noticia.estado,
    });
    setFormOpen(true);
    setError(null);
    setAviso(null);
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAviso(null);

    if (form.titulo.trim().length < 5) {
      setError('El título debe tener al menos 5 caracteres.');
      return;
    }

    setBusy('guardar');
    const payload = {
      titulo: form.titulo.trim(),
      resumen: form.resumen.trim(),
      cuerpo: form.cuerpo,
      categoria: form.categoria,
      fuente_url: form.fuente_url.trim(),
      estado: form.estado,
    };

    const res = editingId
      ? await apiSend<{ noticia: Noticia }>('/api/admin/noticias', 'PATCH', {
          id: editingId,
          ...payload,
        })
      : await apiSend<{ noticia: Noticia }>('/api/admin/noticias', 'POST', payload);

    setBusy(null);
    if (!res.ok) {
      setError('No se pudo guardar. Revisa los campos e inténtalo otra vez.');
      return;
    }
    setAviso(
      editingId
        ? 'Noticia actualizada.'
        : form.estado === 'publicada'
          ? 'Noticia creada y publicada.'
          : 'Borrador creado.'
    );
    setFormOpen(false);
    setEditingId(null);
    await load();
  }

  async function cambiarEstado(noticia: Noticia, estado: Noticia['estado']) {
    setBusy(noticia.id);
    setError(null);
    setAviso(null);
    const res = await apiSend('/api/admin/noticias', 'PATCH', { id: noticia.id, estado });
    setBusy(null);
    if (!res.ok) {
      setError('No se pudo cambiar el estado de la noticia.');
      return;
    }
    setAviso(estado === 'publicada' ? 'Noticia publicada. Ya aparece en el panel.' : 'Noticia archivada.');
    await load();
  }

  async function enviar(noticia: Noticia, opciones: { soloMi: boolean; modo: 'ahora' | 'cola' }) {
    if (!canalesElegidos.length) {
      setError('Elige al menos un canal (email o WhatsApp).');
      return;
    }

    setBusy(noticia.id);
    setError(null);
    setAviso(null);

    // «Publicar y enviar ahora» publica primero. La prueba «solo a mí» no
    // publica nada: exige que la noticia ya esté publicada.
    if (noticia.estado !== 'publicada') {
      if (opciones.soloMi) {
        setBusy(null);
        setError('Publica la noticia antes de enviarte la prueba.');
        return;
      }
      const publicada = await apiSend('/api/admin/noticias', 'PATCH', {
        id: noticia.id,
        estado: 'publicada',
      });
      if (!publicada.ok) {
        setBusy(null);
        setError('No se pudo publicar la noticia; no se envió nada.');
        return;
      }
    }

    const res = await apiSend<EnviarResponse>('/api/admin/noticias/enviar', 'POST', {
      id: noticia.id,
      canales: canalesElegidos,
      modo: opciones.modo,
      soloMi: opciones.soloMi,
    });
    setBusy(null);

    if (!res.ok || !res.data?.ok) {
      setError(res.data?.detail || res.data?.error || 'No se pudo encolar el envío.');
      return;
    }
    if (res.data.aviso) {
      setAviso(res.data.aviso);
    } else if (res.data.enviados) {
      const r = res.data.enviados;
      setAviso(
        `Enviados: ${r.enviados}. Fallidos: ${r.fallidos}. Pendientes de reintento: ${r.errores.length}.`
      );
    } else {
      setAviso(`Encolados ${res.data.encolados ?? 0} envíos. El cron los procesará en la próxima pasada.`);
    }
    await load();
  }

  const previewAsunto = `SUNAT · ${form.titulo || 'Título de la noticia'}`;
  const previewCuerpo =
    vista === 'email'
      ? `${form.resumen || 'Resumen para el correo.'}\n\nLeer más →\n\nEste mensaje es informativo y no reemplaza una consulta con tu contador.\nDarse de baja`
      : `*${form.titulo || 'Título de la noticia'}*\n${form.resumen || 'Resumen para WhatsApp.'}\n\nFuente: sunat.gob.pe\nResponde BAJA para no recibir más.`;

  if (loading) return <p className={styles.muted}>Cargando noticias…</p>;

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <Newspaper size={22} />
        </span>
        <div>
          <h1 className={styles.sectionTitle}>Noticias y avisos</h1>
          <p className={styles.sectionLead}>
            Corrige la noticia y pulsa «Publicar y enviar ahora». Sale a todos los
            clientes que aceptaron recibir avisos, por email y WhatsApp. No hay
            envíos automáticos.
          </p>
        </div>
      </header>

      {error && <p role="alert" className={styles.alert}>{error}</p>}
      {aviso && <p role="status" className={styles.success}>{aviso}</p>}

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {(['todas', 'borrador', 'publicada', 'archivada'] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              className={`${styles.miniBtn} ${filtro === opcion ? styles.tabActive : ''}`}
              onClick={() => setFiltro(opcion)}
            >
              {opcion === 'todas' ? 'Todas' : etiquetaEstado(opcion)}
            </button>
          ))}
        </div>
        <button type="button" className={styles.primaryBtn} onClick={openCreate}>
          Nueva noticia
        </button>
      </div>

      {formOpen && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{editingId ? 'Editar noticia' : 'Nueva noticia'}</h2>
          <form className={styles.form} onSubmit={guardar} noValidate>
            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.label}>Título</span>
                <input
                  className={styles.input}
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Cronograma 2027 ya está publicado"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Categoría</span>
                <select
                  className={styles.select}
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>Resumen (lo que se envía)</span>
              <textarea
                className={styles.input}
                rows={3}
                value={form.resumen}
                onChange={(e) => setForm({ ...form, resumen: e.target.value })}
                placeholder="Una o dos frases con lo esencial."
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Cuerpo (para el panel)</span>
              <textarea
                className={styles.input}
                rows={5}
                value={form.cuerpo}
                onChange={(e) => setForm({ ...form, cuerpo: e.target.value })}
                placeholder="Detalle, enlaces o instrucciones."
              />
            </label>

            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.label}>Enlace a la fuente</span>
                <input
                  className={styles.input}
                  value={form.fuente_url}
                  onChange={(e) => setForm({ ...form, fuente_url: e.target.value })}
                  placeholder="https://www.sunat.gob.pe/…"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Estado</span>
                <select
                  className={styles.select}
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value as FormState['estado'] })}
                >
                  <option value="borrador">Borrador</option>
                  <option value="publicada">Publicada</option>
                  <option value="archivada">Archivada</option>
                </select>
              </label>
            </div>

            <div>
              <p className={styles.label}>Vista previa</p>
              <div className={styles.filters}>
                <button
                  type="button"
                  className={`${styles.miniBtn} ${vista === 'email' ? styles.tabActive : ''}`}
                  onClick={() => setVista('email')}
                >
                  <Mail size={14} /> Email
                </button>
                <button
                  type="button"
                  className={`${styles.miniBtn} ${vista === 'whatsapp' ? styles.tabActive : ''}`}
                  onClick={() => setVista('whatsapp')}
                >
                  <MessageCircle size={14} /> WhatsApp
                </button>
              </div>
              <div className={styles.previewBox}>
                {vista === 'email' && <p className={styles.previewSubject}>{previewAsunto}</p>}
                <pre className={styles.previewText}>{previewCuerpo}</pre>
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="submit" className={styles.primaryBtn} disabled={busy === 'guardar'}>
                {busy === 'guardar' ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => {
                  setFormOpen(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <h2 className={styles.panelTitle}>Canales del próximo envío</h2>
          <div className={styles.filters}>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={canales.email}
                onChange={(e) => setCanales({ ...canales, email: e.target.checked })}
              />
              Email
            </label>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={canales.whatsapp}
                onChange={(e) => setCanales({ ...canales, whatsapp: e.target.checked })}
              />
              WhatsApp
            </label>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={soloMi}
                onChange={(e) => setSoloMi(e.target.checked)}
              />
              Enviar solo a mí
            </label>
          </div>
        </div>

        <p className={styles.muted}>
          Se envía solo a quienes aceptaron en el registro. WhatsApp requiere que el
          número del estudio esté vinculado en la pestaña «WhatsApp».
        </p>

        {visibles.length === 0 ? (
          <p className={styles.muted}>No hay noticias con ese filtro.</p>
        ) : (
          <div className={styles.noticeList}>
            {visibles.map((noticia) => {
              const r = resumenPorNoticia.get(noticia.id);
              return (
                <article key={noticia.id} className={styles.notice}>
                  <div className={styles.noticeHeader}>
                    <div>
                      <span className={`${styles.badge} ${noticia.estado === 'publicada' ? '' : styles.badgeNeutral}`}>
                        {etiquetaEstado(noticia.estado)}
                      </span>
                      <span className={styles.cellSub}> · {noticia.categoria} · {formatFecha(noticia.publicada_en)}</span>
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.miniBtn} onClick={() => openEdit(noticia)}>
                        <Pencil size={14} /> Editar
                      </button>
                      {noticia.estado !== 'publicada' && (
                        <button
                          type="button"
                          className={styles.miniBtn}
                          disabled={busy === noticia.id}
                          onClick={() => void cambiarEstado(noticia, 'publicada')}
                        >
                          <Eye size={14} /> Publicar
                        </button>
                      )}
                      {noticia.estado !== 'archivada' && (
                        <button
                          type="button"
                          className={styles.miniBtnDanger}
                          disabled={busy === noticia.id}
                          onClick={() => void cambiarEstado(noticia, 'archivada')}
                        >
                          <Archive size={14} /> Archivar
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className={styles.noticeTitle}>{noticia.titulo}</h3>
                  <p className={styles.noticeText}>{noticia.resumen || 'Sin resumen todavía.'}</p>
                  {noticia.fuente_url && (
                    <p className={styles.cellSub}>
                      Fuente: <a className={styles.inlineLink} href={noticia.fuente_url} target="_blank" rel="noreferrer">{noticia.fuente_url}</a>
                    </p>
                  )}

                  <div className={styles.noticeFooter}>
                    <span className={styles.cellSub}>
                      {r
                        ? `Enviados ${r.enviados} · Pendientes ${r.pendientes} · Fallidos ${r.fallidos}`
                        : 'Sin envíos todavía'}
                    </span>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        disabled={(soloMi && noticia.estado !== 'publicada') || busy === noticia.id}
                        onClick={() => void enviar(noticia, { soloMi, modo: 'ahora' })}
                      >
                        <Send size={14} /> {soloMi ? 'Enviar solo a mí' : 'Publicar y enviar ahora'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
