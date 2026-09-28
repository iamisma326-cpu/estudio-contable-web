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

interface FormData {
  nombre: string;
  email: string;
  telefono: string;
  empresa?: string;
  servicio: string;
  mensaje: string;
}

/** Convierte los datos del formulario en un mensaje estructurado para WhatsApp */
export function buildFormMessage(data: FormData): string {
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

  return lines.join('\n');
}
