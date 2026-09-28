import type { ReactNode } from 'react';

/**
 * Iconos de marca de Sánchez Delgado & Asociados.
 *
 * Sistema de diseño:
 * - Grilla 32×32, trazo 1.8, linecap/linejoin redondeados.
 * - Dos tonos: trazo en currentColor + relleno translúcido del mismo color
 *   para dar profundidad sin romper la paleta (azul/gold según contenedor).
 * - Heredan el color del contenedor vía currentColor.
 */

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Svg({
  size = 24,
  className,
  strokeWidth = 1.8,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------- */
/* Contabilidad                                               */
/* ---------------------------------------------------------- */

/** Libro mayor abierto con moneda verificada — outsourcing contable */
export function IconLedger({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M15.5 8.2 C12.2 5.9 8.4 5.6 5 6.8 V23.4 C8.4 22.3 12.2 22.6 15.5 24.6 Z"
        fill="currentColor"
        fillOpacity={0.14}
        stroke="none"
      />
      <path d="M15.5 8.2 C12.2 5.9 8.4 5.6 5 6.8 V23.4 C8.4 22.3 12.2 22.6 15.5 24.6 C18.8 22.6 22.6 22.3 26 23.4 V6.8 C22.6 5.6 18.8 5.9 15.5 8.2 Z" />
      <path d="M15.5 8.2 V24.6" />
      <path d="M8.6 12.6 H12.4" />
      <path d="M8.6 16.2 H12.4" />
      <circle cx={21.8} cy={13.4} r={3.1} />
      <path d="M20.5 13.4 L21.4 14.3 L23.2 12.2" />
    </Svg>
  );
}

/** Balanza con plato relleno — asesoría tributaria */
export function IconScale({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <circle cx={16} cy={7.4} r={1.5} />
      <path d="M16 8.9 V26.2" />
      <path d="M12.8 23.9 H19.2" />
      <path d="M10.8 26.2 H21.2" />
      <path d="M6.2 10.4 H25.8" />
      <path d="M6.2 10.4 L3.6 17.4 M6.2 10.4 L8.8 17.4" />
      <path d="M2.9 17.4 A3.3 3.3 0 0 0 9.5 17.4" />
      <path d="M25.8 10.4 L23.2 17.4 M25.8 10.4 L28.4 17.4" />
      <path
        d="M22.5 17.4 A3.3 3.3 0 0 0 29.1 17.4 Z"
        fill="currentColor"
        fillOpacity={0.14}
        stroke="none"
      />
      <path d="M22.5 17.4 A3.3 3.3 0 0 0 29.1 17.4" />
    </Svg>
  );
}

/** Ficha de planilla: persona + filas de remuneraciones */
export function IconPayroll({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M4.5 9.1 C4.5 7.7 5.6 6.5 7.1 6.5 H24.9 C26.4 6.5 27.5 7.7 27.5 9.1 V11.9 H4.5 Z"
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <rect x={4.5} y={6.5} width={23} height={19} rx={2.6} />
      <circle cx={11.4} cy={16.6} r={2.4} />
      <path d="M7.8 22.4 C8.6 20.1 14.2 20.1 15 22.4" />
      <path d="M18.6 15.4 H24.2" />
      <path d="M18.6 18.6 H24.2" />
      <path d="M18.6 21.8 H22.2" />
    </Svg>
  );
}

/** Lupa con visto sobre documento — auditoría y revisión */
export function IconAudit({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M19.4 4.8 V9.2 H23.8 Z"
        fill="currentColor"
        fillOpacity={0.14}
        stroke="none"
      />
      <path d="M8.2 4.8 H19.4 L23.8 9.2 V27.2 H8.2 Z" />
      <path d="M19.4 4.8 V9.2 H23.8" />
      <path d="M11.6 13.4 H17.8" />
      <path d="M11.6 16.6 H15.4" />
      <circle cx={20.6} cy={20.6} r={4.6} />
      <path d="M24.1 24.1 L27.6 27.6" />
      <path d="M18.7 20.7 L20.2 22.2 L22.7 19.1" />
    </Svg>
  );
}

/** Edificio con columnas y bandera — constitución de empresas */
export function IconCompany({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M5.4 12.4 L16 6.4 L26.6 12.4 Z"
        fill="currentColor"
        fillOpacity={0.14}
        stroke="none"
      />
      <path d="M5.4 12.4 L16 6.4 L26.6 12.4" />
      <path d="M16 6.4 V3.8" />
      <path d="M16 3.8 H19.6 V6" />
      <path d="M6.6 15.4 H25.4" />
      <path d="M8.8 15.4 V25.4" />
      <path d="M13.6 15.4 V25.4" />
      <path d="M18.4 15.4 V25.4" />
      <path d="M23.2 15.4 V25.4" />
      <path d="M6 25.6 H26" />
    </Svg>
  );
}

/** Barras ascendentes con flecha — asesoría financiera */
export function IconGrowth({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M5.6 5.4 V26.6 H27.4" />
      <rect x={9} y={19.4} width={3.6} height={7.2} fill="currentColor" fillOpacity={0.16} />
      <rect x={14.7} y={15.4} width={3.6} height={11.2} fill="currentColor" fillOpacity={0.16} />
      <rect x={20.4} y={11} width={3.6} height={15.6} fill="currentColor" fillOpacity={0.16} />
      <path d="M8.6 15.6 C13.4 12.2 18.4 9.4 24.6 6.4" />
      <path d="M20.8 5.9 L24.8 6.3 L24.3 10.3" />
    </Svg>
  );
}

/** Diana con flecha centrada — misión */
export function IconTarget({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <circle cx={16} cy={16} r={11} fill="currentColor" fillOpacity={0.06} />
      <circle cx={16} cy={16} r={11} />
      <circle cx={16} cy={16} r={6.4} />
      <circle cx={16} cy={16} r={1.8} fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Ojo con iris dorado — visión */
export function IconEye({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M3.4 16 C6.6 10.2 11 7.2 16 7.2 C21 7.2 25.4 10.2 28.6 16 C25.4 21.8 21 24.8 16 24.8 C11 24.8 6.6 21.8 3.4 16 Z" />
      <circle cx={16} cy={16} r={4.4} fill="currentColor" fillOpacity={0.22} />
      <circle cx={16} cy={16} r={1.6} fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Manos en apretón — compromiso */
export function IconHandshake({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M9.4 9.2 L4.6 14 L11.4 21.4" />
      <path d="M22.6 9.2 L27.4 14 L20.6 21.4" />
      <path d="M11.4 21.4 L14.2 24 C15 24.8 16.4 24.7 17.2 23.9" />
      <path d="M4.6 14 L4.6 20.2 L9.8 25.6 C10.6 26.4 11.9 26.4 12.7 25.6" />
      <path d="M27.4 14 L27.4 20.2 L22.2 25.6 C21.4 26.4 20.1 26.4 19.3 25.6 L17.2 23.9" />
      <path d="M14.2 24 L12.1 21.9 C11.3 21.1 11.3 19.8 12.1 19 L16 15.1 C16.8 14.3 18.1 14.3 18.9 15.1 L20.6 16.8 C21.4 17.6 21.4 18.9 20.6 19.7 L17.2 23.9" fill="currentColor" fillOpacity={0.08} />
    </Svg>
  );
}

/** Bombilla con rayos — proactividad */
export function IconBulb({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M16 4.6 C11.2 4.6 7.4 8.4 7.4 13.2 C7.4 16.4 9.2 18.9 11.4 20.6 C12.3 21.3 12.8 22.1 12.8 23.1 V23.4 H19.2 V23.1 C19.2 22.1 19.7 21.3 20.6 20.6 C22.8 18.9 24.6 16.4 24.6 13.2 C24.6 8.4 20.8 4.6 16 4.6 Z" fill="currentColor" fillOpacity={0.07} />
      <path d="M16 4.6 C11.2 4.6 7.4 8.4 7.4 13.2 C7.4 16.4 9.2 18.9 11.4 20.6 C12.3 21.3 12.8 22.1 12.8 23.1 V23.4 H19.2 V23.1 C19.2 22.1 19.7 21.3 20.6 20.6 C22.8 18.9 24.6 16.4 24.6 13.2 C24.6 8.4 20.8 4.6 16 4.6 Z" />
      <path d="M13 26.6 H19" />
      <path d="M14.2 29 H17.8" />
      <path d="M13.4 12.6 L16 15.2 L18.6 12.6" />
    </Svg>
  );
}

/* ---------------------------------------------------------- */
/* Confianza                                                  */
/* ---------------------------------------------------------- */

/** Escudo partido con visto — sin multas / respaldo */
export function IconShieldCheck({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M16 4.4 L26.2 8.4 V14.8 C26.2 21.4 22.3 25.8 16 27.6 Z"
        fill="currentColor"
        fillOpacity={0.1}
        stroke="none"
      />
      <path d="M16 4.4 L26.2 8.4 V14.8 C26.2 21.4 22.3 25.8 16 27.6 C9.7 25.8 5.8 21.4 5.8 14.8 V8.4 Z" />
      <path d="M11.2 15.4 L14.6 18.8 L21 11.4" />
    </Svg>
  );
}

/** Calculadora con pantalla dorada — impuestos optimizados */
export function IconCalc({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <rect x={7} y={4.8} width={18} height={22.4} rx={2.6} />
      <rect x={10} y={7.8} width={12} height={4.6} rx={0.8} fill="currentColor" fillOpacity={0.16} stroke="none" />
      <circle cx={11.2} cy={16.4} r={1.05} fill="currentColor" stroke="none" />
      <circle cx={16} cy={16.4} r={1.05} fill="currentColor" stroke="none" />
      <circle cx={20.8} cy={16.4} r={1.05} fill="currentColor" stroke="none" />
      <circle cx={11.2} cy={20.2} r={1.05} fill="currentColor" stroke="none" />
      <circle cx={16} cy={20.2} r={1.05} fill="currentColor" stroke="none" />
      <rect x={18.2} y={18.4} width={5.4} height={3.6} rx={1.2} />
      <rect x={10} y={23.4} width={13.6} height={0} />
      <path d="M10 24.4 H23.6" />
    </Svg>
  );
}

/** Documento con mini gráfico — reportes claros */
export function IconReport({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M18.8 4.6 V9.8 H24 Z"
        fill="currentColor"
        fillOpacity={0.14}
        stroke="none"
      />
      <path d="M7 4.6 H18.8 L24 9.8 V27.4 H7 Z" />
      <path d="M18.8 4.6 V9.8 H24" />
      <path d="M10.6 22.8 H20.4" />
      <path d="M12.4 22.8 V18.2" />
      <path d="M15.6 22.8 V14.8" />
      <path d="M18.8 22.8 V11.6" />
    </Svg>
  );
}

/** Candado con ojo de llave dorado — confidencialidad */
export function IconLock({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M10.8 14.2 V10.4 C10.8 7.4 13 5.2 16 5.2 C19 5.2 21.2 7.4 21.2 10.4 V14.2" />
      <rect x={6.6} y={14.2} width={18.8} height={12.6} rx={2.8} />
      <circle cx={16} cy={19.6} r={2} fill="currentColor" fillOpacity={0.85} stroke="none" />
      <rect x={15.2} y={20.8} width={1.6} height={3} rx={0.8} fill="currentColor" fillOpacity={0.85} stroke="none" />
    </Svg>
  );
}

/** Cronómetro con cuarto resaltado — cero multas / puntualidad */
export function IconTimer({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M16 17.6 L20.4 13.2 A9.8 9.8 0 0 1 25.8 17.6 Z"
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <circle cx={16} cy={17.6} r={9.8} />
      <path d="M13.2 4.6 H18.8" />
      <path d="M16 4.6 V7.8" />
      <path d="M16 17.6 L20.4 13.2" />
      <circle cx={16} cy={17.6} r={1.3} fill="currentColor" stroke="none" />
      <path d="M16 10.2 V11.8" />
      <path d="M23.4 17.6 H21.8" />
    </Svg>
  );
}

/** Burbuja de diálogo con porcentaje — respuesta de expertos */
export function IconChat({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M5.6 8.2 C5.6 7 6.6 6 7.8 6 H24.2 C25.4 6 26.4 7 26.4 8.2 V18.6 C26.4 19.8 25.4 20.8 24.2 20.8 H14.2 L8.6 25.8 V20.8 H7.8 C6.6 20.8 5.6 19.8 5.6 18.6 Z" />
      <circle cx={12} cy={11.2} r={1.7} />
      <circle cx={20} cy={15.8} r={1.7} />
      <path d="M20.8 9.9 L11.2 17.1" />
    </Svg>
  );
}

/** Sello circular con visto — contadores colegiados */
export function IconBadgeCheck({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M16 5.2 A10.8 10.8 0 0 1 26.8 16 L16 16 Z"
        fill="currentColor"
        fillOpacity={0.1}
        stroke="none"
      />
      <circle cx={16} cy={16} r={10.8} />
      <path d="M11.2 16.4 L14.6 19.8 L21.2 12.6" />
    </Svg>
  );
}

/* ---------------------------------------------------------- */
/* Recursos                                                   */
/* ---------------------------------------------------------- */

/** Calendario con día marcado — vencimientos SUNAT */
export function IconCalendar({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M5.4 10.2 C5.4 8.8 6.5 7.6 8 7.6 H24 C25.5 7.6 26.6 8.8 26.6 10.2 V12.8 H5.4 Z"
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <rect x={5.4} y={7.6} width={21.2} height={19} rx={2.6} />
      <path d="M5.4 12.8 H26.6" />
      <path d="M10.8 4.8 V9.4" />
      <path d="M21.2 4.8 V9.4" />
      <circle cx={16} cy={19.6} r={2.9} fill="currentColor" fillOpacity={0.28} />
      <circle cx={10} cy={19.6} r={1} fill="currentColor" stroke="none" />
      <circle cx={22} cy={19.6} r={1} fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Periódico con titular — actualidad tributaria */
export function IconNews({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <rect x={5} y={6.8} width={17.4} height={19.4} rx={2} />
      <path d="M22.4 26.2 H24.4 C25.6 26.2 26.6 25.2 26.6 24 V10.6 H22.4" />
      <rect x={8.4} y={10} width={10.6} height={3.6} rx={0.8} fill="currentColor" fillOpacity={0.14} stroke="none" />
      <path d="M8.4 17 H19.4" />
      <path d="M8.4 20.4 H19.4" />
      <path d="M8.4 23.8 H14.6" />
    </Svg>
  );
}

/** Lupa con líneas de texto — glosario / búsqueda */
export function IconSearchTerm({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <circle cx={14.2} cy={14.2} r={8.6} fill="currentColor" fillOpacity={0.07} />
      <path d="M20.4 20.4 L27.4 27.4" />
      <path d="M10.4 11.8 H18" />
      <path d="M10.4 15.6 H15.6" />
    </Svg>
  );
}

/* ---------------------------------------------------------- */
/* Contacto                                                   */
/* ---------------------------------------------------------- */

/** Pin de ubicación con núcleo resaltado */
export function IconPin({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M16 27.4 C16 27.4 7.2 20 7.2 13.4 C7.2 8.6 11.2 4.6 16 4.6 C20.8 4.6 24.8 8.6 24.8 13.4 C24.8 20 16 27.4 16 27.4 Z" />
      <circle cx={16} cy={13.4} r={3.1} fill="currentColor" fillOpacity={0.25} />
    </Svg>
  );
}

/** Auricular clásico de teléfono */
export function IconPhone({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path d="M11 4.9 C12 4.9 12.9 5.5 13.2 6.5 L14.6 10.2 C14.9 11.1 14.6 12.1 13.9 12.7 L12.1 14.2 C13.4 16.9 15.6 19.1 18.3 20.4 L19.8 18.6 C20.4 17.9 21.4 17.6 22.3 17.9 L26 19.3 C27 19.6 27.6 20.5 27.6 21.5 V24.7 C27.6 26 26.5 27.1 25.2 27 C14.8 26.4 5.7 17.3 5.1 6.9 C5 5.6 6.1 4.6 7.4 4.6 H11 Z" />
    </Svg>
  );
}

/** Sobre con solapa trazada */
export function IconMail({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <rect x={4.8} y={7.4} width={22.4} height={17.2} rx={2.6} />
      <path d="M5.6 9.6 L16 17.4 L26.4 9.6" />
    </Svg>
  );
}

/** Reloj con cuarto superior derecho resaltado */
export function IconClock({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M16 16 V5.4 A10.6 10.6 0 0 1 26.6 16 Z"
        fill="currentColor"
        fillOpacity={0.1}
        stroke="none"
      />
      <circle cx={16} cy={16} r={10.6} />
      <path d="M16 9.8 V16 L20.8 18.4" />
      <circle cx={16} cy={16} r={1.2} fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Burbuja de WhatsApp con auricular relleno */
export function IconWhatsApp({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <circle cx={16} cy={15.4} r={10.4} />
      <path d="M6.2 28.2 C7 26.2 7.8 24.9 9 23.7" />
      <path d="M12.4 10.9 C13.1 10.7 13.8 11.1 14.1 11.8 L14.8 13.5 C15 14.1 14.9 14.8 14.4 15.3 L13.5 16.2 C14.4 18 15.8 19.4 17.6 20.3 L18.5 19.4 C19 18.9 19.7 18.8 20.3 19 L22 19.7 C22.7 20 23.1 20.7 22.9 21.4 C22.5 23 21 24.1 19.3 23.8 C14.7 22.9 10.9 19.1 10 14.5 C9.7 12.9 10.8 11.3 12.4 10.9 Z" fill="currentColor" fillOpacity={0.8} stroke="none" />
    </Svg>
  );
}

/** Avión de papel — envío de formulario */
export function IconSend({ size, className, strokeWidth }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={strokeWidth}>
      <path
        d="M12.6 16.8 L27.2 5.2 L19.2 18.6 Z"
        fill="currentColor"
        fillOpacity={0.12}
        stroke="none"
      />
      <path d="M27.2 5.2 L4.8 13.8 L12.6 16.8 L15.6 24.4 L19.2 18.6 L27.2 5.2 Z" />
      <path d="M12.6 16.8 L27.2 5.2" />
    </Svg>
  );
}

/** Comillas tipográficas sólidas — testimonios */
export function IconQuoteMark({ size, className }: IconProps) {
  return (
    <Svg size={size} className={className} strokeWidth={0}>
      <path
        d="M7 18.5 C6 13.5 8.6 9.2 13 7.5 L14.4 9.9 C11.8 11.1 10.2 13.2 10 15.6 C10.9 15.2 12 15.4 12.8 16.1 C13.9 17.1 14 18.9 12.9 20.1 C11.7 21.3 9.7 21.4 8.4 20.3 C7.7 19.7 7.2 19.1 7 18.5 Z"
        fill="currentColor"
      />
      <path
        d="M18 18.5 C17 13.5 19.6 9.2 24 7.5 L25.4 9.9 C22.8 11.1 21.2 13.2 21 15.6 C21.9 15.2 23 15.4 23.8 16.1 C24.9 17.1 25 18.9 23.9 20.1 C22.7 21.3 20.7 21.4 19.4 20.3 C18.7 19.7 18.2 19.1 18 18.5 Z"
        fill="currentColor"
      />
    </Svg>
  );
}
