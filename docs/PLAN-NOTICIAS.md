# Plan — Avisos automáticos de noticias por email y WhatsApp

> **Estado:** implementado (v1). La operación está en
> [`NOTICIAS-OPERACION.md`](./NOTICIAS-OPERACION.md).
> **Fecha:** 15 de noviembre de 2026
> **Alcance:** intranet de Sánchez Delgado & Asociados (`estudio-contable-web`)
> **Decisión que gobierna el documento:** las noticias las revisa una persona
> antes de salir (híbrido), y el envío es un **resumen semanal**, no tiempo real.

---

## 0. Resumen en una página

El profesor pide una automatización: cuando salga una noticia tributaria nueva
(cronogramas, renta, SIRE, UIT…), que le llegue al cliente por email o por
WhatsApp sin que nadie copie y pegue.

Lo que se construye:

1. **Un modelo de noticias** que hoy no existe. `GuidePanel.tsx` tiene cuatro
   artículos escritos a mano dentro del código; no hay tabla, ni fecha, ni
   estado, ni forma de enviarlos.
2. **Un detector** que corre una vez al día, compara el HTML de SUNAT con el
   hash de la última vez y, si cambió, crea un **borrador** en `/admin`. No
   envía nada por su cuenta.
3. **Un botón en `/admin`** («Publicar y enviar») que manda la noticia a todos
   los clientes suscritos, por email, por WhatsApp o por los dos.
4. **Un servicio Go aparte** que envuelve `whatsmeow` (la librería que ya tienes
   en `/home/isma/projects/api free ai/whatsmeow-main`), hospedado en Render
   free, con una pestaña en `/admin` donde el admin **escanea el QR** para
   vincular el número del estudio.
5. **Un digest semanal** («esto salió esta semana») que se arma solo los lunes
   con lo publicado y no enviado.

Lo que **no** es: no es un boletín masivo, no es un chatbot, y no envía nada
sin que un humano pulse un botón o el lunes llegue con noticias ya aprobadas.

Presupuesto de la demo: **$0**. Para operación real, **$5/mes** (Railway Hobby)
si se quiere el servicio de WhatsApp siempre despierto en vez de dormido.

---

## 1. Punto de partida real

Conviene decirlo antes de proponer nada, porque cambia el tamaño del trabajo.

| Pieza | Estado hoy | Qué implica |
|---|---|---|
| Noticias como dato | **No existen.** `GuidePanel.tsx` tiene 4 artículos en un array del código | No hay nada que enviar; primero hay que crear el modelo |
| `resources` | Tabla administrable con `slug`, `category`, `href` | Es un catálogo de herramientas, sin fecha ni estado de envío. No sirve como noticia |
| Destino email | `neon_auth.user.email` | Ya está; falta consentimiento y baja |
| Destino WhatsApp | `profiles.telefono` (texto libre) | Ya está el campo; falta normalizar a E.164 y pedir opt-in |
| Scraping SUNAT | **Ya existe** en `cronograma.ts` y `renta-anual.ts`, con respaldo embebido | Es la base del detector, pero no guarda historial: no sabe qué es nuevo |
| Envío | **Cero.** No hay `nodemailer`, `resend`, `twilio`, nada | Todo el canal se construye desde cero |
| Cron | `vercel.json` no tiene bloque `crons` | Se añade; no consume una función nueva si entra por el catch-all |
| Roles | `admin` y `user` (cliente) | El admin ya tiene todas las herramientas; el cliente solo ve `/panel` |

Dos restricciones del plan gratuito que condicionan el diseño:

- **Vercel Hobby**: 12 funciones serverless (por eso existe `api/[...ruta].ts`),
  **cron con mínimo una ejecución al día**, precisión ±59 min, 1M de
  invocaciones/mes. Con `maxDuration` hasta 300 s por invocación.
- **Render free**: el servicio **se duerme a los 15 min sin tráfico**, arranca
  en ~1 min, **no tiene disco persistente**, da 750 horas-instancia al mes y
  **bloquea salida a los puertos 25, 465 y 587** (SMTP). Este último dato parece
  un problema y no lo es: el correo sale de Vercel, no de Render.
- **Railway**: no duerme nada, pero free solo da **$1 de consumo al mes** y el
  plan utilizable de verdad cuesta **$5**. Comparación completa en §7.4.

---

## 2. Decisiones de diseño y por qué

### 2.1 Híbrido: el scraper propone, el admin dispone

Un scraper que envía solo es lo más vistoso y lo más peligroso: un cambio de
maquetación de SUNAT se convierte en «SUNAT eliminó el régimen MYPE» en la
bandeja de un cliente. La regla queda escrita en el código:

> **Un cambio de HTML nunca es una noticia. Un cambio de HTML genera un
> borrador con un título neutro que un humano reescribe o descarta.**

Sigue siendo automatización: nadie entra a mirar SUNAT todos los días. Pero el
último paso lo da una persona, y ese paso es barato (un botón).

### 2.2 Digest semanal, no alerta instantánea

Con un cron diario, «instantáneo» es una mentira de ±59 minutos y, peor, es un
email por noticia a las 7 de la mañana. El formato útil para un estudio
contable es:

