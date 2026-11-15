/**
 * Prueba del endpoint de liquidación mensual (IGV + renta), con autenticación real.
 *
 * Mismo método que las otras pruebas de API: JWKS local, usuarios temporales y
 * la base real. Lo que se comprueba de fondo es que el cálculo del impuesto
 * NO cuente comprobantes sin confirmar y que el saldo a favor se arrastre.
 *
 * Uso: npm run test:liquidacion
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

const { default: handler } = await import('../api/_rutas/liquidacion.ts');
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
function eq(desc: string, real: unknown, esperado: unknown) {
  check(desc, Number(real) === Number(esperado), `real=${real} esperado=${esperado}`);
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

  const cli = await query<{ id: string; ruc: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen, is_active)
     VALUES ('20999999971', 'ZZ LIQ CLIENTE', 'RMT', true) RETURNING id, ruc`
  );
  clientes.push(cli[0].id);
  const clienteId = cli[0].id;

  // Octubre con saldo a favor, noviembre con movimientos.
  await query(
    `INSERT INTO public.periodos (cliente_id, anio, mes, saldo_a_favor_igv)
     VALUES ($1, 2026, 10, 100)`,
    [clienteId]
  );
  const per = await query<{ id: string }>(
    `INSERT INTO public.periodos (cliente_id, anio, mes) VALUES ($1, 2026, 11) RETURNING id`,
    [clienteId]
  );
  const periodoId = per[0].id;

  await query(
    `INSERT INTO public.comprobantes
       (cliente_id, periodo_id, tipo, operacion, serie, numero, fecha_emision, ruc_emisor,
        ruc_receptor, razon_emisor, moneda, base, igv, exonerado, total, afectacion, origen, confianza, estado)
     VALUES
       ($1,$2,'factura','venta','F001','1','2026-11-02','20999999971','20400000001','CLIENTE UNO','PEN',1000,180,0,1180,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','venta','F001','2','2026-11-03','20999999971','20400000002','CLIENTE DOS','PEN',500,90,0,590,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','compra','F002','1','2026-11-04','20131312935','20999999971','PROV UNO','PEN',600,108,0,708,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','compra','F002','2','2026-11-05','20131312935','20999999971','PROV DOS','PEN',400,72,0,472,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','compra','F002','3','2026-11-06','20131312935','20999999971','PROV TRES','PEN',9999,1799.82,0,11798.82,'10','xml',0.5,'pendiente')`,
    [clienteId, periodoId]
  );

  console.log('--- Guard ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', null, 'liquidacion', { clienteId, periodo: '2026-11' }), res as never);
    check('sin token => 401', out.status === 401, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenCliente, 'liquidacion', { clienteId, periodo: '2026-11' }), res as never);
    check('rol cliente => 403', out.status === 403, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokenAsistente, 'liquidacion', { clienteId, periodo: '2026-11' }), res as never);
    check('POST => 405', out.status === 405, String(out.status));
  }

  console.log('\n--- Parámetros ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'liquidacion', { periodo: '2026-11' }), res as never);
    check('sin clienteId => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'liquidacion', { clienteId }), res as never);
    check('sin período => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'liquidacion', { clienteId: crypto.randomUUID(), periodo: '2026-11' }), res as never);
    check('cliente inexistente => 404', out.status === 404, String(out.status));
  }

  console.log('\n--- Liquidación del mes ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'liquidacion', { clienteId, periodo: '2026-11' }), res as never);
    const b = out.body as any;
    check('devuelve 200', out.status === 200, String(out.status));

    eq('IGV ventas (180+90)', b.igv?.ventas?.igv, 270);
    eq('base gravada de ventas', b.igv?.ventas?.baseGravada, 1500);
    eq('IGV compras (108+72, sin el pendiente)', b.igv?.compras?.igv, 180);
    eq('solo 2 compras confirmadas', b.igv?.compras?.cantidad, 2);
    eq('saldo anterior tomado de octubre', b.igv?.saldoAnterior, 100);
    eq('resultado 270-180-100', b.igv?.resultadoIGV, -10);
    eq('queda a favor', b.igv?.saldoAFavor, 10);
    eq('no se paga', b.igv?.igvAPagar, 0);

    eq('ingresos netos = base de ventas', b.renta?.ingresosNetos, 1500);
    eq('pago a cuenta RMT 1%', b.renta?.monto, 15);
    check('régimen RMT', b.renta?.regimen === 'RMT', String(b.renta?.regimen));

    check('avisa de los comprobantes sin confirmar',
      (b.avisos as string[]).some((a) => /sin confirmar/.test(a)), (b.avisos as string[]).join(' | '));
    check('avisa del régimen general no aplica',
      !(b.avisos as string[]).some((a) => /coeficiente/.test(a)));
  }

  console.log('\n--- Sin saldo anterior no se inventa uno ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'liquidacion', { clienteId, periodo: '2026-12' }), res as never);
    const b = out.body as any;
    check('devuelve 200', out.status === 200);
    eq('saldo anterior 0', b.igv?.saldoAnterior, 0);
    // Noviembre existe pero no tiene saldo declarado: eso sí hay que avisarlo,
    // porque suponer 0 cuando el mes cerró a favor haría pagar dos veces.
    check('avisa que el período anterior no declara saldo',
      (b.avisos as string[]).some((a) => /no tiene saldo a favor declarado/.test(a)), (b.avisos as string[]).join(' | '));
  }

  console.log('\n--- Mes sin período creado ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAsistente, 'liquidacion', { clienteId, periodo: '2027-03' }), res as never);
    const b = out.body as any;
    check('devuelve 200', out.status === 200);
    eq('0 ventas', b.igv?.ventas?.cantidad, 0);
    eq('0 a pagar', b.igv?.igvAPagar, 0);
    check('marca sin_periodo', b.periodoEstado === 'sin_periodo', String(b.periodoEstado));
  }

} finally {
  for (const id of clientes) await query(`DELETE FROM public.clientes WHERE id = $1`, [id]);
  for (const id of usuarios) await query(`DELETE FROM neon_auth."user" WHERE id = $1`, [id]);
  server.close();
  const r = await query<{ c: number }>(`SELECT count(*)::int AS c FROM public.clientes WHERE ruc LIKE '2099999997%'`);
  console.log(`\nlimpieza: quedan ${r[0]?.c ?? 0} clientes de prueba`);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
