/**
 * Pestañas del panel del cliente.
 *
 * Vive en su propio módulo (y no dentro de PanelPage) porque los paneles
 * hijos navegan entre pestañas y necesitan el tipo sin importar la página
 * entera — eso crearía un ciclo.
 */

export const PANEL_TABS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'herramientas', label: 'Herramientas' },
  { id: 'guia', label: 'Guía y glosario' },
  { id: 'cuenta', label: 'Mi cuenta' },
] as const;

export type PanelTab = (typeof PANEL_TABS)[number]['id'];

export const DEFAULT_TAB: PanelTab = 'inicio';

/** Valida el `?tab=` de la URL: un valor desconocido cae en Inicio. */
export function isPanelTab(value: string | null): value is PanelTab {
  return value !== null && PANEL_TABS.some((tab) => tab.id === value);
}
