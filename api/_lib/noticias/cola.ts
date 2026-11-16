/**
 * Cola de envíos: la única salida hacia email y WhatsApp.
 *
 * Por qué una cola y no envíos directos: el cron puede reintentar sin
 * duplicar (UNIQUE noticia_id + user_id + canal) y el botón del admin usa
 * exactamente el mismo camino que el digest del lunes.
 *
 * `lote` agrupa varias noticias en UN mensaje. Sin él, un digest con tres
 * noticias serían tres correos a la misma persona.
 */

import { randomUUID } from 'node:crypto';
import { query, queryOne } from '../../_db/db.js';
import { enviarEmail } from './email.js';
import { enviarWhatsapp } from './whatsapp.js';
import { construirEmail, construirWhatsapp } from './plantillas.js';
import { redactarApertura } from './redaccion.js';
import { mensajeError, type Canal, type Noticia } from './comun.js';

const MAX_INTENTOS = 5;
const PAUSA_EMAIL_MS = 200;
const PAUSA_WHATSAPP_MS = 1000;
const LIMITE_POR_EJECUCION = 200;

interface SuscripcionRow {
  user_id: string;
  email_pref: string | null;
  whatsapp: string | null;
  canal_email: boolean;
  canal_whatsapp: boolean;
  user_email: string | null;
  user_name: string | null;
  user_banned: boolean | null;
  baja_token: string;
}

interface EnvioPendienteRow {
  id: string;
  noticia_id: string;
  user_id: string;
  canal: Canal;
  destino: string;
  lote: string | null;
  prueba: boolean;
  slug: string;
  titulo: string;
  resumen: string;
  cuerpo: string;
  categoria: string;
  fuente: string;
  fuente_url: string | null;
  estado: string;
  publicada_en: string | null;
  created_at: string;
  updated_at: string;
  baja_token: string | null;
}

export interface ResultadoEnvio {
  grupos: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
  errores: { canal: Canal; destino: string; error: string }[];
}

