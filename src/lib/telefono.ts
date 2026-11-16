/**
 * Normalización de teléfonos en el navegador.
 *
 * Debe producir el mismo resultado que `normalizarWhatsapp` del backend:
 * 9 dígitos que empiezan por 9 → Perú (51…), 11 dígitos con 51 → tal cual,
 * y cualquier número internacional de 10 a 15 dígitos.
 */

export function normalizarTelefono(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 9 && digits.startsWith('9')) return `51${digits}`;
  if (digits.length === 11 && digits.startsWith('51')) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

export function telefonoValido(value: string): boolean {
  return normalizarTelefono(value) !== null;
}

/** "51987654321" → "+51 987 654 321" (solo para mostrar). */
export function formatearTelefono(value: string | null | undefined): string {
  const digits = normalizarTelefono(value);
  if (!digits) return value?.trim() ?? '';
  if (digits.startsWith('51') && digits.length === 11) {
    return `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}