- **Detector**: corre a diario y acumula borradores.
- **Envío automático**: los lunes, un solo mensaje con lo publicado y no
  enviado de los últimos 7 días.
- **Envío manual**: si algo es urgente (cierre de cronograma mañana), el admin
  pulsa «Publicar y enviar ahora» y sale en el momento, sin esperar al lunes.

Los dos caminos usan la misma cola, así que no hay dos códigos de envío.

### 2.3 Dos canales, una cola

`envios` no sabe si el destino es Gmail o WhatsApp: guarda `canal`, `destino`,
`estado` e `intentos`. Los adaptadores (`email.ts`, `whatsapp.ts`) implementan
la misma interfaz `enviar(destino, mensaje): Promise<{id}>`. Añadir Telegram
mañana sería un archivo nuevo, no una refactorización.

### 2.4 Email por Gmail con contraseña de aplicación, no Resend

Tú lo pediste así y es defendible: cero trámite, cero dominio que verificar,
cero costo, y el remitente es una cuenta real del estudio (mejor entregabilidad
que un dominio nuevo sin reputación). El precio es que el asunto depende de una
credencial de 16 caracteres y de los límites de Gmail.

Se deja `EMAIL_PROVIDER` como interruptor (`gmail` | `resend`) para poder
cambiar sin tocar el resto. Resend free son 3,000 emails/mes y 100/día.

### 2.5 WhatsApp con `whatsmeow`, no con la API de Meta

| | API oficial (Meta) | `whatsmeow` (no oficial) |
|---|---|---|
| Trámite | Cuenta Business, número nuevo, plantilla aprobada, días | Escanear un QR |
| Costo | Por mensaje entregado (Perú tiene tarifa propia, en PEN) | $0 (solo el hosting) |
| Regla dura | Opt-in obligatorio y plantilla para iniciar conversación | Ninguna, pero viola los ToS |
| Riesgo | Ninguno | **Ban del número** |

Con la API oficial, «enviar la noticia del lunes» es un mensaje de marketing
fuera de la ventana de 24 h: exige plantilla aprobada por Meta y opt-in
registrado. Para una demo de curso es un trámite de días que puede no llegar.
Con `whatsmeow` son 20 minutos y el QR en pantalla, que además es justo lo que
el profesor quiere ver.

Se asume el riesgo explícitamente y se documenta (ver §12). Recomendación
operativa: **un chip dedicado**, no el número personal del dueño.

---

## 3. Arquitectura

```
                    ┌──────────────────────────────────────────┐
   SUNAT  ─────────▶│  /api/cron/noticias  (1 vez al día)      │
   (HTML)           │  1. hash de la fuente                    │
                    │  2. ¿cambió? → borrador en `noticias`    │
                    │  3. reenvía envíos pendientes            │
                    │  4. ¿lunes? → arma el digest             │
                    └───────────────┬──────────────────────────┘
                                    │ encola
                                    ▼
   ┌─────────────┐          ┌───────────────┐         ┌──────────────────┐
   │  /admin     │  botón   │   `envios`    │────────▶│ email (Gmail)    │
   │  Noticias   │─────────▶│  (Postgres)   │         │ nodemailer/SMTP  │
   │  WhatsApp   │          └───────┬───────┘         └──────────────────┘
   └──────┬──────┘                  │
          │ QR (proxy admin)        │ HTTP + token
          ▼                         ▼
   ┌──────────────────────────────────────────────┐
   │  Servicio Go (Render free / Railway)         │
   │  whatsmeow + sqlstore  ──▶  WhatsApp (multi) │
   │  sesión en Neon o en volumen propio          │
   └──────────────────────────────────────────────┘
```

Todo lo de Vercel vive **dentro del catch-all** `api/[...ruta].ts`: no se añade
ninguna función serverless (seguimos en 12).

---

## 4. Modelo de datos

Cuatro tablas nuevas, ninguna toca las existentes. Va en `db/schema.sql`,
idempotente como el resto.

