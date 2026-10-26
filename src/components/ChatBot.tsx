import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Send, X } from 'lucide-react';
import { findReply, GREETING, type ChatLink, type ChatReply } from '../data/chatbot';
import useFocusTrap from '../hooks/useFocusTrap';
import { lockScroll } from '../lib/scrollLock';
import { prefersReducedMotion } from '../lib/gsap';
import LogoMark from './icons/LogoMark';
import styles from '../styles/ChatBot.module.css';

/**
 * Asistente virtual del sitio: burbuja fija en todas las páginas públicas.
 *
 * La conversación es 100 % cliente (ver src/data/chatbot.ts): sin API ni
 * modelo, el "pensar" y el tipeo palabra a palabra simulan una respuesta de
 * IA con temporizadores, y con `prefers-reduced-motion` el texto llega
 * completo de una vez.
 *
 * El componente vive montado en App.tsx, así que la conversación sobrevive a
 * los cambios de ruta y solo se pierde al recargar.
 */

interface ChatMsg {
  id: number;
  role: 'user' | 'bot';
  /** Lo que se ve en pantalla; crece durante el streaming */
  text: string;
  full: string;
  streaming: boolean;
  suggestions?: string[];
  links?: ChatLink[];
}

type Phase = 'idle' | 'thinking' | 'streaming';

