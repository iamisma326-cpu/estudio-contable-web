/**
 * Router único de /api/*.
 *
 * Por qué existe: el plan Hobby de Vercel limita a 12 Serverless Functions
 * por deployment, y cada archivo suelto bajo `api/` cuenta como una. Ya
 * estábamos en 12 exactas, así que no entraba ni una ruta nueva — y el módulo
 * de comprobantes necesita varias.
 *
 * Con un archivo catch-all `api/[...ruta].ts` tenemos UNA sola función para
 * toda la API y las URLs no cambian: /api/tipo-cambio sigue siendo
 * /api/tipo-cambio.
 *
 * Los handlers viven en `api/_rutas/` con el mismo árbol que tenían. El guion
 * bajo es deliberado: Vercel no publica como endpoint nada que empiece por `_`,
 * así que no vuelven a contarse como funciones.
 *
 * Registro: si añades una ruta nueva, suéltala en RUTAS. Si se te olvida,
 * responde 404 — no se cae nada más.
 */

import type { ReqLike, ResLike } from './_auth/http.js';

import tipoCambio from './_rutas/tipo-cambio.js';
import cronograma from './_rutas/cronograma.js';
import rentaAnual from './_rutas/renta-anual.js';
import authMe from './_rutas/auth/me.js';
import authProfile from './_rutas/auth/profile.js';
import resources from './_rutas/resources.js';
import adminStats from './_rutas/admin/stats.js';
import adminUsers from './_rutas/admin/users.js';
import adminResources from './_rutas/admin/resources.js';
import adminResourceFile from './_rutas/admin/resource-file.js';
import pdfEdit from './_rutas/pdf-edit.js';
import pdfRender from './_rutas/pdf-render.js';
import comprobantes from './_rutas/comprobantes.js';
import clientes from './_rutas/clientes.js';
import ple from './_rutas/ple.js';
import liquidacion from './_rutas/liquidacion.js';
import libro from './_rutas/libro.js';
import rentaEjercicio from './_rutas/renta-ejercicio.js';
import noticias from './_rutas/noticias.js';
import suscripcion from './_rutas/suscripcion.js';
import baja from './_rutas/baja.js';
import adminNoticias from './_rutas/admin/noticias.js';
import adminNoticiasEnviar from './_rutas/admin/noticias-enviar.js';
import adminEnvios from './_rutas/admin/envios.js';
import adminWhatsapp from './_rutas/admin/whatsapp.js';
import cronNoticias from './_rutas/cron/noticias.js';

/** Handler con la firma que ya usan todos los archivos de api/_rutas/. */
type Handler = (req: ReqLike, res: ResLike) => Promise<void>;

/**
 * Tabla de rutas: clave = path sin el prefijo /api/ ni la barra inicial.
 * El orden no importa (no hay comodines), pero se mantiene agrupado por área.
 */
const RUTAS: Record<string, Handler> = {
  'tipo-cambio': tipoCambio,
  cronograma,
  'renta-anual': rentaAnual,
  'auth/me': authMe,
  'auth/profile': authProfile,
  resources,
  'admin/stats': adminStats,
  'admin/users': adminUsers,
  'admin/resources': adminResources,
  'admin/resource-file': adminResourceFile,
  'pdf-edit': pdfEdit,
  'pdf-render': pdfRender,
  comprobantes,
  clientes,
  periodos: clientes,
  ple,
  liquidacion,
  libro,
  // 'renta-anual' ya sirve el cronograma de SUNAT; este calcula el impuesto
  // del ejercicio desde los comprobantes y lo que aporta el contador.
  'renta-ejercicio': rentaEjercicio,
  // Noticias y avisos automáticos (docs/PLAN-NOTICIAS.md)
  noticias,
  suscripcion,
  baja,
  'admin/noticias': adminNoticias,
  'admin/noticias/enviar': adminNoticiasEnviar,
  'admin/envios': adminEnvios,
  'admin/whatsapp/estado': adminWhatsapp,
  'admin/whatsapp/vincular': adminWhatsapp,
  'admin/whatsapp/desvincular': adminWhatsapp,
  'cron/noticias': cronNoticias,
};

/**
 * Normaliza el path que manda Vercel en la función catch-all.
 *
 * Vercel entrega el segmento capturado en `req.query.ruta` como array
 * (['auth','me']), y a veces también llega la URL completa. Se cubren las dos
 * formas porque el shape cambia entre `vercel dev` y el runtime real.
 */
function rutaPedida(req: ReqLike): string | null {
  // 1) Catch-all de Vercel: req.query.ruta = ['auth','me'] | 'auth/me'
  const capturado = req.query?.ruta;
  if (Array.isArray(capturado)) {
    return capturado.filter((s) => typeof s === 'string').join('/');
  }
  if (typeof capturado === 'string' && capturado) {
    return capturado.replace(/^\/+|\/+$/g, '');
  }

  // 2) Fallback por URL. Dos shapes según el entorno:
  //    - Vercel: url completa "/api/auth/me?..."
  //    - Dev (Connect monta en /api): url relativa "/auth/me?..."
  const raw = req.url ?? '';
  const sinQuery = raw.split('?')[0] ?? '';
  if (!sinQuery) return null;
  const idx = sinQuery.indexOf('/api/');
  if (idx !== -1) return sinQuery.slice(idx + '/api/'.length).replace(/^\/+|\/+$/g, '');
  return sinQuery.replace(/^\/+|\/+$/g, '');
}

/** Quita la barra final: /api/auth/me/ == /api/auth/me */
function normalizar(ruta: string): string {
  return ruta.replace(/\/+$/, '');
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  const ruta = rutaPedida(req);

  if (!ruta) {
    res.status(404).json({ ok: false, error: 'not_found' });
    return;
  }

  const destino = RUTAS[normalizar(ruta)];
  // El handler de clientes atiende dos recursos; se le dice cuál sin mirar la URL.
  const nombre = normalizar(ruta);
  (req as ReqLike & { _recurso?: string })._recurso = nombre;

  if (!destino) {
    // Una ruta olvidada en RUTAS se nota aquí, no se cae el resto de la API.
    res.status(404).json({ ok: false, error: 'not_found', ruta: normalizar(ruta) });
    return;
  }

  await destino(req, res);
}
