-- ============================================================
-- Dominio contable — opción A (herramienta interna del estudio).
--
-- Idempotente: se puede aplicar varias veces sin efectos secundarios
-- (CREATE TABLE/INDEX IF NOT EXISTS). Ya está incorporado a db/schema.sql
-- y se aplica con `npm run db:migrate`.
--
-- Principio: nada entra al libro sin estar confirmado. Por eso el
-- comprobante tiene estado y el asiento es hijo de un comprobante
-- confirmado, no de una lectura.
-- ============================================================

-- ------------------------------------------------------------
-- Contribuyentes del estudio.
-- Opción A: los contribuyentes NO son usuarios del sistema. Son
-- expedientes que el asistente administra. `profiles.ruc` sigue
-- siendo el RUC de la empresa dueña del estudio (para su propia
-- declaración); aquí viven los clientes del estudio.
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
  UNIQUE (cliente_id, anio, mes)
);

-- ------------------------------------------------------------
-- Comprobantes: el núcleo.
--
-- La clave única (cliente, ruc_emisor, serie, numero) es la que
-- evita el duplicado al re-subir la misma factura.
--
-- Todo campo leído por el extractor es NULLABLE a propósito: si
-- la visión no leyó el RUC, se guarda NULL y baja la confianza;
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

  -- Todo en soles; moneda original se guarda aparte por si hubo tipo de cambio.
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
