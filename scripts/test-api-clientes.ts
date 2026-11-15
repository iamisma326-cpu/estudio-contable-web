/**
 * Prueba de los endpoints de clientes y períodos, con autenticación real.
 *
 * Mismo método que test-api-comprobantes: JWKS local, usuarios temporales en
 * neon_auth, y la base real. Se comprueba que un asistente pasa, un cliente no,
 * y que las consultas devuelven lo que la pantalla espera.
 *
 * Uso: npm run test:clientes
 */

import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

const server = createServer((req, res) => {
  if (req.url?.includes('.well-known/jwks.json')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404).end();
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
process.env.NEON_AUTH_JWKS_URL = `http://127.0.0.1:${port}/.well-known/jwks.json`;
process.env.NEON_AUTH_BASE_URL = `http://127.0.0.1:${port}`;

const { default: handler } = await import('../api/_rutas/clientes.ts');
const { query } = await import('../api/_db/db.ts');

async function firmar(sub: string): Promise<string> {
  return await new SignJWT({ sub })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(`http://127.0.0.1:${port}`)
    .setAudience(`http://127.0.0.1:${port}`)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}

function fakeRig() {
  const out: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
    end() { return res; },
    setHeader() { return res; },
  };
  return { out, res };
}

function req(method: string, token: string | null, recurso: string, q: Record<string, string> = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return { method, headers, query: q, body: undefined, url: '/api/x', _recurso: recurso } as never;
}

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

const usuarios: string[] = [];
const clientes: string[] = [];

try {
  async function nuevoUsuario(role: string): Promise<string> {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO neon_auth."user" (id, email, name, role, "emailVerified", "createdAt", "updatedAt", banned)
       VALUES ($1,$2,$3,$4,true,now(),now(),false)`,
      [id, `t-${id.slice(0, 8)}@example.com`, 'Prueba', role]
    );
    usuarios.push(id);
    return id;
  }

  const tokenAsistente = await firmar(await nuevoUsuario('asistente'));
  const tokenCliente = await firmar(await nuevoUsuario('user'));

  // Cliente A activo, cliente B inactivo: el inactivo no debe salir.
  const a = await query<{ id: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen, is_active)
     VALUES ('20999999992', 'ZZ CLIENTE A', 'RMT', true) RETURNING id`
  );
  clientes.push(a[0].id);
  const b = await query<{ id: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen, is_active)
     VALUES ('20999999993', 'ZZ CLIENTE B', 'RMT', false) RETURNING id`
  );
  clientes.push(b[0].id);

  const per = await query<{ id: string }>(
    `INSERT INTO public.periodos (cliente_id, anio, mes) VALUES ($1, 2026, 11) RETURNING id`,
    [a[0].id]
  );

  console.log('--- Guard ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', null, 'clientes'), res as never);
    check('sin token => 401', out.status === 401, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenCliente, 'clientes'), res as never);
    check('rol cliente => 403', out.status === 403, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokenAsistente, 'clientes'), res as never);
    check('POST => 405', out.status === 405, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('OPTIONS', null, 'clientes'), res as never);
    check('OPTIONS => 204', out.status === 204, String(out.status));
  }

  console.log('\n--- Lista de clientes ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'clientes'), res as never);
    const body = out.body as { clientes: Array<Record<string, unknown>> };
    check('devuelve 200', out.status === 200);
    const lista = body.clientes ?? [];
    check('incluye el cliente activo', lista.some((c) => c.ruc === '20999999992'));
    check('excluye el inactivo', !lista.some((c) => c.ruc === '20999999993'));
    const primero = lista[0];
    check('trae los campos que usa la pantalla (id, ruc, razon_social)',
      !!primero && 'id' in primero && 'ruc' in primero && 'razon_social' in primero);
    const nombres = lista.map((c) => String(c.razon_social));
    check('viene ordenada por razón social',
      JSON.stringify(nombres) === JSON.stringify([...nombres].sort()),
      nombres.slice(0, 4).join(' | '));
  }

  console.log('\n--- Períodos ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'periodos', { clienteId: a[0].id }), res as never);
    const body = out.body as { periodos: Array<Record<string, unknown>> };
    check('devuelve 200', out.status === 200);
    check('encuentra el período creado', (body.periodos ?? []).some((p) => p.id === per[0].id));
    const p = (body.periodos ?? [])[0];
    check('trae anio y mes', !!p && p.anio === 2026 && p.mes === 11, JSON.stringify(p).slice(0, 90));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'periodos'), res as never);
    check('sin clienteId => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'periodos', { clienteId: crypto.randomUUID() }), res as never);
    const body = out.body as { periodos: unknown[] };
    check('cliente sin períodos => lista vacía', out.status === 200 && (body.periodos ?? []).length === 0);
  }

} finally {
  for (const id of clientes) await query(`DELETE FROM public.clientes WHERE id = $1`, [id]);
  for (const id of usuarios) await query(`DELETE FROM neon_auth."user" WHERE id = $1`, [id]);
  server.close();
  const r = await query<{ c: number }>(`SELECT count(*)::int AS c FROM public.clientes WHERE ruc LIKE '2099999999%'`);
  console.log(`\nlimpieza: quedan ${r[0]?.c ?? 0} clientes de prueba`);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
