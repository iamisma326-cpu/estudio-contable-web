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

process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL_UNPOOLED o DATABASE_URL en el entorno.');
  process.exit(1);
}

const { query } = await import('../api/_db/db.ts');
const { encolarNoticias } = await import('../api/_lib/noticias/cola.ts');
const { normalizarWhatsapp, hashNormalizado, slugify } = await import(
  '../api/_lib/noticias/comun.ts'
);
const { normalizarTelefono } = await import('../src/lib/telefono.ts');
const { construirEmail, construirWhatsapp } = await import(
  '../api/_lib/noticias/plantillas.ts'
);
const { default: bajaHandler } = await import('../api/_rutas/baja.ts');

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

  const { out, res } = fakeRig();
  await bajaHandler(
    { method: 'GET', query: { token: bajaToken }, headers: {} } as never,
    res as never
  );
  check('baja con token responde 200', out.status === 200, `status=${out.status}`);

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

  await query('DELETE FROM public.noticias WHERE slug LIKE $1', [`${slug}%`]);
  noticiaId = null;
} finally {
  if (noticiaId) await query('DELETE FROM public.noticias WHERE id = $1', [noticiaId]);
  await query('DELETE FROM public.suscripciones WHERE user_id = $1', [userId]);
}

if (fallos) {
  console.error(`\n${fallos} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('\nNoticias: todas las comprobaciones pasaron.');