```sql
-- ------------------------------------------------------------
-- Noticias: lo que el estudio quiere contar a sus clientes.
-- `estado` separa lo que un humano está escribiendo de lo que
-- ya salió: nada en `borrador` puede enviarse.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noticias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        NOT NULL UNIQUE,
  titulo       text        NOT NULL,
  resumen      text        NOT NULL DEFAULT '',
  cuerpo       text        NOT NULL DEFAULT '',
  -- 'sunat' | 'tributario' | 'laboral' | 'estudio'
  categoria    text        NOT NULL DEFAULT 'sunat',
  -- 'manual' | 'cronograma' | 'renta-anual' | 'noticias-sunat'
  fuente       text        NOT NULL DEFAULT 'manual',
  fuente_url   text,
  -- 'borrador' | 'publicada' | 'archivada'
  estado       text        NOT NULL DEFAULT 'borrador',
  -- Ordena el feed y el digest; NULL mientras sea borrador.
  publicada_en timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS noticias_estado_idx
  ON public.noticias (estado, publicada_en DESC NULLS LAST);

-- ------------------------------------------------------------
-- Preferencias de aviso por cliente. Una fila por usuario.
-- `baja_token` permite darse de baja sin sesión desde un email.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suscripciones (
  user_id           uuid PRIMARY KEY,
  email             text,
  -- E.164 sin signos: 51987654321
  whatsapp          text,
  canal_email       boolean NOT NULL DEFAULT true,
  canal_whatsapp    boolean NOT NULL DEFAULT false,
  activo            boolean NOT NULL DEFAULT true,
  -- Ley 29733: hay que poder probar cuándo y cómo aceptó.
  consentimiento_en timestamptz,
  consentimiento_ip text,
  baja_token        uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS suscripciones_baja_token_idx
  ON public.suscripciones (baja_token);

-- ------------------------------------------------------------
-- Cola de envíos. Una fila por (noticia, usuario, canal).
-- `lote` agrupa las filas que salieron en el MISMO digest: así
-- un email con 3 noticias no se cuenta como 3 emails distintos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.envios (
  id           bigserial PRIMARY KEY,
  noticia_id   uuid        NOT NULL REFERENCES public.noticias(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL,
  canal        text        NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  destino      text        NOT NULL,
  lote         uuid,
  -- 'pendiente' | 'enviado' | 'fallido' | 'omitido'
  estado       text        NOT NULL DEFAULT 'pendiente',
  intentos     integer     NOT NULL DEFAULT 0,
  proveedor_id text,
  error        text,
  enviado_en   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Idempotencia: un reintento del cron no puede duplicar el envío.
  UNIQUE (noticia_id, user_id, canal)
);

CREATE INDEX IF NOT EXISTS envios_pendientes_idx
  ON public.envios (estado, created_at)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS envios_noticia_idx
  ON public.envios (noticia_id, estado);

-- ------------------------------------------------------------
-- Huella de cada fuente que vigila el detector. `hash` es del
-- contenido normalizado (no del HTML crudo con la fecha de hoy),
-- para que un "última actualización" no dispare un falso positivo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuente_snapshots (
  clave        text PRIMARY KEY,
  hash         text        NOT NULL,
  contenido    jsonb,
  etag         text,
  revisado_en  timestamptz NOT NULL DEFAULT now(),
  -- Cuándo se detectó el último cambio real.
  cambiado_en  timestamptz
);
```

Notas:

- **Sin FK a `neon_auth`**: igual que `profiles`, es un esquema administrado y
  no queremos que una migración de Neon Auth arrastre nuestras filas.
- **`UNIQUE (noticia_id, user_id, canal)`** es la pieza que evita el bug clásico
  de las automatizaciones: mandar dos veces la misma cosa porque el cron
  reintentó.
- **`whatsmeow` crea sus propias tablas** (`whatsmeow_device`, `whatsmeow_*`)
  en la base que se le pase, con su prefijo. No chocan con las nuestras. Si esa
  base es Neon, su pool se limita a 5 conexiones para no agotar el límite; con
  SQLite en volumen no hay límite que respetar.

---

## 5. Backend: endpoints

Todos entran en `api/[...ruta].ts` → `RUTAS`. Ninguna función nueva.

| Ruta | Guard | Qué hace |
|---|---|---|
| `GET /api/admin/noticias` | `requireAdmin` | lista con filtro por estado y categoría |
| `POST /api/admin/noticias` | `requireAdmin` | crea borrador (manual o desde un snapshot) |
| `PATCH /api/admin/noticias` | `requireAdmin` | edita, publica, archiva, descarta |
| `POST /api/admin/noticias/enviar` | `requireAdmin` | `{ id, canales, modo: 'ahora'\|'cola' }` → encola y, si `ahora`, procesa en la misma invocación |
| `GET /api/admin/envios` | `requireAdmin` | estado por noticia y por usuario; errores legibles |
| `GET /api/admin/whatsapp/estado` | `requireAdmin` | proxy al servicio Go: vinculado, número, último error |
| `POST /api/admin/whatsapp/vincular` | `requireAdmin` | proxy: pide el QR y lo devuelve como PNG (base64) |
| `POST /api/admin/whatsapp/desvincular` | `requireAdmin` | cierra la sesión de WhatsApp |
| `GET /api/noticias` | sesión | feed de publicadas para `/panel` y la guía |
| `POST /api/suscripcion` | sesión | el cliente elige canal, teléfono y consentimiento |
| `GET /api/baja?token=` | público | baja sin login desde el enlace del email |
| `GET /api/cron/noticias` | `CRON_SECRET` | detector + reintentos + digest del lunes |

Detalles que importan:

- **`POST .../enviar`** crea las filas en `envios` con `ON CONFLICT DO NOTHING`
  y luego intenta procesarlas. Con 2–10 clientes eso son segundos. Si algo
  falla, la fila queda `pendiente` y el cron la recoge al día siguiente. No se
  pierde nada y no hay un job aparte.
- **`GET /api/cron/noticias`** valida `Authorization: Bearer ${CRON_SECRET}`.
  Vercel lo manda solo en las invocaciones de cron, pero la URL es pública: sin
  el secreto responde 401 y no hace trabajo.
- **`/api/baja`** no pide sesión a propósito (nadie quiere loguearse para darse
  de baja) y no revela el email: con el token, responde una página de
  confirmación.
- **Ritmo de envío**: 1 s de pausa entre mensajes de WhatsApp y 200 ms entre
  emails. Con pocos destinatarios no se nota; con 50 evita que Meta o Google
  miren el patrón como ráfaga.

