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

-- Adjuntos privados en Object Storage (bucket `assets`). Se guarda la clave
-- del objeto, no la URL: las URLs se firman al momento de descargar.
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS file_key  text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS file_size bigint;

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
-- confirmado, no de una lectura.
-- ============================================================

-- ------------------------------------------------------------
-- Contribuyentes del estudio.
-- Opción A: los contribuyentes NO son usuarios del sistema. Son
-- expedientes que el asistente administra. `profiles.ruc` sigue
-- siendo el RUC de la empresa dueña del estudio (para su propia
-- declaración). Aquí viven los clientes del estudio.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RUC del contribuyente: 11 dígitos, validado en la app (dígito verificador).
  ruc         text        NOT NULL UNIQUE,
  razon_social text       NOT NULL,
  -- 'RER' | 'RMT' | 'GENERAL' — decide el pago a cuenta mensual.
  regimen     text        NOT NULL DEFAULT 'RMT',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Períodos: una fila por (cliente, mes). Aquí vive el estado del
-- cierre, no en el comprobante.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.periodos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  -- 'YYYY-MM'. Date en vez de text para ordenar y comparar.
  anio       smallint    NOT NULL,
  mes        smallint    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- 'abierto' → 'cerrado'. Cerrado = no se aceptan más confirmaciones.
  estado     text        NOT NULL DEFAULT 'abierto',
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Saldo a favor del IGV al cierre. Se guarda y no se recalcula: es el
  -- resultado de la declaración presentada (FD 0621) y no se puede reescribir.
  -- NULL = período sin cerrar, y NULL no es 0.
  saldo_a_favor_igv numeric(12,2)
    CONSTRAINT periodos_saldo_favor_positivo CHECK (saldo_a_favor_igv IS NULL OR saldo_a_favor_igv >= 0),
  -- Resultado del IGV del período tal como se declaró (positivo = a pagar).
  igv_resultado     numeric(12,2),
  UNIQUE (cliente_id, anio, mes)
);

-- Columnas añadidas después de crear la tabla.
--
-- CREATE TABLE IF NOT EXISTS no toca una tabla que ya existe, así que una
-- columna nueva necesita su propio ALTER para llegar a la base que ya está en
-- producción. Se dejan aquí, junto a la tabla, para que una base nueva y la
-- existente terminen igual.
ALTER TABLE public.periodos
  ADD COLUMN IF NOT EXISTS saldo_a_favor_igv numeric(12,2);

ALTER TABLE public.periodos
  ADD COLUMN IF NOT EXISTS igv_resultado numeric(12,2);

-- Datos de la declaración anual que no se deducen de los comprobantes: gastos
-- deducibles aceptados, pagos a cuenta, pérdidas de años anteriores. Se guardan
-- por año en un jsonb ({ "2026": { ... } }) para no crear una tabla por cada
-- dato que pida el formulario 710.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS datos_anuales jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Razón social de la contraparte: el cliente en una venta, el proveedor en una
-- compra. Sin ella el registro PLE declaraba el nombre del propio
-- contribuyente en el campo del cliente, porque solo se guardaba el emisor.
ALTER TABLE public.comprobantes
  ADD COLUMN IF NOT EXISTS razon_receptor text;

-- El saldo a favor nunca es negativo: si lo fuera, es a pagar.
ALTER TABLE public.periodos
  DROP CONSTRAINT IF EXISTS periodos_saldo_favor_positivo;

ALTER TABLE public.periodos
  ADD CONSTRAINT periodos_saldo_favor_positivo
  CHECK (saldo_a_favor_igv IS NULL OR saldo_a_favor_igv >= 0);

-- ------------------------------------------------------------
-- Comprobantes: el núcleo.
--
-- La clave única (cliente, ruc_emisor, serie, numero) es la que
-- evita el duplicado al re-subir la misma factura.
--
-- Todo campo leído por el extractor es NULLABLE a propósito: si
-- la visión no leyó el RUC, se guarda NULL y baja la confianza.
-- nunca se inventa. La validación al confirmar es la que exige
-- que estén completos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comprobantes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid        NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo_id uuid        NOT NULL REFERENCES public.periodos(id) ON DELETE CASCADE,

  -- 'factura' | 'boleta' | 'nota_credito' | 'nota_debito'
  tipo       text        NOT NULL,
  -- 'venta' | 'compra' — se deriva del RUC, pero se guarda explícito
  -- para no recalcular en cada consulta.
  operacion  text        NOT NULL,

  serie      text,
  numero     text,
  fecha_emision date,
  ruc_emisor text,
  ruc_receptor text,
  razon_emisor text,

  -- Todo en soles. La moneda original se guarda aparte por si hubo tipo de cambio.
  moneda     text        NOT NULL DEFAULT 'PEN',
  tipo_cambio numeric(10,4),
  base       numeric(12,2),
  igv        numeric(12,2),
  exonerado  numeric(12,2) NOT NULL DEFAULT 0,
  total      numeric(12,2),

  -- '10' gravado, '20' exonerado, '30' inafecto.
  afectacion text,

  -- Origen de la lectura: define cuánto confiar sin revisar.
  -- 'xml' | 'pdf_texto' | 'vision'
  origen     text        NOT NULL,
  confianza  numeric(3,2),

  -- 'pendiente' | 'revisado' | 'confirmado' | 'descartado'
  estado     text        NOT NULL DEFAULT 'pendiente',

  -- Adjunto original en Object Storage (bucket privado, clave no URL).
  file_key   text,

  -- Se llena al confirmar: deja rastro de quién dio el visto bueno.
  confirmado_por uuid,
  confirmado_at  timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- El antiduplicado de la sección 10 de la propuesta.
  UNIQUE (cliente_id, ruc_emisor, serie, numero)
);

CREATE INDEX IF NOT EXISTS comprobantes_periodo_idx
  ON public.comprobantes (periodo_id, estado);
CREATE INDEX IF NOT EXISTS comprobantes_pendientes_idx
  ON public.comprobantes (cliente_id, estado)
  WHERE estado = 'pendiente';

-- ------------------------------------------------------------
-- Asientos: la partida doble.
--
-- Se guarda como líneas, no como columnas, para que Σdebe = Σhaber
-- sea una sola consulta de verificación. La app comprueba el
-- cuadre ANTES de insertar (regla de la casa).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asientos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comprobante_id uuid        NOT NULL REFERENCES public.comprobantes(id) ON DELETE CASCADE,
  fecha          date        NOT NULL,
  glosa          text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asiento_lineas (
  id         bigserial PRIMARY KEY,
  asiento_id uuid        NOT NULL REFERENCES public.asientos(id) ON DELETE CASCADE,
  -- Cuenta PCGE: '12', '40', '70', '60', '4011', '42'…
  cuenta     text        NOT NULL,
  -- Se copia el nombre de la cuenta para que el libro no dependa de un join.
  cuenta_nombre text     NOT NULL,
  debe       numeric(12,2) NOT NULL DEFAULT 0,
  haber      numeric(12,2) NOT NULL DEFAULT 0,
  -- Una línea no puede debitar y acreditar a la vez, ni ser un renglón vacío.
  CHECK ((debe = 0 OR haber = 0) AND (debe <> 0 OR haber <> 0)),
  -- Los importes negativos se representan cambiando de lado, no con signo.
  CHECK (debe >= 0 AND haber >= 0)
);

CREATE INDEX IF NOT EXISTS asiento_lineas_asiento_idx
  ON public.asiento_lineas (asiento_id);
