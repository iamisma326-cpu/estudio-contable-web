# whatsapp-service

Servicio Go que envuelve [`whatsmeow`](https://github.com/tulir/whatsmeow) para
enviar los avisos del estudio por WhatsApp. **No es la API oficial de Meta**:
se vincula como un dispositivo de WhatsApp Web escaneando un QR.

Vercel nunca habla directo con este servicio desde el navegador: el panel de
admin llama a `/api/admin/whatsapp/*`, y esa función (con `requireAdmin`) hace
de proxy con `X-Servicio-Token`.

## Variables

| Variable | Dónde | Qué hace |
|---|---|---|
| `WA_SERVICIO_TOKEN` | Railway + Vercel | Token interno. Debe ser el mismo en los dos. |
| `WA_DB_PATH` | Railway | `file:/data/wa.db` (SQLite en volumen). |
| `WA_DB_URL` | Render | Cadena Postgres de Neon si no hay disco. |
| `WA_BAJA_WEBHOOK_URL` | Railway | URL de Vercel para procesar la respuesta BAJA. |
| `PORT` | Railway | Railway lo inyecta; por defecto 8080. |

Usa **una** de las dos: si `WA_DB_URL` está definida, gana Postgres; si no,
SQLite en `WA_DB_PATH`.

## Railway (recomendado para operación real)

```bash
railway login
railway init            # o railway link a un proyecto existente
railway add --service whatsapp-service
railway variables --set WA_SERVICIO_TOKEN=<aleatorio> \
  --set WA_DB_PATH=/data/wa.db \
  --set WA_BAJA_WEBHOOK_URL=https://estudio-contable-web-chi.vercel.app/api/whatsapp/baja
railway volume add --mount-path /data
railway up              # desde esta carpeta
railway domain          # URL pública para WA_SERVICIO_URL en Vercel
```

Railway no duerme el servicio. El plan Hobby ($5/mes) es el único escenario
predecible; el plan free ($1 de crédito) puede cortar el servicio a mitad de
mes.

## Render free (solo demo)

Sin disco persistente: define `WA_DB_URL` apuntando a Neon. El servicio se
duerme a los 15 min y tarda ~1 min en despertar; el `maxDuration` de 300 s del
cron cubre la espera.

## Endpoints

Todos exigen `X-Servicio-Token` salvo `/health`.

| Ruta | Qué hace |
|---|---|
| `GET /health` | 200 si el proceso vive (healthcheck). |
| `GET /status` | `{ conectado, jid, numero, desde, ultimo_error }`. |
| `GET /qr` | QR vigente como PNG base64, o 204 si ya está vinculado. |
| `POST /pair` | Arranca el emparejamiento y devuelve el primer QR. |
| `POST /send` | `{ "to": "51987654321", "texto": "…" }` → `{ id }`. |
| `POST /logout` | Cierra la sesión y borra el dispositivo del store. |

Si un cliente responde **BAJA** en un chat directo, el servicio llama a
`WA_BAJA_WEBHOOK_URL` con `X-Servicio-Token` para desactivar su suscripción.
Los mensajes de grupo se ignoran.

## Riesgo

`whatsmeow` va contra los términos de servicio de WhatsApp. Un número que
manda mensajes a contactos que no lo tienen agendado puede ser bloqueado.
Mitigaciones: chip dedicado, solo opt-in, volumen bajo, pausas y un plan B con
la API oficial.
