# Operación — Avisos de noticias por email y WhatsApp

Implementación de [`PLAN-NOTICIAS.md`](./PLAN-NOTICIAS.md). Esta guía es la
parte que se usa el día a día: variables, despliegue, cómo se envía y qué
revisar antes de una demo.

## Qué está construido

| Pieza | Dónde |
|---|---|
| Tablas `noticias`, `suscripciones`, `envios`, `fuente_snapshots` | `db/schema.sql` |
| Detector de cronogramas por hash → borrador | `api/_lib/noticias/detector.ts` |
| Cola idempotente + digest del lunes | `api/_lib/noticias/cola.ts` |
| Email Gmail (o Resend) | `api/_lib/noticias/email.ts` |
| WhatsApp contra el servicio Go | `api/_lib/noticias/whatsapp.ts` |
| Rutas admin, feed, suscripción, baja y cron | `api/_rutas/` |
| CRM de noticias y QR | `src/components/admin/NoticiasPanel.tsx`, `WhatsAppPanel.tsx` |
| Preferencias del cliente y baja pública | `AccountPanel.tsx`, `BajaPage.tsx` |
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

- **Manual**: `/admin` → Noticias → «Publicar y enviar ahora». Con «Enviar
  solo a mí» se enseña el resultado sin escribirle a un cliente. Si existe
  `EMAIL_TEST_TO`, ese botón usa esa dirección en vez del correo del admin.
- **Cola**: «Encolar para el cron» deja las filas pendientes; el cron las
  procesa en la siguiente pasada.
- **Digest**: el cron de las 12:00 UTC (07:00 Lima) detecta cambios y, si es
  lunes, manda en **un solo mensaje** lo publicado y no enviado en 7 días.
- **Reintentos**: hasta 5 intentos con la misma fila. La clave única
  `(noticia_id, user_id, canal)` impide duplicados.

El cron se puede probar a mano:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://estudio-contable-web-chi.vercel.app/api/cron/noticias
```

## WhatsApp

1. `/admin` → WhatsApp → «Vincular número».
2. Escanear el QR desde el chip dedicado del estudio.
3. Reiniciar el servicio **no** vuelve a pedir QR: la sesión vive en
   `/data/wa.db` del volumen de Railway.

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

## Registro de clientes

- El teléfono es **obligatorio** al crear la cuenta. Se guarda normalizado en
  `profiles.telefono` y en `suscripciones.whatsapp`.
- Al registrarse se crea la suscripción con **email activo**, para que el
  estudio pueda enviar avisos desde el primer día. Cada correo incluye el
  enlace de baja.
- WhatsApp queda **apagado** salvo que el cliente marque expresamente la
  casilla de consentimiento en el registro. También puede activarlo después
  en `/panel` → Mi cuenta.
- Una cuenta antigua sin teléfono puede seguir entrando y actualizarlo en Mi
  cuenta; la obligación se aplica a los perfiles nuevos.