### 5.1 Cron en `vercel.json`

```jsonc
{
  "crons": [
    { "path": "/api/cron/noticias", "schedule": "0 12 * * *" }
  ],
  "functions": {
    "api/[...ruta].ts": {
      "includeFiles": "api/_lib/**/*.ts",
      "maxDuration": 300
    }
  }
}
```

`12:00 UTC` = **07:00 en Lima**. Hobby permite una ejecución diaria y avisa
que puede desviarse hasta 59 minutos; para un digest semanal es irrelevante,
para «al instante» no sirve (y por eso no lo prometemos).

---

## 6. Canal email (Gmail + contraseña de aplicación)

### 6.1 Primero: rotar la credencial

La contraseña de aplicación que compartiste en el chat hay que tratarla como
**comprometida**. Antes de escribir una línea de código:

1. Entrar a `myaccount.google.com/apppasswords` y **revocar** la que se pegó.
2. Crear una nueva.
3. Guardarla **solo** en `GMAIL_APP_PASSWORD` (Vercel → Settings → Environment
   Variables, y el `.env` local que ya está en `.gitignore`).
4. Nunca en el repo, ni en este `.md`, ni en un commit, ni en una captura.

Si además la cuenta no tiene 2FA activo, la contraseña de aplicación no existe:
hay que activar la verificación en dos pasos primero.

### 6.2 Implementación

`nodemailer` (una dependencia, sin SDK propietario):

```ts
// api/_lib/canales/email.ts
import nodemailer from 'nodemailer';

const transporte = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});
```

El cuerpo se arma con plantilla propia (HTML simple, sin librería): cabecera con
el nombre del estudio, lista de noticias, pie con el enlace de baja. Nada de
imágenes remotas, que es la causa número uno de caer en spam.

### 6.3 Límites reales

| Límite | Valor | Consecuencia |
|---|---|---|
| Destinatarios/día (Gmail gratis) | ~500 | Con 2–50 clientes, sobra |
| Destinatarios/día (Workspace) | ~2,000 | — |
| Ritmo seguro | ~100/hora | Se respeta con la pausa de 200 ms y lotes pequeños |
| From | la propia cuenta Gmail | No se puede falsificar el dominio sin verificación |

Si el estudio crece a cientos de clientes, esto deja de servir y toca Resend
con dominio verificado. Por eso el adaptador tiene `EMAIL_PROVIDER`.

---

## 7. Canal WhatsApp (`whatsmeow`)

### 7.1 Qué es exactamente ese repo

`/home/isma/projects/api free ai/whatsmeow-main` es **la librería**, no un
servicio: `module go.mau.fi/whatsmeow`, sin `main.go`. Trae `client.go`
(`NewClient`), `qrchan.go` (los QR), `send.go` y `store/sqlstore` — que
**soporta Postgres de forma nativa**, justo lo que necesitamos para un hosting
sin disco.

Así que hay que **envolverla en un servicio propio**: un `main.go` de ~300
líneas. No se modifica la librería.

### 7.2 El servicio

Repo o carpeta aparte (`whatsapp-service/`), módulo propio:

```go
// go.mod
module estudio/whatsapp

require go.mau.fi/whatsmeow v0.0.0
replace go.mau.fi/whatsmeow => ../whatsmeow-main   // en local
// en producción: go get go.mau.fi/whatsmeow@<commit>
```

```
whatsapp-service/
  main.go      // servidor HTTP, rutas, token interno
  sesion.go    // arranque, store en Postgres, reconexión
  qr.go        // emisión del QR y PNG (skip2/go-qrcode)
  enviar.go    // POST /send con validación de destino
```

Endpoints (todos exigen `X-Servicio-Token`):

| Ruta | Qué hace |
|---|---|
| `GET /health` | 200 si el proceso vive (para el cron y para Render) |
| `GET /status` | `{ conectado, jid, desde, ultimo_error }` |
| `GET /qr` | el QR vigente como PNG base64, o `204` si ya está vinculado |
| `POST /pair` | arranca el emparejamiento y devuelve el primer QR |
| `POST /send` | `{ to: "51987654321", texto }` → `{ id }` |
| `POST /logout` | cierra la sesión y borra el dispositivo del store |

Sesión persistente, sin depender del disco del contenedor:

```go
// Una de las dos, según el hosting (ver §7.4).
var container *sqlstore.Container
if dsn := os.Getenv("WA_DB_URL"); dsn != "" {
    // Render free: no hay disco, la sesión vive en Neon.
    container, _ = sqlstore.New(ctx, "postgres", dsn, nil)
} else {
    // Railway / Render Starter: volumen propio, SQLite.
    container, _ = sqlstore.New(ctx, "sqlite3", "file:"+os.Getenv("WA_DB_PATH")+"?_foreign_keys=on", nil)
}
device, _ := container.GetFirstDevice(ctx)   // nil la primera vez
client := whatsmeow.NewClient(device, nil)   // EnableAutoReconnect ya viene en true
```

`sqlstore` ya está dentro del repo de la librería (`store/sqlstore`) y su
comentario lo confirma: «Only SQLite and Postgres are currently fully
supported». No hace falta traer nada externo.

