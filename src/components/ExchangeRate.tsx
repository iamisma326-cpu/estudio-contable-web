import { useEffect, useState } from 'react';
import styles from '../styles/ExchangeRate.module.css';

interface RateData {
  fecha: string;
  compra: number;
  venta: number;
}

type Status = 'loading' | 'ok' | 'error';

/**
 * Tipo de cambio referencial SUNAT (USD → PEN).
 *
 * Lee /api/tipo-cambio — la serverless de Vercel que hace proxy del
 * .txt oficial de SUNAT (que no se puede consumir directo desde el
 * navegador por CORS). Si falla, muestra un estado discreto con enlace
 * a la fuente oficial; nunca inventa un número.
 */
export default function ExchangeRate() {
  const [data, setData] = useState<RateData | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/tipo-cambio')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: RateData) => {
        if (cancelled) return;
        setData(json);
        setStatus('ok');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.tag}>Oficial SUNAT</span>
        <span className={styles.pair}>USD → PEN</span>
      </div>

      {status === 'loading' && <div className={styles.skeleton} aria-hidden="true" />}

      {status === 'error' && (
        <p className={styles.error}>
          Tipo de cambio no disponible ahora.{' '}
          <a href="https://www.sunat.gob.pe/a/txt/tipoCambio.txt" target="_blank" rel="noreferrer">
            Ver en SUNAT
          </a>
        </p>
      )}

      {status === 'ok' && data && (
        <>
          <div className={styles.values}>
            <div className={styles.value}>
              <span className={styles.valueLabel}>Compra</span>
              <strong>S/ {data.compra.toFixed(3)}</strong>
            </div>
            <div className={styles.value}>
              <span className={styles.valueLabel}>Venta</span>
              <strong>S/ {data.venta.toFixed(3)}</strong>
            </div>
          </div>
          <p className={styles.date}>
            Cotización del {data.fecha.split('-').reverse().join('/')}
          </p>
        </>
      )}
    </div>
  );
}
