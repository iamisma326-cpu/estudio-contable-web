/** Tipos compartidos de la API de noticias (frontend). */

export type EstadoNoticia = 'borrador' | 'publicada' | 'archivada';
export type CategoriaNoticia = 'sunat' | 'tributario' | 'laboral' | 'estudio';
export type CanalAviso = 'email' | 'whatsapp';

export interface Noticia {
  id: string;
  slug: string;
  titulo: string;
  resumen: string;
  cuerpo: string;
  categoria: CategoriaNoticia;
  fuente: string;
  fuente_url: string | null;
  estado: EstadoNoticia;
  publicada_en: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumenEnvios {
  noticia_id: string;
  enviados: number;
  pendientes: number;
  fallidos: number;
}

export interface NoticiasResponse {
  ok: boolean;
  noticias: Noticia[];
  conteos: { estado: string; total: number }[];
  envios: ResumenEnvios[];
}

export interface Envio {
  id: string;
  noticia_id: string;
  noticia: string;
  user_id: string;
  nombre: string | null;
  email: string | null;
  canal: CanalAviso;
  destino: string;
  estado: string;
  intentos: number;
  proveedor_id: string | null;
  error: string | null;
  enviado_en: string | null;
  created_at: string;
}

export interface EnviosResponse {
  ok: boolean;
  envios: Envio[];
  resumen: {
    noticia_id: string;
    titulo: string;
    enviados: number;
    pendientes: number;
    fallidos: number;
  }[];
}

export interface ResultadoEnvio {
  grupos: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
  errores: { canal: CanalAviso; destino: string; error: string }[];
}

export interface EnviarResponse {
  ok: boolean;
  lote?: string;
  encolados?: number;
  destinatarios?: number;
  enviados?: ResultadoEnvio | null;
  modo?: 'ahora' | 'cola';
  aviso?: string;
  error?: string;
  detail?: string;
}

export interface EstadoWhatsapp {
  conectado: boolean;
  jid?: string | null;
  numero?: string | null;
  desde?: string | null;
  ultimo_error?: string | null;
}

export interface Suscripcion {
  user_id: string;
  email: string | null;
  whatsapp: string | null;
  canal_email: boolean;
  canal_whatsapp: boolean;
  activo: boolean;
  consentimiento_en: string | null;
  consentimiento_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface SuscripcionResponse {
  ok: boolean;
  email_cuenta: string;
  suscripcion: Suscripcion | null;
}

export interface FeedNoticia {
  id: string;
  slug: string;
  titulo: string;
  resumen: string;
  categoria: CategoriaNoticia;
  fuente: string;
  fuente_url: string | null;
  publicada_en: string | null;
}