Sea cual sea la opción, la sesión sobrevive a un reinicio o a un arranque en
frío: si el servicio se duerme o se reinicia, al volver retoma el vínculo y
**no hay que volver a escanear el QR**.

- `WA_DB_URL` → **Neon** (la misma base u otra, con prefijo propio). Es lo que
  se usa en Render free, donde no hay disco.
- `WA_DB_PATH` → **SQLite en el volumen** (`/data/wa.db`). Es lo que se usa en
  Railway, donde sí hay disco y además sale más barato de mantener.

### 7.3 El QR en `/admin`

El QR nunca toca el navegador directamente desde el servicio Go. El flujo es:

1. Admin abre `/admin` → pestaña **WhatsApp** → «Vincular número».
2. `POST /api/admin/whatsapp/vincular` (Vercel, con `requireAdmin`).
3. Vercel llama `POST /pair` al servicio Go con el token interno.
4. Go arranca el canal de QR (`client.GetQRChannel`), conecta y devuelve el
   primer código como PNG.
5. El panel muestra la imagen y consulta `/estado` cada 3 s. Cuando
   `conectado: true`, el modal se cierra con el número vinculado.
6. El QR caduca a los ~20 s; `whatsmeow` emite uno nuevo y el panel lo refresca
   sin que el admin haga nada.

Nada de esto queda accesible sin sesión de admin: el token del servicio no se
expone al navegador en ningún momento.

### 7.4 Dónde alojarlo: Render o Railway

`whatsmeow` **no puede vivir en Vercel**. Necesita un proceso que mantenga un
WebSocket abierto con WhatsApp durante días; una función serverless muere a los
300 s. Por eso el servicio Go va aparte, y ahí la decisión es dónde.

Precios verificados en noviembre de 2026:

| | Render free | Railway Free | Railway Hobby | Render Starter |
|---|---|---|---|---|
| Precio | $0 | $0 | **$5/mes** | $7/mes |
| Crédito de consumo incluido | — | $1/mes | $5/mes | — |
| **Se duerme por inactividad** | **Sí, a los 15 min** | No | No | No |
| Arranque en frío | ~1 min | — | — | — |
| Tope duro | 750 h-instancia/mes | se corta al agotar $1 | ninguno | ninguno |
| Disco persistente | **No** | 500 MB (volumen) | 5 GB (volumen) | de pago |
| Dominio propio | sí | no (usa `*.up.railway.app`) | sí | sí |

#### Los tres hechos que deciden

**1. En Render free no controlas si duerme o no.** Su documentación dice que se
apaga tras 15 min «sin tráfico entrante, **incluidos los mensajes WebSocket de
conexiones existentes**». `whatsmeow` manda keepalives cada ~30 s y recibe
respuesta. Entonces pasa una de dos:

- Render no cuenta ese tráfico → **se duerme** y cada envío paga ~1 min de
  arranque en frío;
- Render sí lo cuenta → **no se duerme nunca** → 744 h en un mes de 31 días
  contra un tope de 750. Si se pasa, Render **suspende todos los servicios free
  del workspace** hasta el mes siguiente.

Ninguno de los dos desenlaces es bueno, y no se puede elegir.

**2. Railway free tampoco es gratis de verdad.** Da $1 de crédito mensual. Un
contenedor encendido 24/7 con Go + `whatsmeow` consume:

- RAM ~60–100 MB → 0.06–0.10 GB × $10/GB-mes ≈ **$0.60–1.00**
- CPU en reposo ~2–5 % de un core × $20/vCPU-mes ≈ **$0.40–1.00**

Total ≈ **$1–2/mes**. Está justo en el borde: unos meses entra en el crédito y
otros se corta a mitad de mes, dejando el número desconectado sin avisar.

**3. Railway Hobby son $5 planos, con $5 de consumo incluido.** El gasto real
(~$1.50) cabe holgado: pagas $5, no $5 más consumo. Es el único escenario
**predecible** y **siempre despierto**.

#### Decisión

| Escenario | Elección | Por qué |
|---|---|---|
| **Demo del curso** | **Render free** | $0, el QR se escanea igual y el minuto de frío no arruina la demostración |
| **El estudio lo adopta** | **Railway Hobby ($5/mes)** | Siempre despierto; el minuto de espera es inadmisible con un cliente delante |

Y una ventaja técnica que inclina la balanza: **con volumen persistente la
sesión puede vivir en SQLite** (`file:/data/wa.db?_foreign_keys=on`), que es el
setup canónico de `whatsmeow` según su propio README. En Render free, al no
haber disco, hay que meter las ~10 tablas `whatsmeow_*` en Neon y sostener un
pool contra una base serverless que se auto-suspende: funciona, pero son más
piezas para el mismo resultado.

#### Compromiso: el `Dockerfile` es portable desde el día uno

No se escribe nada específico de un proveedor. El mismo binario corre en los
dos, y cambiar de hosting son minutos, no una reescritura:

```dockerfile
# Dockerfile — sirve igual en Render (free/Starter) y en Railway
FROM golang:1.26 AS build
WORKDIR /src
COPY . .
# CGO es obligatorio para go-sqlite3 (la sesión en volumen).
RUN CGO_ENABLED=1 go build -trimpath -o /out/whatsapp .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data
COPY --from=build /out/whatsapp /usr/local/bin/whatsapp
EXPOSE 8080
CMD ["whatsapp"]
```

