/**
 * Inicio del panel del cliente.
 *
 * No es una pantalla de métricas: resume qué hay disponible en la cuenta,
 * muestra los datos de perfil que el estudio usa para atenderlo y lleva a
 * cada sección con un clic.
 */

import { useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Calculator,
  BookMarked,
  ShieldCheck,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { apiGet } from '../../lib/api';
import type { Me } from '../../hooks/useSession';
import type { PanelTab } from './tabs';
import styles from '../../styles/PanelPage.module.css';

interface Props {
  me: Me;
  onNavigate: (tab: PanelTab) => void;
}

const SHORTCUTS = [
  {
    tab: 'biblioteca' as const,
    icon: BookOpen,
    title: 'Biblioteca',
    text: 'Guías, formatos y documentos publicados por el estudio.',
  },
  {
    tab: 'calendario' as const,
    icon: CalendarDays,
    title: 'Calendario',
    text: 'Tus vencimientos SUNAT según el último dígito de tu RUC.',
  },
  {
    tab: 'herramientas' as const,
    icon: Calculator,
    title: 'Herramientas',
    text: 'Tipo de cambio, comparador de regímenes y calculadora de multas.',
  },
  {
    tab: 'guia' as const,
    icon: BookMarked,
    title: 'Guía y glosario',
    text: 'Actualidad tributaria y los términos de cada mes, sin tecnicismos.',
  },
];

export default function OverviewPanel({ me, onNavigate }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await apiGet<{ resources: unknown[] }>('/api/resources');
      if (!cancelled && res.ok && res.data) setCount(res.data.resources.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = (me.name || me.email).split(' ')[0];

  return (
    <div className={styles.stack}>
      <section className={styles.hero}>
        <span className={styles.heroEyebrow}>Tu espacio de trabajo</span>
        <h1 className={styles.heroTitle}>Hola, {firstName}</h1>
        <p className={styles.heroText}>
          Aquí tienes las herramientas y el material del estudio en un solo
          lugar. Todo lo que publicamos queda disponible en tu cuenta.
        </p>
        <div className={styles.heroBadges}>
          <span className={styles.pill}>
            <ShieldCheck size={14} /> Cuenta activa
          </span>
          {me.profile?.empresa && (
            <span className={styles.pillNeutral}>
              <Building2 size={14} /> {me.profile.empresa}
            </span>
          )}
          {count !== null && (
            <span className={styles.pillNeutral}>
              <BookOpen size={14} /> {count} {count === 1 ? 'recurso publicado' : 'recursos publicados'}
            </span>
          )}
        </div>
      </section>

      <div className={styles.shortcutGrid}>
        {SHORTCUTS.map(({ tab, icon: Icon, title, text }) => (
          <button
            key={tab}
            type="button"
            className={styles.shortcut}
            onClick={() => onNavigate(tab)}
          >
            <span className={styles.shortcutIcon}>
              <Icon size={22} />
            </span>
            <span className={styles.shortcutTitle}>{title}</span>
            <span className={styles.shortcutText}>{text}</span>
            <span className={styles.shortcutLink}>
              Abrir <ArrowRight size={14} />
            </span>
          </button>
        ))}
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Datos de tu cuenta</h2>
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
            <dt className={styles.dataLabel}>Empresa</dt>
            <dd className={styles.dataValue}>{me.profile?.empresa || 'Sin registrar'}</dd>
          </div>
          <div>
            <dt className={styles.dataLabel}>RUC</dt>
            <dd className={styles.dataValue}>{me.profile?.ruc || 'Sin registrar'}</dd>
          </div>
        </dl>
        <p className={styles.panelNote}>
          ¿Falta algún dato?{' '}
          <button type="button" className={styles.inlineLink} onClick={() => onNavigate('cuenta')}>
            Actualiza tu perfil
          </button>{' '}
          para que podamos preparar tus declaraciones con la información correcta.
        </p>
      </section>
    </div>
  );
}
