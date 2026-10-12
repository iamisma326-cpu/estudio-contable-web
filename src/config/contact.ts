/**
 * Configuración de contacto de Sánchez Delgado & Asociados.
 * Centralizado para que número y formato vivan en un solo lugar.
 */

/** Número de WhatsApp en formato internacional sin "+" ni espacios (requisito de wa.me) */
export const WHATSAPP_NUMBER = '51922375598';

/** Número formateado para mostrar en la interfaz */
export const WHATSAPP_DISPLAY = '+51 922 375 598';

/** Enlace de WhatsApp; con mensaje pre-escrito si se pasa uno */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Saludo breve para botones genéricos de WhatsApp */
export const WHATSAPP_GREETING =
  'Hola Sánchez Delgado & Asociados, quisiera información sobre sus servicios.';

/**
 * Tamaño máximo del adjunto.
 * No filtramos por extensión: el `accept` del navegador OCULTA tipos que no
 * coinciden y el cliente no puede seleccionarlos (heic, odt, escaneos…).
 * Solo frenamos archivos pesados, que WhatsApp no logra enviar.
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/** Formatea bytes a una lectura humana (KB / MB) */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FormData {
  nombre: string;
  email: string;
  telefono: string;
  empresa?: string;
  servicio: string;
  mensaje: string;
}

interface MessageOptions {
  /** Nombre del archivo adjunto, si lo hay */
  adjunto?: string;
  /**
   * true si el archivo viaja junto al mensaje (Web Share API);
   * false si el cliente tendrá que adjuntarlo a mano en el chat.
   */
  adjuntoViaja?: boolean;
}

/** Convierte los datos del formulario en un mensaje estructurado para WhatsApp */
export function buildFormMessage(data: FormData, opts: MessageOptions = {}): string {
  const lines = [
    'Hola Sánchez Delgado & Asociados, solicito un diagnóstico.',
    '',
    `• Nombre: ${data.nombre}`,
    `• Email: ${data.email}`,
    `• Teléfono: ${data.telefono}`,
  ];

  if (data.empresa) {
    lines.push(`• Empresa: ${data.empresa}`);
  }

  lines.push(
    `• Servicio de interés: ${data.servicio}`,
    '',
    'Mensaje:',
    data.mensaje
  );

  if (opts.adjunto) {
    lines.push(
      '',
      opts.adjuntoViaja
        ? `📎 Archivo adjunto: ${opts.adjunto}`
        : `📎 Adjuntaré el archivo: ${opts.adjunto}`
    );
  }

  return lines.join('\n');
}
