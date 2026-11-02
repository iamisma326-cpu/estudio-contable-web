/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

interface ImportMetaEnv {
  /** URL pública del branch de Neon Auth (p. ej. https://…/neondb/auth). */
  readonly VITE_NEON_AUTH_URL?: string;
  /** Email de la cuenta admin, al que se traduce el alias "admin". */
  readonly VITE_ADMIN_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