/** Negritas delimitadas por ** — el resto del texto va tal cual */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState('');
  const [teaser, setTeaser] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const idRef = useRef(0);
  const greetedRef = useRef(false);
  const teaserRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const reduced = prefersReducedMotion();

  /** Guarda cada temporizador para poder cancelarlos todos al desmontar */
  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /* ---------- Cerrar: Escape, foco de vuelta al botón, scroll en móvil ---------- */

  const close = useCallback(() => setOpen(false), []);
  useFocusTrap(open, panelRef, close);

  /* El trap enfoca el primer elemento (cerrar); el chat se abre listo para
     escribir, así que este efecto va declarado después y gana. */
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  /* En pantallas chicas el panel es una hoja a pantalla completa: el fondo
     no debe desplazarse por debajo. */
  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia('(max-width: 640px)').matches) return;
    return lockScroll();
  }, [open]);

  /* ---------- Streaming ---------- */

  /** Escribe la respuesta de a palabras, con pausas en signos de puntuación */
  const streamWords = useCallback(
    (id: number, full: string) => {
      const words = full.split(' ');
      let i = 0;

      const tick = () => {
        i += 1;
        const shown = words.slice(0, i).join(' ');
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text: shown } : m))
        );

        if (i >= words.length) {
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, streaming: false } : m))
          );
          setAnnounce(full);
          setPhase('idle');
          return;
        }

        const last = words[i - 1];
        const pause = /[.!?:…]/.test(last) ? 160 : /[,;]/.test(last) ? 80 : 20 + Math.random() * 40;
        later(tick, pause);
      };

      later(tick, 220);
    },
    [later]
  );

  /** Simula "pensando" y luego emite la respuesta */
  const respond = useCallback(
    (reply: ChatReply) => {
      setPhase('thinking');
      const wait = reduced ? 0 : Math.min(1400, 550 + reply.text.length * 2.5);

      later(() => {
        const id = (idRef.current += 1);
        setMessages((prev) => [
          ...prev,
          {
            id,
            role: 'bot',
            text: reduced ? reply.text : '',
            full: reply.text,
            streaming: !reduced,
            suggestions: reply.suggestions,
            links: reply.links,
          },
        ]);

        if (reduced) {
          setAnnounce(reply.text);
          setPhase('idle');
          return;
        }

        setPhase('streaming');
        streamWords(id, reply.text);
      }, wait);
    },
    [later, reduced, streamWords]
  );

  /* Primera apertura: el asistente saluda solo */
  useEffect(() => {
    if (!open || greetedRef.current) return;
    greetedRef.current = true;
    respond(GREETING);
  }, [open, respond]);

  /* ---------- Sugerencia ("hola" de la burbuja) ---------- */
  useEffect(() => {
    if (open) {
      setTeaser(false);
      return;
    }
    if (teaserRef.current) return;
    const t = window.setTimeout(() => {
      teaserRef.current = true;
      setTeaser(true);
    }, 5000);
    return () => window.clearTimeout(t);
  }, [open]);

  /* ---------- Auto-scroll del hilo ---------- */
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, phase, open]);

  /* ---------- Envío ---------- */

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || phase !== 'idle') return;

      const id = (idRef.current += 1);
      setDraft('');
      setMessages((prev) => [
        ...prev,
        { id, role: 'user', text, full: text, streaming: false },
      ]);
      respond(findReply(text));
    },
    [phase, respond]
  );

  const busy = phase !== 'idle';

  return (
    <>
      {/* ---------- Panel de conversación ---------- */}
      {open && (
        <div
          className={styles.panel}
          id="chat-asistente"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Asistente virtual de Sánchez Delgado & Asociados"
        >
          <header className={styles.head}>
            <span className={styles.avatar}>
              <LogoMark size={26} />
            </span>
            <div className={styles.headText}>
              <strong>Asistente del estudio</strong>
              <span className={styles.status}>
                <span className={styles.dot} aria-hidden="true" />
                En línea · responde al instante
              </span>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Cerrar el chat"
            >
              <X size={19} />
            </button>
          </header>

          <div
            className={styles.log}
            ref={logRef}
            role="log"
            aria-label="Conversación con el asistente"
          >
            {messages.map((m) => {
              const isLast = m.id === messages[messages.length - 1]?.id;
              const showExtras = isLast && !m.streaming && !busy;
              return (
                <div key={m.id} className={styles.row}>
                  <div
                    className={`${styles.bubble} ${
                      m.role === 'user' ? styles.bubbleUser : styles.bubbleBot
                    }`}
                  >
                    <span className={styles.bubbleText}>
                      <Rich text={m.text} />
                      {m.streaming && <span className={styles.caret} aria-hidden="true" />}
                    </span>
                  </div>

                  {showExtras && m.links && (
                    <div className={styles.links}>
                      {m.links.map((l) => (
                        <Link key={l.to + l.label} to={l.to} className={styles.linkBtn}>
                          {l.label} <ArrowRight size={14} />
                        </Link>
                      ))}
                    </div>
                  )}

                  {showExtras && m.suggestions && (
                    <div className={styles.chips}>
                      {m.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={styles.chip}
                          onClick={() => send(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {phase === 'thinking' && (
              <div className={styles.row} aria-hidden="true">
                <div className={`${styles.bubble} ${styles.bubbleBot} ${styles.typing}`}>
                  <span className={styles.dotB} />
                  <span className={styles.dotB} />
                  <span className={styles.dotB} />
                </div>
              </div>
            )}
          </div>

          {/* El streaming actualiza el hilo en cada palabra: anunciarlo
              completo solo cuando la respuesta termina. */}
          {announce && (
            <span key={announce} className={styles.srOnly} aria-live="polite">
              {announce}
            </span>
          )}

          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              ref={inputRef}
              className={styles.input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={busy ? 'El asistente está escribiendo…' : 'Escribe tu consulta…'}
              aria-label="Escribe tu mensaje"
              autoComplete="off"
              enterKeyHint="send"
            />
            <button
              type="submit"
              className={styles.send}
              disabled={busy || !draft.trim()}
              aria-label="Enviar mensaje"
            >
              <Send size={17} />
            </button>
          </form>

          <p className={styles.note}>
            Respuestas informativas del asistente virtual; no reemplazan una asesoría formal.
          </p>
        </div>
      )}

      {/* ---------- Sugerencia emergente ---------- */}
      {teaser && !open && (
        <div className={styles.teaser} role="presentation">
          <button
            type="button"
            className={styles.teaserBtn}
            onClick={() => {
              setTeaser(false);
              setOpen(true);
            }}
          >
            👋 ¿Dudas con tu contabilidad? Escríbeme
          </button>
        </div>
      )}

      {/* ---------- Burbuja lanzadora ---------- */}
      <button
        type="button"
        ref={launcherRef}
        className={`${styles.launcher} ${open ? styles.launcherOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="chat-asistente"
        aria-label={open ? 'Cerrar el asistente virtual' : 'Abrir el asistente virtual'}
      >
        {open ? <X size={24} /> : <MessageCircle size={25} />}
      </button>
    </>
  );
}
