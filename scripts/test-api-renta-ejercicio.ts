/**
 * Prueba del endpoint de renta anual (DJ 710) con autenticación real.
 *
 * Mismo método que las otras pruebas de API. Lo que se comprueba de fondo es
 * que los ingresos del año salgan SOLO de comprobantes confirmados, que lo que
 * aporta el contador se guarde y se recupere, y que el impuesto siga la escala
 * del régimen.
 *
 * Uso: npm run test:renta-ejercicio
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

const { default: handler } = await import('../api/_rutas/renta-ejercicio.ts');
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
  const out: {
    status: number; body: unknown; text: string | null; bin: Buffer | null;
    headers: Record<string, string>;
  } = { status: 0, body: null, text: null, bin: null, headers: {} };
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
    end(t?: string | Buffer) {
      if (Buffer.isBuffer(t)) out.bin = t;
      else if (typeof t === 'string') out.text = t;
      return res;
    },
    setHeader(k: string, v: string) { out.headers[k] = v; return res; },
  };
  return { out, res };
}

function req(
  method: string,
  token: string | null,
  recurso: string,
  q: Record<string, string> = {},
  body?: unknown
) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  // readJsonBody devuelve req.body tal cual cuando ya es un objeto.
  return { method, headers, query: q, body, url: '/api/x', _recurso: recurso } as never;
}



let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

/** Extrae y descomprime una entrada del .xlsx, para poder leer su XML. */
function leerEntrada(zip: Buffer, ruta: string): string | null {
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const total = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < total; i++) {
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const ln = zip.readUInt16LE(p + 28);
    const le = zip.readUInt16LE(p + 30);
    const lc = zip.readUInt16LE(p + 32);
    const off = zip.readUInt32LE(p + 42);
    const nombre = zip.subarray(p + 46, p + 46 + ln).toString('utf8');
    if (nombre === ruta) {
      const lNom = zip.readUInt16LE(off + 26);
      const lExt = zip.readUInt16LE(off + 28);
      const ini = off + 30 + lNom + lExt;
      const datos = zip.subarray(ini, ini + comprimido);
      return (metodo === 8 ? inflateRawSync(datos) : datos).toString('utf8');
    }
    p += 46 + ln + le + lc;
  }
  return null;
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

  const cli = await query<{ id: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen, is_active)
     VALUES ('20999999971', 'ZZ RENTA ANUAL SAC', 'RMT', true) RETURNING id`
  );
  clientes.push(cli[0].id);
  const clienteId = cli[0].id;

  const p1 = await query<{ id: string }>(
    `INSERT INTO public.periodos (cliente_id, anio, mes) VALUES ($1, 2026, 1) RETURNING id`, [clienteId]
  );
  const p2 = await query<{ id: string }>(
    `INSERT INTO public.periodos (cliente_id, anio, mes) VALUES ($1, 2026, 2) RETURNING id`, [clienteId]
  );
  // Un período de otro año, que NO debe entrar.
  const p3 = await query<{ id: string }>(
    `INSERT INTO public.periodos (cliente_id, anio, mes) VALUES ($1, 2025, 12) RETURNING id`, [clienteId]
  );

  await query(
    `INSERT INTO public.comprobantes
       (cliente_id, periodo_id, tipo, operacion, serie, numero, fecha_emision, ruc_emisor,
        ruc_receptor, razon_emisor, moneda, base, igv, exonerado, total, afectacion, origen, confianza, estado)
     VALUES
       ($1,$2,'factura','venta','F001','1','2026-01-10','20999999971','20400000001','CLIENTE UNO','PEN',10000,1800,0,11800,'10','xml',0.99,'confirmado'),
       ($1,$3,'factura','venta','F001','2','2026-02-10','20999999971','20400000001','CLIENTE UNO','PEN',10000,1800,0,11800,'10','xml',0.99,'confirmado'),
       ($1,$3,'factura','compra','F002','1','2026-02-12','20131312935','20999999971','PROV UNO','PEN',4000,720,0,4720,'10','xml',0.99,'confirmado'),
       ($1,$3,'factura','venta','F001','3','2026-02-20','20999999971','20400000001','CLIENTE PENDIENTE','PEN',99999,17999.82,0,117998.82,'10','xml',0.5,'pendiente'),
       ($1,$4,'factura','venta','F001','9','2025-12-31','20999999971','20400000001','CLIENTE ANIO ANTERIOR','PEN',50000,9000,0,59000,'10','xml',0.99,'confirmado')`,
    [clienteId, p1[0].id, p2[0].id, p3[0].id]
  );

  console.log('--- Guard ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', null, 'renta-ejercicio', { clienteId, anio: '2026' }), res as never);
    check('sin token => 401', out.status === 401, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenCliente, 'renta-ejercicio', { clienteId, anio: '2026' }), res as never);
    check('rol cliente => 403', out.status === 403, String(out.status));
  }

  console.log('\n--- Parámetros ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { anio: '2026' }), res as never);
    check('sin clienteId => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { clienteId, anio: 'dosmil' }), res as never);
    check('año inválido => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { clienteId: crypto.randomUUID(), anio: '2026' }), res as never);
    check('cliente inexistente => 404', out.status === 404, String(out.status));
  }

  console.log('\n--- Ingresos solo de confirmados y del año ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { clienteId, anio: '2026' }), res as never);
    const b = out.body as any;
    check('devuelve 200', out.status === 200, String(out.status));
    // 10,000 + 10,000 de ventas confirmadas; el pendiente y el de 2025 no entran.
    check('ingresos netos solo de confirmados', b.ingresosNetos === 20000, String(b.ingresosNetos));
    check('dos comprobantes de venta', b.comprobantes.ventas === 2, String(b.comprobantes.ventas));
    check('el pendiente no entra', b.liquidacion.rentaBruta === 20000, String(b.liquidacion.rentaBruta));
  }

  console.log('\n--- Lo que falta se informa, no se asume ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { clienteId, anio: '2026' }), res as never);
    const b = out.body as any;
    check('avisa que faltan gastos deducibles',
      (b.faltantes as string[]).some((f) => /gastos deducibles/i.test(f)), JSON.stringify(b.faltantes));
    check('avisa que faltan pagos a cuenta',
      (b.faltantes as string[]).some((f) => /pagos a cuenta/i.test(f)));
    check('avisa del comprobante sin confirmar',
      (b.faltantes as string[]).some((f) => /sin confirmar/i.test(f)));
  }

  console.log('\n--- El contador aporta datos y se guardan ---');
  {
    const { out, res } = fakeRig();
    await handler(
      req('POST', tokenAdmin, 'renta-ejercicio', null, {
        clienteId, anio: 2026,
        gastosDeducibles: 5000, pagosACuenta: 1000, gastosRecreativos: 300,
      }),
      res as never
    );
    const b = out.body as any;
    check('POST responde 200', out.status === 200, String(out.status));
    check('los gastos entran', b.liquidacion.gastosDeducibles === 5000, String(b.liquidacion.gastosDeducibles));
    // Renta neta 20000 - 5000 = 15000; exceso recreativo 300 - (0.5% de 20000 = 100) = 200.
    check('el exceso recreativo se adiciona', b.liquidacion.excesoRecreativo === 200, String(b.liquidacion.excesoRecreativo));
    check('renta neta imponible', b.liquidacion.rentaNetaImponible === 15200, String(b.liquidacion.rentaNetaImponible));
    // RMT: 15,200 < 15 UIT (82,500) => 10% = 1,520. Menos 1,000 de pagos = 520.
    check('impuesto con escala RMT', b.liquidacion.impuestoCalculado === 1520, String(b.liquidacion.impuestoCalculado));
    check('por regularizar', b.liquidacion.porRegularizar === 520, String(b.liquidacion.porRegularizar));

    // Se recupera en un GET posterior: no se perdió al responder.
    const { out: out2, res: res2 } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { clienteId, anio: '2026' }), res2 as never);
    const b2 = out2.body as any;
    check('los datos persisten', b2.liquidacion.gastosDeducibles === 5000, String(b2.liquidacion.gastosDeducibles));
    check('los pagos a cuenta persisten', b2.datosContador.pagosACuenta === 1000, String(b2.datosContador.pagosACuenta));
  }

  console.log('\n--- Un año sin comprobantes no rompe ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { clienteId, anio: '2024' }), res as never);
    check('responde 200', out.status === 200, String(out.status));
    const b = out.body as any;
    check('ingresos en cero', b.ingresosNetos === 0, String(b.ingresosNetos));
    check('sin impuesto', b.liquidacion.impuestoCalculado === 0);
  }

  console.log('\n--- Las líneas del formulario ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'renta-ejercicio', { clienteId, anio: '2026' }), res as never);
    const lineas = (out.body as any).liquidacion.lineas as Array<{ concepto: string; importe: number }>;
    check('trae líneas', lineas.length > 5, String(lineas.length));
    check('incluye la renta bruta', lineas.some((l) => /Renta bruta/i.test(l.concepto)));
    check('incluye la renta neta imponible', lineas.some((l) => /Renta neta imponible/i.test(l.concepto)));
    check('incluye el impuesto calculado', lineas.some((l) => /Impuesto calculado/i.test(l.concepto)));
    check('todos los importes son números', lineas.every((l) => Number.isFinite(l.importe)),
      JSON.stringify(lineas.filter((l) => !Number.isFinite(l.importe))));
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
