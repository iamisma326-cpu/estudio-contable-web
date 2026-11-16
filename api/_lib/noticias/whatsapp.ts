/**
 * Canal WhatsApp: proxy hacia el servicio Go con `whatsmeow`.
 *
 * El token del servicio (WA_SERVICIO_TOKEN) nunca se expone al navegador.
 * Todas las llamadas salen de Vercel, que además aplica requireAdmin en las
 * rutas de /admin/whatsapp/*.
 */

const TIMEOUT_MS = 20_000;

type RespuestaServicio<T> = T & {
  ok?: boolean;
  error?: string;
};

function config(): { url: string; token: string } {
  const url = process.env.WA_SERVICIO_URL?.trim().replace(/\/+$/, '');
  const token = process.env.WA_SERVICIO_TOKEN?.trim();
  if (!url || !token) {
    throw new Error(
      'El servicio de WhatsApp no está configurado (WA_SERVICIO_URL / WA_SERVICIO_TOKEN).'
    );
  }
  return { url, token };
}

async function llamar<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS
): Promise<T> {
  const { url, token } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        'X-Servicio-Token': token,
        ...(init.headers || {}),
      },
    });

    const data = (await res.json().catch(() => null)) as RespuestaServicio<T> | null;
    if (!res.ok) {
      throw new Error(data?.error || `El servicio de WhatsApp respondió ${res.status}.`);
    }
    return (data ?? ({} as T)) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('El servicio de WhatsApp tardó demasiado en responder.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface EstadoWhatsapp {
  conectado: boolean;
  jid?: string | null;
  numero?: string | null;
  desde?: string | null;
  ultimo_error?: string | null;
}

export function estadoWhatsapp(): Promise<EstadoWhatsapp> {
  return llamar<EstadoWhatsapp>('/status', { method: 'GET' }, 10_000);
}

export function solicitarQr(): Promise<{ qr: string | null; conectado?: boolean }> {
  return llamar<{ qr: string | null; conectado?: boolean }>(
    '/pair',
    { method: 'POST', body: '{}' },
    30_000
  );
}

export function desvincularWhatsapp(): Promise<{ ok: boolean }> {
  return llamar<{ ok: boolean }>('/logout', { method: 'POST', body: '{}' });
}

export async function enviarWhatsapp(destino: string, texto: string): Promise<{ id: string }> {
  const data = await llamar<{ id?: string }>('/send', {
    method: 'POST',
    body: JSON.stringify({ to: destino, texto }),
  });
  return { id: data.id || `wa-${Date.now()}` };
}
