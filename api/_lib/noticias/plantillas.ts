/**
 * Plantillas de email y WhatsApp.
 *
 * Sin librería de plantillas y sin imágenes remotas: un HTML simple con el
 * nombre del estudio, la lista de noticias y el enlace de baja. Las imágenes
 * remotas son la causa número uno de que un correo caiga en spam.
 */

import { appUrl, escapeHtml, extracto, rangoSemana, type Noticia } from './comun.js';

const ESTUDIO = 'Sánchez Delgado & Asociados';

export interface MensajeEmail {
  asunto: string;
  html: string;
  texto: string;
}

export function asuntoEmail(noticias: Noticia[]): string {
  if (noticias.length === 1) return `SUNAT · ${noticias[0].titulo}`;
  const { desde, hasta } = rangoSemana(noticias);
  return `Resumen SUNAT · semana del ${desde} al ${hasta}`;
}

function urlNoticia(noticia: Noticia): string {
  return `${appUrl()}/panel?tab=guia#noticia-${noticia.slug}`;
}

export function construirEmail(
  noticias: Noticia[],
  bajaToken: string | null,
  apertura: string | null = null
): MensajeEmail {
  const asunto = asuntoEmail(noticias);
  const saludo = noticias.length === 1 ? 'Novedad de SUNAT' : 'Esta semana en SUNAT';
  const intro = apertura
    ? `<p style="margin:0 0 18px;line-height:1.6;color:#333a4d;">${escapeHtml(apertura)}</p>`
    : '';

  const items = noticias
    .map(
      (n, i) => `
      <tr>
        <td style="padding:0 0 18px;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a8194;">
            ${escapeHtml(n.categoria)} · ${escapeHtml(n.fuente)}
          </p>
          <p style="margin:0 0 6px;font-size:17px;line-height:1.35;color:#0b1432;font-weight:600;">
            ${noticias.length > 1 ? `${i + 1}. ` : ''}${escapeHtml(n.titulo)}
          </p>
          <p style="margin:0 0 8px;line-height:1.55;color:#333a4d;">${escapeHtml(extracto(n))}</p>
          <a href="${urlNoticia(n)}" style="color:#1d4ed8;font-size:14px;text-decoration:none;">Leer más →</a>
        </td>
      </tr>`
    )
    .join('');

  const bajaUrl = bajaToken
    ? `${appUrl()}/baja?token=${encodeURIComponent(bajaToken)}`
    : null;

  const pieBaja = bajaUrl
    ? `<a href="${bajaUrl}" style="color:#6b7280;text-decoration:underline;">Darse de baja</a>`
    : 'Responde BAJA para no recibir más avisos.';

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f2f4f8;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4f8;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:28px;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="padding-bottom:20px;border-bottom:1px solid #e5e7eb;">
                <p style="margin:0;font-size:15px;font-weight:700;color:#0b1432;">${ESTUDIO}</p>
                <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${saludo}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 0 4px;">
                ${intro}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;">
                <p style="margin:0 0 6px;">Este mensaje es informativo y no reemplaza una consulta con tu contador.</p>
                <p style="margin:0;">${pieBaja}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const texto = [
    ESTUDIO,
    '',
    saludo,
    '',
    ...noticias.flatMap((n, i) => [
      `${noticias.length > 1 ? `${i + 1}. ` : ''}${n.titulo}`,
      extracto(n),
      urlNoticia(n),
      '',
    ]),
    'Este mensaje es informativo y no reemplaza una consulta con tu contador.',
    bajaUrl ? `Darse de baja: ${bajaUrl}` : 'Responde BAJA para no recibir más avisos.',
  ].join('\n');

  return { asunto, html, texto };
}

export function construirWhatsapp(noticias: Noticia[]): string {
  const { desde, hasta } = rangoSemana(noticias);
  const cabecera =
    noticias.length === 1
      ? `*${noticias[0].titulo}*`
      : `*Resumen SUNAT — ${desde} al ${hasta}*`;

  const items = noticias.map(
    (n, i) =>
      `${noticias.length > 1 ? `${i + 1}. ` : ''}${n.titulo}\n${extracto(n, 220)}`
  );

  const fuentes = noticias
    .map((n) => n.fuente_url)
    .filter((u): u is string => Boolean(u));

  return [
    cabecera,
    '',
    ...items,
    '',
    fuentes.length ? `Fuente: ${fuentes[0]}` : 'Fuente: sunat.gob.pe',
    'Responde BAJA para no recibir más.',
  ].join('\n');
}