Si se usa Neon en vez de SQLite, `CGO_ENABLED=0` y el binario queda estático
(~15 MB). La versión con CGO pesa más pero es la que permite el volumen.

La única diferencia es una variable de entorno:

| Variable | Render free | Railway Hobby |
|---|---|---|
| `WA_DB_URL` | `postgres://…` (Neon, sin disco) | vacío |
| `WA_DB_PATH` | vacío | `/data/wa.db` (volumen) |

`sesion.go` elige según cuál esté definida. Así la fase 5 se desarrolla gratis
en Render y, si el estudio lo adopta, se cambia de proveedor sin tocar código.

> Detalles de Render free que ya verificamos y conviene tener escritos:
> **bloquea la salida a los puertos 25, 465 y 587** (irrelevante: el email sale
> de Vercel), **reinicia el servicio cuando quiere** (la sesión en base de datos
> lo absorbe) y **no tiene acceso por SSH**.

> Nota sobre el desvinculado: WhatsApp elimina un dispositivo vinculado que pasa
> mucho tiempo sin actividad (~14 días). Un digest semanal lo mantiene dentro del
> margen, pero si el estudio pasa un mes sin publicar nada, conviene abrir
> `/admin` → WhatsApp y comprobar que sigue vinculado antes de la demo.

### 7.5 Riesgo de ban (esto hay que decirlo)

`whatsmeow` se hace pasar por un dispositivo vinculado de WhatsApp Web. **No es
la API oficial y va contra los términos de servicio.** Un número que manda
mensajes a contactos que no lo tienen agendado, en ráfaga, tiene probabilidad
real de ser bloqueado.

Mitigaciones, en orden de importancia:

1. **Chip dedicado** al estudio, nunca el número personal del dueño.
2. Solo a clientes con opt-in registrado (§8).
3. Volumen bajo (2–50 mensajes por envío) y con pausas.
4. Texto con salida clara («responde BAJA»), sin links acortados.
5. Tener la API oficial como plan B documentado, no como ocurrencia de último
   minuto.

---

## 8. Opt-in, baja y Ley 29733

El teléfono y el email son datos personales. La Ley 29733 (Perú) pide
consentimiento, finalidad determinada y derecho de baja. En WhatsApp, además,
Meta lo exige por política.

Implementación concreta, sin abogados de por medio:

- En `/panel` → **Mi cuenta**, un bloque «Avisos del estudio»:
  - casilla **Email** (marcada por defecto a quien ya es cliente del estudio),
  - casilla **WhatsApp** (desmarcada; al marcarla hay que escribir el número y
    confirmar el texto: «Acepto recibir avisos por WhatsApp al número …»),
  - texto de finalidad: «Avisos tributarios y novedades de SUNAT. No se comparte
    con terceros».
- Se guarda `consentimiento_en` e `consentimiento_ip` (esto es lo que se enseña
  si alguien reclama).
- Todo email y todo WhatsApp termina con «Responder BAJA» y, en email, un enlace
  `/baja?token=…` que funciona sin login.
- Baja = `activo = false`. No se borra la fila: se recuerda para no volver a
  incluir a esa persona si se reimporta la lista.

---

## 9. Redacción con IA (opcional)

El modelo no decide hechos, solo redacta. Es una decisión de diseño, no una
precaución cosmética: un LLM que «resume» un cronograma puede inventar una
fecha, y eso en un estudio contable es responsabilidad profesional.

**Dónde se usa:**

- Convertir tres títulos y sus resúmenes verificados en un párrafo de apertura
  del digest («Esta semana SUNAT publicó…»).
- Suavizar el tono de un borrador generado por el detector.

**Dónde no se usa:**

- Extraer fechas, montos o números de la fuente. Eso lo hace el parser que ya
  existe y, si falla, no se publica.
- Decidir qué es noticia ni a quién enviarla.

**Cómo:**

```
GROQ_API_KEY   → https://api.groq.com/openai/v1/chat/completions
modelo         → llama-3.3-70b-versatile (plan gratis)
alternativa    → OpenRouter con un modelo :free
```

Reglas del prompt: temperatura 0.3, máximo 120 tokens, prohibido introducir
cifras o URLs que no estén en la entrada, y salida rechazada si supera el doble
del largo esperado. Si la llamada falla o tarda más de 8 s, **se usa la
plantilla determinista** y el envío sigue. La IA nunca es un punto único de
fallo.

Costo: $0 dentro del plan gratis. No se envía al modelo ningún dato de clientes,
solo el texto de la noticia.

---

## 10. Frontend

