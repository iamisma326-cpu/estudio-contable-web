/**
 * Pruebas del módulo de noticias.
 *
 * Cubre lo que puede romperse sin que nadie lo note:
 *   - normalización de teléfonos y hash estable (sin falsos positivos),
 *   - idempotencia de la cola (relanzar no duplica envíos),
 *   - una noticia en borrador no se encola,
 *   - baja por token sin sesión,
 *   - plantillas sin imágenes remotas y con enlace de baja.
 *
 * Usa la base real de .env y limpia todo al terminar.
 *
 * Uso: npm run test:noticias
 */

import { randomUUID } from 'node:crypto';

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (dbUrl) process.env.DATABASE_URL = dbUrl;
const hayDb = Boolean(dbUrl);
const tokenServicio = process.env.WA_SERVICIO_TOKEN || 'test-servicio-token';
process.env.WA_SERVICIO_TOKEN = tokenServicio;

const { query } = await import('../api/_db/db.ts');
const { encolarNoticias, procesarEnvios } = await import('../api/_lib/noticias/cola.ts');
const { normalizarWhatsapp, hashNormalizado, slugify } = await import(
  '../api/_lib/noticias/comun.ts'
);
const { normalizarTelefono } = await import('../src/lib/telefono.ts');
const { construirEmail, construirWhatsapp } = await import(
  '../api/_lib/noticias/plantillas.ts'
);
const { default: bajaHandler } = await import('../api/_rutas/baja.ts');
const { default: whatsappBajaHandler } = await import('../api/_rutas/whatsapp-baja.ts');

let fallos = 0;

