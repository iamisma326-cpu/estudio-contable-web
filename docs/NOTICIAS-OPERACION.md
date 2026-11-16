# Operación — Avisos de noticias por email y WhatsApp

Implementación de [`PLAN-NOTICIAS.md`](./PLAN-NOTICIAS.md). Esta guía es la
parte que se usa el día a día: variables, despliegue, cómo se envía y qué
revisar antes de una demo.

## Qué está construido

| Pieza | Dónde |
|---|---|
| Tablas `noticias`, `suscripciones`, `envios`, `fuente_snapshots` | `db/schema.sql` |
| Detector de cronogramas por hash → borrador | `api/_lib/noticias/detector.ts` |
| Cola idempotente (envío manual y reintentos) | `api/_lib/noticias/cola.ts` |
| Email Gmail (o Resend) | `api/_lib/noticias/email.ts` |
| WhatsApp contra el servicio Go | `api/_lib/noticias/whatsapp.ts` |
| Rutas admin, feed, suscripción, baja y cron | `api/_rutas/` |
| CRM de noticias y QR | `src/components/admin/NoticiasPanel.tsx`, `WhatsAppPanel.tsx` |
| Preferencias del cliente, baja pública y notificaciones | `AccountPanel.tsx`, `BajaPage.tsx`, `NotificacionesPanel.tsx` |
| Servicio Go `whatsmeow` | `whatsapp-service/` |

Ninguna función serverless nueva: todo entra por `api/[...ruta].ts`.

## Variables de entorno

En **Vercel** (Production y Preview):

```
WA_SERVICIO_URL=https://estudio-whatsapp-production.up.railway.app
WA_SERVICIO_TOKEN=<secreto largo, el mismo que en Railway>
CRON_SECRET=<secreto largo>
EMAIL_PROVIDER=gmail
GMAIL_USER=<cuenta del estudio>
GMAIL_APP_PASSWORD=<contraseña de aplicación de 16 caracteres>
EMAIL_FROM="Sánchez Delgado & Asociados <cuenta@gmail.com>"
APP_URL=https://estudio-contable-web-chi.vercel.app
# opcional: destino de «Enviar solo a mí» en demos
EMAIL_TEST_TO=iamisma326@gmail.com
```

En **Railway** (servicio `estudio-whatsapp`):

```
WA_SERVICIO_TOKEN=<el mismo de Vercel>
WA_DB_PATH=/data/wa.db
WA_BAJA_WEBHOOK_URL=https://estudio-contable-web-chi.vercel.app/api/whatsapp/baja
PORT=8080
```

`WA_DB_URL` solo se usa si se despliega en un hosting sin disco (Render free),
con una cadena Postgres de Neon. Si está definida, gana sobre `WA_DB_PATH`.

### Contraseña de aplicación de Gmail

1. Activar verificación en dos pasos en la cuenta.
2. `myaccount.google.com/apppasswords` → crear una nueva.
3. Guardarla solo en `GMAIL_APP_PASSWORD` (Vercel y `.env` local, que está
   ignorado por git). Si alguna se compartió por chat, revocarla antes.

## Envío

- **Manual y único camino**: `/admin` → Noticias → «Publicar y enviar ahora».
  Publica y manda a todos los clientes que aceptaron recibir avisos, por email
  y WhatsApp. No hay digest ni envío automático programado.
- **Prueba**: «Enviar solo a mí» se guarda con `prueba=true`; no cuenta como
  envío real ni aparece en la bandeja del cliente. Si existe `EMAIL_TEST_TO`,
  ese botón usa esa dirección en vez del correo del admin.
- **Reintentos**: si un envío falla, el admin puede volver a pulsar «Publicar
  y enviar ahora»; se reprocesan las filas pendientes de esa noticia y canal.
  La clave única `(noticia_id, user_id, canal)` impide duplicados.
- **Baja antes del envío**: si el cliente se da de baja o apaga un canal
  después de encolar, la fila pendiente se marca `omitido` y no sale.
- **Sin cron**: `/api/cron/noticias` queda solo como mantenimiento manual
  (detección de cambios SUNAT y reintentos). No está programado en Vercel y no
  envía noticias.

## WhatsApp

1. `/admin` → WhatsApp → «Vincular número».
2. Escanear el QR desde el chip dedicado del estudio.
3. Reiniciar el servicio **no** vuelve a pedir QR: la sesión vive en
   `/data/wa.db` del volumen de Railway.
4. El QR se renueva solo en el panel mientras está abierto. whatsmeow manda
   el tiempo real de cada código (el primero puede durar 60 s; los siguientes
   unos 20 s), y el panel lo reemplaza sin recargar.
5. Si un cliente responde **BAJA** por WhatsApp, el servicio Go avisa al
   webhook `WA_BAJA_WEBHOOK_URL` y se desactivan sus canales. El webhook está
   protegido con `WA_SERVICIO_TOKEN`; no se llama desde el navegador.

Riesgo asumido: `whatsmeow` no es la API oficial y un número puede ser
bloqueado. Chip dedicado, opt-in, volumen bajo, pausas y un plan B con la API
oficial.

## Pruebas

```bash
npm run test:noticias   # normalización, hash, idempotencia, baja por token
npm run lint
npm run build
```

La prueba de noticias usa la base de `.env` y limpia sus filas al terminar.
Si no hay `DATABASE_URL`, las pruebas de cola/baja se omiten y las unitarias
siguen corriendo (útil en CI o en un clon sin secretos).

## Registro y preferencias

- El teléfono es **obligatorio** al crear la cuenta. Se guarda normalizado en
  `profiles.telefono` y en `suscripciones.whatsapp`.
- Hay **una sola aceptación** en el registro: si el cliente la marca, quedan
  activos email y WhatsApp; si no la marca, no se le envía nada. No hay una
  suscripción separada ni un segundo opt-in.
- En `/panel` → Mi cuenta puede volver a activar o desactivar los canales
  cuando quiera. Marcar un canal es la aceptación; guardamos fecha e IP
  (Ley 29733).
- Una cuenta antigua sin teléfono puede seguir entrando y actualizarlo en Mi
  cuenta; la obligación se aplica a los perfiles nuevos.
- La pestaña **Notificaciones** del panel del cliente muestra las noticias que
  ya recibió, con el canal usado (Gmail/WhatsApp). Es solo lectura.
- Las cuentas que existían antes de este cambio y no tenían una aceptación
  registrada con IP quedaron **desactivadas**. Deben activar sus avisos desde
  «Mi cuenta» para volver a recibirlos; no se les envía nada mientras no lo
  hagan.

## Baja

- El enlace del correo (`/baja?token=…`) **valida** el token con GET y recién
  aplica la baja con POST. Así un escáner de enlaces o un prefetch del correo
  no da de baja a nadie sin que la persona abra la página.
- La baja por WhatsApp se procesa con la respuesta **BAJA** en el chat directo;
  los mensajes de grupo se ignoran.
- La fila no se borra: queda `activo=false` para no volver a importar a quien
  ya pidió no recibir avisos.