interface OpcionesEnvio {
  lote?: string;
  soloMi?: boolean;
  admin?: { id: string; email: string };
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canalValido(value: unknown): value is Canal {
  return value === 'email' || value === 'whatsapp';
}

/** Suscripciones activas con su email y nombre desde Neon Auth. */
async function suscripcionesActivas(): Promise<SuscripcionRow[]> {
  return query<SuscripcionRow>(
    `SELECT s.user_id,
            s.email       AS email_pref,
            s.whatsapp,
            s.canal_email,
            s.canal_whatsapp,
            u.email       AS user_email,
            u.name        AS user_name,
            u.banned      AS user_banned,
            s.baja_token::text AS baja_token
       FROM public.suscripciones s
       LEFT JOIN neon_auth."user" u ON u.id = s.user_id
      WHERE s.activo = true
      ORDER BY s.created_at`
  );
}

/**
 * Encola una o más noticias publicadas para los destinatarios que
 * correspondan. Las filas duplicadas se ignoran (ON CONFLICT DO NOTHING).
 */
export async function encolarNoticias(
  noticiaIds: string[],
  canales: Canal[],
  opciones: OpcionesEnvio = {}
): Promise<{ lote: string; filas: number; destinatarios: number }> {
  const lote = opciones.lote || randomUUID();
  const canalesValidos = Array.from(new Set(canales.filter(canalValido)));
  if (!canalesValidos.length) return { lote, filas: 0, destinatarios: 0 };
  // Sin el admin explícito, «solo a mí» no debe degradar a un envío masivo.
  if (opciones.soloMi && !opciones.admin) return { lote, filas: 0, destinatarios: 0 };

  const noticias = await query<{ id: string }>(
    `SELECT id FROM public.noticias
      WHERE id = ANY($1::uuid[]) AND estado = 'publicada'`,
    [noticiaIds]
  );
  if (!noticias.length) return { lote, filas: 0, destinatarios: 0 };

  let destinatarios: {
    user_id: string;
    email: string | null;
    whatsapp: string | null;
    baja_token: string | null;
  }[] = [];

  if (opciones.soloMi && opciones.admin) {
    const sub = await queryOne<{
      whatsapp: string | null;
      email: string | null;
      canal_whatsapp: boolean;
      baja_token: string;
    }>(
      `SELECT whatsapp, email, canal_whatsapp, baja_token::text AS baja_token
         FROM public.suscripciones WHERE user_id = $1 LIMIT 1`,
      [opciones.admin.id]
    );
    // EMAIL_TEST_TO permite que «Enviar solo a mí» llegue a la bandeja que
    // se está usando en la demo, sin cambiar el correo real de la cuenta
    // admin ni escribirle a ningún cliente.
    const destinoPrueba = process.env.EMAIL_TEST_TO?.trim();
    destinatarios = [
      {
        user_id: opciones.admin.id,
        email: destinoPrueba || sub?.email || opciones.admin.email,
        // «Solo a mí» también respeta el opt-in de WhatsApp: tener teléfono
        // en el perfil no es consentimiento para escribir por ese canal.
        whatsapp: sub?.canal_whatsapp ? sub.whatsapp : null,
        baja_token: sub?.baja_token || null,
      },
    ];
  } else {
    const subs = await suscripcionesActivas();
    destinatarios = subs
      .filter((s) => s.user_banned !== true)
      .map((s) => ({
        user_id: s.user_id,
        email: s.canal_email ? s.email_pref || s.user_email : null,
        whatsapp: s.canal_whatsapp ? s.whatsapp : null,
        baja_token: s.baja_token,
      }));
  }

  let filas = 0;
  let alcanzados = 0;

  for (const destino of destinatarios) {
    let tocado = false;
    for (const noticia of noticias) {
      for (const canal of canalesValidos) {
        const address = canal === 'email' ? destino.email : destino.whatsapp;
        if (!address) continue;

        const inserted = await query<{ id: string }>(
          `INSERT INTO public.envios (noticia_id, user_id, canal, destino, lote, prueba)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (noticia_id, user_id, canal) DO NOTHING
           RETURNING id`,
          [noticia.id, destino.user_id, canal, address, lote, Boolean(opciones.soloMi)]
        );
        if (inserted.length) {
          filas += 1;
          tocado = true;
        }
      }
    }
    if (tocado) alcanzados += 1;
  }

  return { lote, filas, destinatarios: alcanzados };
}

function aNoticia(row: EnvioPendienteRow): Noticia {
  return {
    id: row.noticia_id,
    slug: row.slug,
    titulo: row.titulo,
    resumen: row.resumen,
    cuerpo: row.cuerpo,
    categoria: row.categoria,
    fuente: row.fuente,
    fuente_url: row.fuente_url,
    estado: row.estado as Noticia['estado'],
    publicada_en: row.publicada_en,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function agrupar(rows: EnvioPendienteRow[]): Map<string, EnvioPendienteRow[]> {
  const grupos = new Map<string, EnvioPendienteRow[]>();
  for (const row of rows) {
    // Sin lote, cada noticia es un mensaje propio. Con lote, todas las
    // noticias del mismo lote viajan juntas en un solo mensaje.
    const clave = `${row.user_id}|${row.canal}|${row.lote ?? `envio-${row.id}`}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(row);
    else grupos.set(clave, [row]);
  }
  return grupos;
}

/**
 * Procesa filas pendientes. Se puede limitar a un lote concreto (botón
 * «enviar ahora») o procesar todo (cron y reintentos).
 */
export async function procesarEnvios(opciones: {
  lote?: string;
  limite?: number;
} = {}): Promise<ResultadoEnvio> {
  // Si una noticia se archivó después de encolarse, no debe salir. Se marca
  // la fila como omitida para que no vuelva a aparecer en cada cron.
  const omitidasPorEstado = await query<{ id: string }>(
    `UPDATE public.envios e
        SET estado = 'omitido',
            error = 'La noticia ya no está publicada.'
       FROM public.noticias n
      WHERE e.noticia_id = n.id
        AND e.estado = 'pendiente'
        AND n.estado <> 'publicada'
      RETURNING e.id`
  );

  // Si el cliente se dio de baja o apagó el canal después de encolar, no se
  // le escribe aunque la fila ya existiera. Los envíos de prueba («solo a
  // mí») quedan fuera: son una acción manual del admin, no una suscripción.
  const omitidasPorSuscripcion = await query<{ id: string }>(
    `UPDATE public.envios e
        SET estado = 'omitido',
            error = 'El destinatario ya no tiene ese canal activo.'
       FROM public.suscripciones s
      WHERE e.user_id = s.user_id
        AND e.estado = 'pendiente'
        AND e.prueba = false
        AND (s.activo = false
             OR (e.canal = 'email' AND s.canal_email = false)
             OR (e.canal = 'whatsapp' AND s.canal_whatsapp = false))
      RETURNING e.id`
  );

  const limite = Math.min(opciones.limite ?? LIMITE_POR_EJECUCION, LIMITE_POR_EJECUCION);
  const params: unknown[] = [];
  let filtroLote = '';
  if (opciones.lote) {
    params.push(opciones.lote);
    filtroLote = `AND e.lote = $${params.length}::uuid`;
  }
  params.push(limite);

  const pendientes = await query<EnvioPendienteRow>(
    `SELECT e.id::text,
            e.noticia_id,
            e.user_id,
            e.canal,
            e.destino,
            e.lote::text,
            e.prueba,
            n.slug, n.titulo, n.resumen, n.cuerpo, n.categoria, n.fuente,
            n.fuente_url, n.estado, n.publicada_en, n.created_at, n.updated_at,
            s.baja_token::text AS baja_token
       FROM public.envios e
       JOIN public.noticias n ON n.id = e.noticia_id
       LEFT JOIN public.suscripciones s ON s.user_id = e.user_id
      WHERE e.estado = 'pendiente'
        AND e.intentos < ${MAX_INTENTOS}
        ${filtroLote}
      ORDER BY e.created_at, n.publicada_en NULLS LAST
      LIMIT $${params.length}`,
    params
  );

  const resultado: ResultadoEnvio = {
    grupos: 0,
    enviados: 0,
    fallidos: 0,
    omitidos: omitidasPorEstado.length + omitidasPorSuscripcion.length,
    errores: [],
  };
  if (!pendientes.length) return resultado;

  const grupos = agrupar(pendientes);
  resultado.grupos = grupos.size;

  // Una sola llamada al modelo por lote, no por destinatario.
  const aperturas = new Map<string, string | null>();
  const lotesConVarias = new Set(
    pendientes.filter((r) => r.lote).map((r) => r.lote as string)
  );

  for (const lote of lotesConVarias) {
    const noticias = pendientes.filter((r) => r.lote === lote);
    if (new Set(noticias.map((n) => n.noticia_id)).size < 2) continue;
    const unicas = Array.from(
      new Map(noticias.map((n) => [n.noticia_id, aNoticia(n)])).values()
    );
    aperturas.set(lote, await redactarApertura(unicas));
  }

  for (const grupo of grupos.values()) {
    const first = grupo[0];
    const noticias = Array.from(
      new Map(grupo.map((r) => [r.noticia_id, aNoticia(r)])).values()
    ).sort((a, b) => (a.publicada_en || '').localeCompare(b.publicada_en || ''));

    if (!noticias.length) {
      resultado.omitidos += grupo.length;
      continue;
    }

    const ids = grupo.map((r) => r.id);
    try {
      let proveedorId: string;
      if (first.canal === 'email') {
        const mensaje = construirEmail(
          noticias,
          first.baja_token,
          first.lote ? aperturas.get(first.lote) ?? null : null
        );
        proveedorId = (await enviarEmail(first.destino, mensaje)).id;
      } else {
        proveedorId = (await enviarWhatsapp(first.destino, construirWhatsapp(noticias))).id;
      }

      await query(
        `UPDATE public.envios
            SET estado = 'enviado',
                intentos = intentos + 1,
                proveedor_id = $2,
                enviado_en = now(),
                error = NULL
          WHERE id = ANY($1::bigint[])`,
        [ids, proveedorId]
      );
      resultado.enviados += grupo.length;
    } catch (error) {
      const texto = mensajeError(error);
      await query(
        `UPDATE public.envios
            SET intentos = intentos + 1,
                estado = CASE WHEN intentos + 1 >= ${MAX_INTENTOS} THEN 'fallido' ELSE 'pendiente' END,
                error = $2
          WHERE id = ANY($1::bigint[])`,
        [ids, texto]
      );
      resultado.fallidos += grupo.length;
      resultado.errores.push({ canal: first.canal, destino: first.destino, error: texto });
    }

    // Pausas deliberadas: con 2 clientes no se notan; con 50 evitan que
    // Google o WhatsApp lean el patrón como una ráfaga.
    await pausa(first.canal === 'email' ? PAUSA_EMAIL_MS : PAUSA_WHATSAPP_MS);
  }

  return resultado;
}

/**
 * Digest del lunes: publica en un solo mensaje lo publicado en los últimos
 * 7 días que aún no haya llegado a algún suscriptor.
 *
 * No se filtra por «no tiene ninguna fila» porque «Enviar solo a mí» crea una
 * fila para el admin: si se usara ese filtro, una noticia vista en modo prueba
 * nunca llegaría al resto de clientes. `encolarNoticias` rellena solo las
 * combinaciones que faltan y el UNIQUE evita duplicados.
 */
export async function programarDigest(): Promise<{
  noticias: number;
  lote: string | null;
  envios: ResultadoEnvio | null;
}> {
  const noticias = await query<{ id: string }>(
    `SELECT n.id
       FROM public.noticias n
      WHERE n.estado = 'publicada'
        AND n.publicada_en IS NOT NULL
        AND n.publicada_en >= now() - interval '7 days'
      ORDER BY n.publicada_en`
  );

  if (!noticias.length) return { noticias: 0, lote: null, envios: null };

  const encolado = await encolarNoticias(
    noticias.map((n) => n.id),
    ['email', 'whatsapp'],
    { lote: randomUUID() }
  );

  if (!encolado.filas) return { noticias: noticias.length, lote: encolado.lote, envios: null };

  const envios = await procesarEnvios({ lote: encolado.lote });
  return { noticias: noticias.length, lote: encolado.lote, envios };
}