function check(nombre: string, condicion: boolean, detalle = ''): void {
  if (condicion) {
    console.log(`  ✓ ${nombre}`);
    return;
  }
  fallos += 1;
  console.error(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

function fakeRig() {
  const out: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    status(codigo: number) {
      out.status = codigo;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
    end() {
      return res;
    },
    setHeader() {
      return res;
    },
  };
  return { out, res };
}

console.log('\nNormalización y hash');
check('+51 987 654 321 → 51987654321', normalizarWhatsapp('+51 987 654 321') === '51987654321');
check('987654321 → 51987654321', normalizarWhatsapp('987654321') === '51987654321');
check('texto inválido → null', normalizarWhatsapp('no es un número') === null);
check(
  'frontend y backend normalizan igual (+51)',
  normalizarTelefono('+51 987 654 321') === normalizarWhatsapp('+51 987 654 321')
);
check(
  'frontend y backend normalizan igual (9 dígitos)',
  normalizarTelefono('987654321') === normalizarWhatsapp('987654321')
);
check('frontend rechaza un teléfono corto', normalizarTelefono('12345') === null);
check('slug sin tildes', slugify('Cronograma 2027: SUNAT actualizó') === 'cronograma-2027-sunat-actualizo');
check(
  'hash estable con claves en otro orden',
  hashNormalizado({ a: 1, b: [2, 3] }) === hashNormalizado({ b: [2, 3], a: 1 })
);
check(
  'hash cambia cuando cambia una fecha',
  hashNormalizado({ meses: [{ mes: 1, dia: 15 }] }) !==
    hashNormalizado({ meses: [{ mes: 1, dia: 16 }] })
);

console.log('\nPlantillas');
const noticiaPrueba = {
  id: randomUUID(),
  slug: 'prueba-plantilla',
  titulo: 'Cronograma 2027 publicado',
  resumen: 'Vence el 15 de diciembre para los RUC terminados en 1.',
  cuerpo: '',
  categoria: 'sunat',
  fuente: 'manual',
  fuente_url: 'https://www.sunat.gob.pe/',
  estado: 'publicada' as const,
  publicada_en: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const email = construirEmail([noticiaPrueba], '00000000-0000-4000-8000-000000000000');
check('el asunto incluye el título', email.asunto.includes('Cronograma 2027'));
check('el HTML no lleva imágenes remotas', !/<img/i.test(email.html));
check('el email incluye enlace de baja', email.html.includes('/baja?token='));
const wa = construirWhatsapp([noticiaPrueba]);
check('WhatsApp incluye BAJA', wa.includes('BAJA'));

console.log('\nCola idempotente y baja');

if (!hayDb) {
  console.log('  ⊘ Sin DATABASE_URL: se omiten las pruebas de cola y baja.');
} else {
const sufijo = Date.now().toString(36);
const slug = `test-noticias-${sufijo}`;
const userId = randomUUID();
let noticiaId: string | null = null;
let bajaToken: string | null = null;

try {
  const noticia = await query<{ id: string }>(
    `INSERT INTO public.noticias (slug, titulo, resumen, categoria, estado, publicada_en)
     VALUES ($1, 'Noticia de prueba', 'Solo para el test.', 'sunat', 'publicada', now())
     RETURNING id`,
    [slug]
  );
  noticiaId = noticia[0].id;

  const suscripcion = await query<{ baja_token: string }>(
    `INSERT INTO public.suscripciones (user_id, email, canal_email, consentimiento_en)
     VALUES ($1, $2, true, now())
     RETURNING baja_token::text AS baja_token`,
    [userId, `test-${sufijo}@example.com`]
  );
  bajaToken = suscripcion[0].baja_token;

  const primera = await encolarNoticias([noticiaId], ['email'], { lote: randomUUID() });
  check('primera pasada encola al destinatario de prueba', primera.filas >= 1, `filas=${primera.filas}`);

  const segunda = await encolarNoticias([noticiaId], ['email'], { lote: randomUUID() });
  check('segunda pasada no duplica', segunda.filas === 0, `filas=${segunda.filas}`);

  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM public.envios
      WHERE noticia_id = $1 AND user_id = $2 AND canal = 'email'`,
    [noticiaId, userId]
  );
  check('el destinatario de prueba tiene exactamente 1 envío', total === 1, `total=${total}`);

  const borrador = await query<{ id: string }>(
    `INSERT INTO public.noticias (slug, titulo, resumen, categoria, estado)
     VALUES ($1, 'Borrador de prueba', '', 'sunat', 'borrador')
     RETURNING id`,
    [`${slug}-borrador`]
  );
  const desdeBorrador = await encolarNoticias([borrador[0].id], ['email'], {
    lote: randomUUID(),
  });
  check('un borrador no se encola', desdeBorrador.filas === 0, `filas=${desdeBorrador.filas}`);

  const validacion = fakeRig();
  await bajaHandler(
    { method: 'GET', query: { token: bajaToken }, headers: {} } as never,
    validacion.res as never
  );
  check('GET de baja solo valida el token', validacion.out.status === 200, `status=${validacion.out.status}`);
  const antes = await query<{ activo: boolean }>(
    'SELECT activo FROM public.suscripciones WHERE user_id = $1',
    [userId]
  );
  check('el GET no modifica la suscripción (anti-prefetch)', antes[0]?.activo === true);

  const { out, res } = fakeRig();
  await bajaHandler(
    { method: 'POST', body: { token: bajaToken }, headers: {} } as never,
    res as never
  );
  check('POST de baja responde 200', out.status === 200, `status=${out.status}`);

  const despues = await query<{ activo: boolean; canal_email: boolean }>(
    'SELECT activo, canal_email FROM public.suscripciones WHERE user_id = $1',
    [userId]
  );
  check('la suscripción queda inactiva', despues[0]?.activo === false);
  check('el canal email queda apagado', despues[0]?.canal_email === false);

  const invalido = fakeRig();
  await bajaHandler(
    { method: 'GET', query: { token: randomUUID() }, headers: {} } as never,
    invalido.res as never
  );
  check('token inválido responde 404', invalido.out.status === 404, `status=${invalido.out.status}`);

  // Baja por WhatsApp: solo el servicio Go, autenticado con el token interno.
  await query(
    `UPDATE public.suscripciones
        SET activo = true, canal_whatsapp = true, whatsapp = '51987654321'
      WHERE user_id = $1`,
    [userId]
  );

  const sinToken = fakeRig();
  await whatsappBajaHandler(
    { method: 'POST', headers: {}, body: { telefono: '+51 987 654 321' } } as never,
    sinToken.res as never
  );
  check('webhook de baja WhatsApp sin token responde 401', sinToken.out.status === 401, `status=${sinToken.out.status}`);

  const waBaja = fakeRig();
  await whatsappBajaHandler(
    {
      method: 'POST',
      headers: { 'x-servicio-token': tokenServicio },
      body: { telefono: '+51 987 654 321' },
    } as never,
    waBaja.res as never
  );
  check('webhook de baja WhatsApp responde 200', waBaja.out.status === 200, `status=${waBaja.out.status}`);

  const waDespues = await query<{ activo: boolean; canal_whatsapp: boolean }>(
    'SELECT activo, canal_whatsapp FROM public.suscripciones WHERE user_id = $1',
    [userId]
  );
  check('WA BAJA desactiva la suscripción', waDespues[0]?.activo === false);
  check('WA BAJA apaga el canal WhatsApp', waDespues[0]?.canal_whatsapp === false);

  // Una noticia archivada después de encolarse no debe salir en el cron.
  await query(
    `UPDATE public.suscripciones
        SET activo = true, canal_email = true, canal_whatsapp = false
      WHERE user_id = $1`,
    [userId]
  );
  const archivada = await query<{ id: string }>(
    `INSERT INTO public.noticias (slug, titulo, resumen, categoria, estado, publicada_en)
     VALUES ($1, 'Noticia archivada de prueba', '', 'sunat', 'publicada', now())
     RETURNING id`,
    [`${slug}-archivada`]
  );
  const loteArchivada = randomUUID();
  await encolarNoticias([archivada[0].id], ['email'], { lote: loteArchivada });
  await query(`UPDATE public.noticias SET estado = 'archivada' WHERE id = $1`, [
    archivada[0].id,
  ]);
  const procesado = await procesarEnvios({ lote: loteArchivada });
  check('noticia archivada se omite antes de enviar', procesado.omitidos >= 1, `omitidos=${procesado.omitidos}`);
  const envioArchivada = await query<{ estado: string }>(
    `SELECT estado FROM public.envios WHERE noticia_id = $1 AND user_id = $2`,
    [archivada[0].id, userId]
  );
  check('el envío archivado queda como omitido', envioArchivada[0]?.estado === 'omitido', `estado=${envioArchivada[0]?.estado}`);

  // Baja/desactivación después de encolar: no se envía lo ya pendiente.
  const pendienteBaja = await query<{ id: string }>(
    `INSERT INTO public.noticias (slug, titulo, resumen, categoria, estado, publicada_en)
     VALUES ($1, 'Noticia con baja pendiente', '', 'sunat', 'publicada', now())
     RETURNING id`,
    [`${slug}-baja-pendiente`]
  );
  const loteBaja = randomUUID();
  await encolarNoticias([pendienteBaja[0].id], ['email'], { lote: loteBaja });
  await query('UPDATE public.suscripciones SET activo = false WHERE user_id = $1', [userId]);
  const procesadoBaja = await procesarEnvios({ lote: loteBaja });
  check('baja posterior se omite antes del siguiente envío', procesadoBaja.omitidos >= 1, `omitidos=${procesadoBaja.omitidos}`);
  const envioBaja = await query<{ estado: string }>(
    `SELECT estado FROM public.envios WHERE noticia_id = $1 AND user_id = $2`,
    [pendienteBaja[0].id, userId]
  );
  check('el envío de una baja posterior queda omitido', envioBaja[0]?.estado === 'omitido', `estado=${envioBaja[0]?.estado}`);

  // «Solo a mí» se marca como prueba y no se confunde con un envío real.
  const prueba = await query<{ id: string }>(
    `INSERT INTO public.noticias (slug, titulo, resumen, categoria, estado, publicada_en)
     VALUES ($1, 'Noticia de prueba solo a mí', '', 'sunat', 'publicada', now())
     RETURNING id`,
    [`${slug}-solo-mi`]
  );
  await encolarNoticias([prueba[0].id], ['email'], {
    soloMi: true,
    admin: { id: userId, email: 'test@example.com' },
  });
  const filaPrueba = await query<{ prueba: boolean; destino: string }>(
    `SELECT prueba, destino FROM public.envios WHERE noticia_id = $1 AND user_id = $2`,
    [prueba[0].id, userId]
  );
  check('«solo a mí» queda marcado como prueba', filaPrueba[0]?.prueba === true);
  check('«solo a mí» usa el destino de prueba', Boolean(filaPrueba[0]?.destino));

  await query('DELETE FROM public.noticias WHERE slug LIKE $1', [`${slug}%`]);
  noticiaId = null;
} finally {
  if (noticiaId) await query('DELETE FROM public.noticias WHERE id = $1', [noticiaId]);
  await query('DELETE FROM public.suscripciones WHERE user_id = $1', [userId]);
}
}

if (fallos) {
  console.error(`\n${fallos} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('\nNoticias: todas las comprobaciones pasaron.');