| Archivo | Cambio |
|---|---|
| `src/pages/AdminPage.tsx` | `TABS` += `noticias`, `whatsapp` |
| `src/components/admin/NoticiasPanel.tsx` | **nuevo**: lista con estado, editor (título, resumen, cuerpo, categoría, fuente), vista previa del email/WhatsApp, botones «Publicar», «Publicar y enviar ahora», «Enviar solo a mí» (prueba), y tabla de envíos por cliente |
| `src/components/admin/WhatsAppPanel.tsx` | **nuevo**: estado de la sesión, botón «Vincular número» con el QR, botón «Desvincular», último error |
| `src/components/panel/AccountPanel.tsx` | bloque «Avisos del estudio» con canales, teléfono y consentimiento |
| `src/components/panel/GuidePanel.tsx` | dejar de usar el array fijo y leer `GET /api/noticias`; los 4 artículos actuales se siembran como noticias publicadas |
| `src/pages/BajaPage.tsx` | **nuevo**: página pública `/baja/:token`, confirma la baja sin pedir sesión |

«Enviar solo a mí» es pequeño y vale mucho: permite enseñar el resultado al
profesor sin mandarle nada a un cliente real.

### 10.1 Cómo se ve el mensaje

Email (asunto: `Resumen SUNAT · semana del 9 al 15 de noviembre`):

```
Sánchez Delgado & Asociados

Esta semana en SUNAT

1. Cronograma 2027 ya está publicado
   Vence el 15 de diciembre para los RUC terminados en 1.
   Leer más →

2. Nueva versión del SIRE
   Cambia el formato del registro de ventas desde enero.
   Leer más →

Este mensaje es informativo y no reemplaza una consulta con tu contador.
Darse de baja
```

WhatsApp (mismo contenido, más corto, sin HTML):

```
*Resumen SUNAT — 9 al 15 de noviembre*

1. Cronograma 2027 publicado
Vence el 15/12 para RUC terminados en 1.

2. Nueva versión del SIRE
Cambia el formato de ventas desde enero.

Fuente: sunat.gob.pe
Responde BAJA para no recibir más.
```

---

## 11. Detección de noticias nuevas

De más fiable a más frágil:

1. **Manual** (el admin escribe y publica). Cero riesgo, cero falso positivo.
2. **Cronogramas SUNAT** — `cronograma.ts` y `renta-anual.ts` ya parsean y ya
   tienen respaldo embebido. Se calcula un hash del **resultado normalizado**
   (no del HTML crudo) y se compara con `fuente_snapshots`:
   - igual → nada,
   - distinto → borrador con título neutro: «SUNAT actualizó el cronograma
     2027» + enlace a la fuente + el diff resumido.
3. **Página de noticias de SUNAT** — no hay API pública. Se scrapea y se
   verifica si mantienen un feed estable. Es lo más frágil; se implementa
   **después** de las dos anteriores y con el mismo patrón de borrador.

Normalizar antes de hashear es lo que evita el falso positivo diario: la página
lleva «última actualización 15/11/2026» y un contador de visitas, y eso cambia
solo sin que cambie nada relevante. Se hashea el cronograma ya parseado.

---

## 12. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Ban del número por WhatsApp no oficial | Media | Alto | Chip dedicado, opt-in, volumen bajo, pausas, plan B con API oficial |
| Credencial de Gmail comprometida | **Alta hoy** | Alto | Rotarla antes de empezar; solo en variables de entorno |
| Email cae en spam | Media | Medio | Sin imágenes remotas, remitente real, volumen bajo, enlace de baja visible |
| Falso positivo de SUNAT enviado a clientes | Media | **Muy alto** | Borrador obligatorio; nada sale sin que un humano publique |
| Cron de Hobby con ±59 min de desvío | Alta | Bajo | Digest semanal, no alerta urgente |
| Servicio de WhatsApp dormido (1 min) | Alta | Bajo | El cron despierta y espera; `maxDuration` 300 s lo cubre |
| Render free: duerme **o** consume las 750 h, sin poder elegir | Media | Medio | Se asume en la demo; al adoptarlo, Railway Hobby ($5) |
| El número se desvincula solo por ~14 días sin actividad | Baja | Medio | Comprobar `/admin` → WhatsApp antes de cada demo; el digest semanal lo mantiene activo |
| Duplicados por reintento | Media | Medio | `UNIQUE (noticia_id, user_id, canal)` |
| `whatsmeow` rompe tras un cambio de WhatsApp | Media | Alto | Es la misma librería que usa medio internet; se actualiza el commit y se prueba el QR |
| Conexiones a Neon agotadas | Baja | Medio | Pool de 5 en Go, `@neondatabase/serverless` en Vercel |
| Datos personales sin base legal | Baja | Alto | Consentimiento con fecha e IP, baja en un clic, finalidad escrita |

---

## 13. Costos

| Pieza | Demo | Operación real |
|---|---|---|
| Vercel Hobby | $0 (cron no añade función) | $0 |
| Neon Postgres | $0 | $0 |
| Gmail SMTP | $0 | $0 |
| Groq (redacción) | $0 | $0 |
| WhatsApp — **Render free** | $0 (con sueño y arranque de ~1 min) | — |
| WhatsApp — **Railway Hobby** | — | **$5/mes** planos (consumo real ~$1.50) |
| WhatsApp — Railway Free | — | $0 con $1 de crédito: se corta a mitad de mes |
| Resend (solo si Gmail falla) | $0 hasta 3,000/mes | $0 |
| **Total** | **$0** | **$5/mes** |

---

## 14. Fases y esfuerzo

