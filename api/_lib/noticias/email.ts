/**
 * Canal email.
 *
 * Proveedor por defecto: Gmail con contraseña de aplicación. El interruptor
 * EMAIL_PROVIDER permite usar Resend sin tocar la cola ni las plantillas.
 *
 * La credencial vive SOLO en variables de entorno (GMAIL_APP_PASSWORD). Si
 * falta, el error es explícito y la fila de `envios` queda pendiente para el
 * siguiente reintento; nunca se inventa un remitente.
 */

import nodemailer from 'nodemailer';
import type { MensajeEmail } from './plantillas.js';

function remitente(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) return from;
  const user = process.env.GMAIL_USER?.trim();
  return user ? `Sánchez Delgado & Asociados <${user}>` : 'Sánchez Delgado & Asociados';
}

let transporte: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporte(): ReturnType<typeof nodemailer.createTransport> {
  if (transporte) return transporte;
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !pass) {
    throw new Error('Falta GMAIL_USER o GMAIL_APP_PASSWORD para enviar correos.');
  }
  transporte = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  return transporte;
}

/** Envía un correo y devuelve el id del proveedor. */
export async function enviarEmail(destino: string, mensaje: MensajeEmail): Promise<{ id: string }> {
  const provider = (process.env.EMAIL_PROVIDER || 'gmail').toLowerCase();

  if (provider === 'resend') {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new Error('EMAIL_PROVIDER=resend pero falta RESEND_API_KEY.');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remitente(),
        to: [destino],
        subject: mensaje.asunto,
        html: mensaje.html,
        text: mensaje.texto,
      }),
    });

    const data = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok) {
      throw new Error(data?.message || `Resend respondió ${res.status}.`);
    }
    return { id: data?.id || `resend-${Date.now()}` };
  }

  const info = await getTransporte().sendMail({
    from: remitente(),
    to: destino,
    subject: mensaje.asunto,
    html: mensaje.html,
    text: mensaje.texto,
    // Gmail reescribe el remitente si no coincide con la cuenta autenticada;
    // dejarlo explícito evita que el correo salga con un nombre raro.
    replyTo: process.env.GMAIL_USER?.trim() || undefined,
  });

  return { id: info.messageId || `gmail-${Date.now()}` };
}
