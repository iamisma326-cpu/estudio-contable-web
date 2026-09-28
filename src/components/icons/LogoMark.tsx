/**
 * Logotipo de Sánchez Delgado & Asociados.
 *
 * Marca: balanza tributaria estilizada — nodo rombo, haz, platillos y pedestal.
 * Sistema: trazos en currentColor (se adapta al contexto claro/oscuro) y
 * acentos corporativos en var(--logo-accent, #832C4A). Sobre fondos oscuros
 * define --logo-accent: #D699AC para mantener contraste.
 */
export default function LogoMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Pedestal */}
      <path
        d="M14 41.5 H34"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d="M18.5 36.5 H29.5"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.55}
      />
      <path
        d="M24 14 V36.5"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />

      {/* Haz de la balanza */}
      <path
        d="M11.5 17.5 H36.5"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d="M11.5 17.5 L7 26.5 M36.5 17.5 L41 26.5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.55}
      />

      {/* Platillo izquierdo */}
      <path
        d="M4.5 26.5 A7 7 0 0 0 18.5 26.5"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
      />

      {/* Platillo derecho (acento corporativo) */}
      <path
        d="M29.5 26.5 A7 7 0 0 0 43.5 26.5"
        stroke="var(--logo-accent, #832C4A)"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle
        cx={36.5}
        cy={26.5}
        r={1.7}
        fill="var(--logo-accent, #832C4A)"
      />

      {/* Nodo rombo en el eje */}
      <path
        d="M24 12.6 L26.8 17.5 L24 22.4 L21.2 17.5 Z"
        fill="var(--logo-accent, #832C4A)"
      />
      <circle
        cx={24}
        cy={10.4}
        r={2.3}
        stroke="currentColor"
        strokeWidth={2.4}
      />
    </svg>
  );
}