| Fase | Entrega | Días |
|---|---|---|
| **0** | Rotar la contraseña de aplicación, crear variables de entorno, decidir número de WhatsApp | 0.5 |
| **1** | Esquema SQL, seed de las 4 noticias actuales, `admin/noticias` (CRUD), editor y vista previa | 2 |
| **2** | Envío por email (nodemailer), preferencias y baja en `/panel`, `/baja/:token` | 1.5 |
| **3** | Cron diario, reintentos, digest de los lunes, panel de estado de envíos | 1 |
| **4** | Detector de cronogramas por hash → borradores | 1 |
| **5** | Servicio Go con `whatsmeow`, `Dockerfile` portable, QR en `/admin`, envío. Se desarrolla contra Render free (sesión en Neon) | 3–4 |
| **6** | Redacción con Groq/OpenRouter y plantilla de respaldo | 0.5 |
| **7** | Endurecer: límites, logs, pruebas, documento de operación | 1 |

**Fases 0–4 (≈6 días)** ya cumplen lo que pidió el profesor: noticia nueva
detectada → revisión → email a los clientes, con digest semanal.

**Fase 5** añade WhatsApp, que es lo más visible en la demo pero también lo que
más depende de un servicio externo. La fase se entrega funcionando en **Render
free** (sesión en Neon vía `WA_DB_URL`); pasar a **Railway Hobby** después es
cambiar `WA_DB_URL` por `WA_DB_PATH` (SQLite en el volumen) y redeployar, sin
reescribir el servicio.

---

## 15. Criterios de aceptación

Para que esto se pueda llamar «terminado»:

1. Cambiar a mano el HTML de SUNAT (o el respaldo embebido) genera **un
   borrador** en `/admin` en la siguiente ejecución del cron, y **ningún
   envío**.
2. «Publicar y enviar ahora» llega a la bandeja de los 2 clientes reales y deja
   una fila `enviado` por destinatario y canal.
3. Relanzar el cron no duplica ningún envío (`0` filas nuevas).
4. El lunes, lo publicado y no enviado sale en un **solo** mensaje por canal.
5. El enlace de baja funciona sin sesión y deja de enviar en el siguiente ciclo.
6. El QR se ve en `/admin`, se escanea y `GET /status` responde `conectado`;
   reiniciar el servicio **no** vuelve a pedir QR.
7. El mismo binario (`Dockerfile`) despliega en Render y en Railway: con
   `WA_DB_URL` usa Postgres y con `WA_DB_PATH` usa SQLite, sin recompilar.
8. Un `user` recibe 403 en todos los endpoints `admin/*`; el cron sin
   `CRON_SECRET` recibe 401.
9. `npm run test`, `tsc --noEmit` y `npm run build` en verde, con casos nuevos
   para: idempotencia, guard 403, baja por token y hash sin cambio.

---

## 16. Variables de entorno

Ninguna se escribe en el repo.

```
# Email (Gmail) — rotar antes de usar
GMAIL_USER=estudio@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
EMAIL_FROM="Sánchez Delgado & Asociados <estudio@gmail.com>"
EMAIL_PROVIDER=gmail            # gmail | resend
RESEND_API_KEY=                 # solo si EMAIL_PROVIDER=resend

# WhatsApp (servicio Go; las dos primeras van en Vercel, el resto en el hosting)
WA_SERVICIO_URL=https://<servicio>.onrender.com   # o https://<servicio>.up.railway.app
WA_SERVICIO_TOKEN=<aleatorio largo>

# Sesión de whatsmeow — elegir UNA según el hosting:
WA_DB_URL=postgres://...        # Render free (Neon, sin disco)
WA_DB_PATH=/data/wa.db          # Railway / Render Starter (volumen persistente)

# Cron
CRON_SECRET=<aleatorio largo>

# IA (opcional)
GROQ_API_KEY=
```

---

## 17. Decisiones pendientes

1. **Número de WhatsApp.** ¿Chip nuevo dedicado al estudio, o el número actual
   asumiendo el riesgo? Recomiendo chip nuevo.
2. **Remitente del email.** ¿La cuenta Gmail del estudio o una cuenta creada
   para esto? Si el estudio tiene `@sanchezdelgado.pe` con Workspace, sale de
   ahí y gana reputación.
3. **Frecuencia del digest.** Lunes 07:00 (propuesto), o viernes por la tarde.
4. **Qué se considera noticia.** ¿Solo lo que detecte el scraper, o también
   comunicados propios del estudio (feriados, cierre, nuevos servicios)? El
   modelo ya lo permite con `categoria = 'estudio'`.
5. **¿WhatsApp en la demo o solo email?** Cambia el orden de las fases, no el
   diseño.
6. **Hosting del servicio Go.** Propuesto: desarrollar en Render free y decidir
   Railway Hobby ($5/mes) cuando el estudio lo use de verdad. Confirmar (§7.4).

---

## 18. Lo que este plan no hace

- No envía nada sin revisión humana (salvo el digest de noticias **ya
  publicadas** por el admin).
- No crea un boletín con plantillas HTML de marketing.
- No usa la API oficial de WhatsApp, y por tanto no promete cumplimiento de sus
  términos.
- No sustituye al contador: el texto del pie lo dice explícitamente.
- No implementa nada todavía. Este documento es la propuesta.
