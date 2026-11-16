/**
 * Prueba del endpoint de exportación PLE, con autenticación real.
 *
 * Mismo método que test-api-clientes: JWKS local, usuarios temporales y la base
 * real. Lo que se comprueba de fondo es que el archivo que se descarga NO
 * incluya comprobantes sin confirmar y que el contenido tenga la forma que el
 * validador de SUNAT acepta.
 *
 * Uso: npm run test:ple-api
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

const { default: handler } = await import('../api/_rutas/ple.ts');
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
  const out: { status: number; body: unknown; text: string | null; headers: Record<string, string> } = {
    status: 0, body: null, text: null, headers: {},
  };
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
    end(t?: string) { if (typeof t === 'string') out.text = t; return res; },
    setHeader(k: string, v: string) { out.headers[k] = v; return res; },
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

  const tokenAdmin = await firmar(await nuevoUsuario('admin'));
  const tokenCliente = await firmar(await nuevoUsuario('user'));

  const cli = await query<{ id: string; ruc: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen, is_active)
     VALUES ('20999999981', 'ZZ PLE CLIENTE', 'RMT', true) RETURNING id, ruc`
  );
  clientes.push(cli[0].id);
  const clienteId = cli[0].id;

  const per = await query<{ id: string }>(
    `INSERT INTO public.periodos (cliente_id, anio, mes) VALUES ($1, 2026, 11) RETURNING id`,
    [clienteId]
  );
  const periodoId = per[0].id;

  // Dos compras confirmadas, una compra pendiente, dos ventas confirmadas.
  await query(
    `INSERT INTO public.comprobantes
       (cliente_id, periodo_id, tipo, operacion, serie, numero, fecha_emision, ruc_emisor,
        ruc_receptor, razon_emisor, moneda, tipo_cambio, base, igv, exonerado, total,
        afectacion, origen, confianza, estado)
     VALUES
       ($1,$2,'factura','compra','F001','101','2026-11-05','20131312935','20999999981','PROV UNO SAC','PEN',null,100,18,0,118,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','compra','F001','102','2026-11-06','20131312935','20999999981','PROV DOS SAC','PEN',null,200,36,0,236,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','compra','F001','103','2026-11-07','20131312935','20999999981','PROV TRES SAC','PEN',null,999,0,0,999,'10','xml',0.5,'pendiente'),
       ($1,$2,'factura','venta','F002','201','2026-11-08','20999999981','20999999990','CLIENTE SA','PEN',null,500,90,0,590,'10','xml',0.99,'confirmado')`,
    [clienteId, periodoId]
  );

  console.log('--- Guard ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', null, 'ple', { clienteId, periodo: '2026-11' }), res as never);
    check('sin token => 401', out.status === 401, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenCliente, 'ple', { clienteId, periodo: '2026-11' }), res as never);
    check('rol cliente => 403', out.status === 403, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokenAdmin, 'ple', { clienteId, periodo: '2026-11' }), res as never);
    check('POST => 405', out.status === 405, String(out.status));
  }

  console.log('\n--- Validación de parámetros ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { periodo: '2026-11' }), res as never);
    check('sin clienteId => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId }), res as never);
    check('sin período => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId, periodo: 'noviembre' }), res as never);
    check('período mal formado => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId, periodo: '2026-11', formato: '5.1' }), res as never);
    check('formato inválido => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId: crypto.randomUUID(), periodo: '2026-11' }), res as never);
    check('cliente inexistente => 404', out.status === 404, String(out.status));
  }

  console.log('\n--- Resumen de compras (8.1) ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId, periodo: '2026-11', formato: '8.1' }), res as never);
    const b = out.body as Record<string, never>;
    const t = (b as { totales: { registros: number; base: number; igv: number; total: number } }).totales;
    check('devuelve 200', out.status === 200, String(out.status));
    check('solo 2 registros confirmados (el pendiente no entra)', t?.registros === 2, String(t?.registros));
    check('base suma 300', t?.base === 300, String(t?.base));
    check('IGV suma 54', t?.igv === 54, String(t?.igv));
    check('total suma 354', t?.total === 354, String(t?.total));
    const nombre = (b as unknown as { nombreArchivo: string }).nombreArchivo;
    check('nombre de archivo con la nomenclatura PLE', /^LE2099999998120261100080100001111\.TXT$/.test(nombre), nombre);
  }

  console.log('\n--- Resumen de ventas (14.1) ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId, periodo: '2026-11', formato: '14.1' }), res as never);
    const b = out.body as unknown as { totales: { registros: number; total: number }; nombreArchivo: string };
    check('devuelve 200', out.status === 200);
    check('solo 1 venta', b.totales?.registros === 1, String(b.totales?.registros));
    check('total 590', b.totales?.total === 590, String(b.totales?.total));
    check('nombre de ventas', /140100/.test(b.nombreArchivo), b.nombreArchivo);
  }

  console.log('\n--- Descarga del archivo ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId, periodo: '2026-11', formato: '8.1', descargar: '1' }), res as never);
    check('devuelve 200', out.status === 200);
    check('texto plano', String(out.headers['Content-Type']).startsWith('text/plain'), out.headers['Content-Type']);
    check('se descarga con nombre', String(out.headers['Content-Disposition']).includes('.TXT'), out.headers['Content-Disposition']);
    check('sin caché', out.headers['Cache-Control'] === 'no-store');

    const txt = out.text ?? '';
    const lineas = txt.split('\r\n').filter(Boolean);
    check('2 líneas', lineas.length === 2, String(lineas.length));
    check('saltos CRLF', txt.includes('\r\n'));
    check('41 campos por línea', lineas.every((l) => (l.match(/\|/g) ?? []).length === 41),
      String((lineas[0]?.match(/\|/g) ?? []).length));
    check('cada línea empieza con el período', lineas.every((l) => l.startsWith('20261100|')));
    check('cada línea termina en pipe', lineas.every((l) => l.endsWith('|')));
    check('el comprobante pendiente NO aparece', !txt.includes('103'), txt.slice(0, 200));
    // Se busca la serie-número de la venta, no el texto '201': ese número
    // aparece por casualidad dentro de otros importes ('200.00').
    check('la venta NO aparece en compras', !txt.includes('F002-201') && !lineas.some((l) => l.split('|')[6] === 'F002'), txt.slice(0, 160));
    check('los totales del archivo cuadran con el resumen',
      lineas.reduce((s, l) => s + Number(l.split('|')[22]), 0) === 354);
  }

  console.log('\n--- Período sin comprobantes ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId, periodo: '2026-12', formato: '8.1' }), res as never);
    const b = out.body as unknown as { totales: { registros: number }; avisos: string[]; nombreArchivo: string };
    check('devuelve 200', out.status === 200);
    check('0 registros', b.totales?.registros === 0);
    check('avisa que no hay comprobantes', b.avisos?.some((a) => /No hay comprobantes/.test(a)), b.avisos?.join(' | '));
    check('el nombre marca libro sin información', b.nombreArchivo.charCodeAt(28) === 48, b.nombreArchivo);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'ple', { clienteId, periodo: '2026-12', formato: '8.1', descargar: '1' }), res as never);
    check('descarga vacía => 200 con contenido vacío', out.status === 200 && (out.text ?? '').length === 0);
  }

} finally {
  for (const id of clientes) await query(`DELETE FROM public.clientes WHERE id = $1`, [id]);
  for (const id of usuarios) await query(`DELETE FROM neon_auth."user" WHERE id = $1`, [id]);
  server.close();
  const r = await query<{ c: number }>(`SELECT count(*)::int AS c FROM public.clientes WHERE ruc LIKE '2099999998%'`);
  console.log(`\nlimpieza: quedan ${r[0]?.c ?? 0} clientes de prueba`);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
