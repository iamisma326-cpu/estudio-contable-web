-- ============================================================
-- Esquema de la intranet de Sánchez Delgado & Asociados
-- Postgres (Neon) — idempotente: se puede aplicar varias veces.
--
-- La IDENTIDAD la maneja Neon Auth (Managed Better Auth) en el esquema
-- `neon_auth`: usuarios, sesiones, verificación. Aquí solo viven los datos
-- de perfil que Better Auth no cubre y el catálogo de recursos.
-- ============================================================

-- ------------------------------------------------------------
-- Perfiles
-- Clave = neon_auth.user.id. Sin FK a propósito: `neon_auth` es un esquema
-- administrado y no queremos que una migración suya arrastre nuestros datos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id    uuid PRIMARY KEY,
  empresa    text,
  ruc        text,
  telefono   text,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Recursos / herramientas del área privada
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        NOT NULL UNIQUE,
  title       text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  category    text        NOT NULL DEFAULT 'herramienta',
  href        text,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resources_active_idx
  ON public.resources (is_active, sort_order, title);

-- ------------------------------------------------------------
-- Aperturas de recursos: alimenta las métricas del panel.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resource_views (
  id          bigserial PRIMARY KEY,
  resource_id uuid REFERENCES public.resources(id) ON DELETE CASCADE,
  user_id     uuid,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_views_resource_idx
  ON public.resource_views (resource_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS resource_views_viewed_at_idx
  ON public.resource_views (viewed_at DESC);

-- ------------------------------------------------------------
-- Catálogo inicial: las herramientas que ya viven en /recursos.
-- ON CONFLICT DO NOTHING respeta ediciones hechas desde el panel.
-- ------------------------------------------------------------
INSERT INTO public.resources (slug, title, description, category, href, sort_order) VALUES
  ('cronograma-sunat', 'Cronograma SUNAT 2026',
   'Fechas de vencimiento según el último dígito del RUC.', 'calendario', '/recursos#cronograma', 10),
  ('tipo-de-cambio', 'Tipo de cambio SUNAT',
   'Compra y venta oficial del dólar, actualizada a diario.', 'herramienta', '/recursos#tipo-cambio', 20),
  ('regimenes', 'Comparador de regímenes',
   'Estima el impuesto anual en RER, RMT y Régimen General.', 'herramienta', '/recursos#regimenes', 30),
  ('multas', 'Calculadora de multas',
   'Sanciones de SUNAT en UIT con gradualidad aplicada.', 'herramienta', '/recursos#multas', 40),
  ('glosario', 'Glosario contable',
   'Los términos de cada mes explicados sin tecnicismos.', 'guia', '/recursos#glosario', 50)
ON CONFLICT (slug) DO NOTHING;
