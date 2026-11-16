/**
 * Prueba del endpoint que genera el Excel del mes, con autenticación real.
 *
 * Mismo método que las otras pruebas de API. Lo que se comprueba de fondo es
 * que el .xlsx descargado sea un archivo válido y que las facturas sin
 * confirmar NO entren al libro sino a la hoja de Pendientes.
 *
 * Uso: npm run test:libro
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

const { default: handler } = await import('../api/_rutas/libro.ts');
const { inflateRawSync } = await import('node:zlib');
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

  const cli = await query<{ id: string; ruc: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen, is_active)
     VALUES ('20999999961', 'ZZ LIBRO CLIENTE', 'RMT', true) RETURNING id, ruc`
  );
  clientes.push(cli[0].id);
  const clienteId = cli[0].id;

  const per = await query<{ id: string }>(
    `INSERT INTO public.periodos (cliente_id, anio, mes) VALUES ($1, 2026, 11) RETURNING id`,
    [clienteId]
  );
  const periodoId = per[0].id;

  // El fixture ponía el nombre del cliente en razon_emisor, que es justo el dato
  // equivocado: en una venta razon_emisor es uno mismo. Así el test acompañaba
  // al bug en vez de detectarlo.
  await query(
    `INSERT INTO public.comprobantes
       (cliente_id, periodo_id, tipo, operacion, serie, numero, fecha_emision, ruc_emisor,
        ruc_receptor, razon_emisor, razon_receptor, moneda, base, igv, exonerado, total, afectacion, origen, confianza, estado)
     VALUES
       ($1,$2,'factura','venta','F001','1','2026-11-02','20999999961','20400000001','ZZ LIBRO CLIENTE','CLIENTE UNO','PEN',1000,180,0,1180,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','compra','F002','1','2026-11-04','20131312935','20999999961','PROV UNO','ZZ LIBRO CLIENTE','PEN',600,108,0,708,'10','xml',0.99,'confirmado'),
       ($1,$2,'factura','compra','F002','2','2026-11-05','20131312935','20999999961','PROV PENDIENTE','ZZ LIBRO CLIENTE','PEN',999,179.82,0,1178.82,'10','xml',0.5,'pendiente')`,
    [clienteId, periodoId]
  );

  console.log('--- Guard ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', null, 'libro', { clienteId, periodo: '2026-11' }), res as never);
    check('sin token => 401', out.status === 401, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenCliente, 'libro', { clienteId, periodo: '2026-11' }), res as never);
    check('rol cliente => 403', out.status === 403, String(out.status));
  }

  console.log('\n--- Parámetros ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { periodo: '2026-11' }), res as never);
    check('sin clienteId => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId, periodo: 'x' }), res as never);
    check('período inválido => 400', out.status === 400, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId: crypto.randomUUID(), periodo: '2026-11' }), res as never);
    check('cliente inexistente => 404', out.status === 404, String(out.status));
  }

  console.log('\n--- Resumen sin descargar ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId, periodo: '2026-11' }), res as never);
    const b = out.body as any;
    check('devuelve 200', out.status === 200, String(out.status));
    check('2 confirmados', b.confirmados === 2, String(b.confirmados));
    check('1 pendiente', b.pendientes === 1, String(b.pendientes));
    check('las cinco hojas', (b.hojas as string[]).length === 5, JSON.stringify(b.hojas));
    check('nombre del archivo', /^libro-20999999961-2026-11\.xlsx$/.test(b.nombreArchivo), b.nombreArchivo);
    check('no manda binario en el resumen', out.bin === null);
  }

  console.log('\n--- Descarga del .xlsx ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId, periodo: '2026-11', descargar: '1' }), res as never);
    check('devuelve 200', out.status === 200);
    check('manda el binario', out.bin !== null && out.bin.length > 1000, String(out.bin?.length));
    check('tipo MIME de Excel',
      String(out.headers['Content-Type']).includes('spreadsheetml.sheet'), out.headers['Content-Type']);
    check('se descarga con nombre', String(out.headers['Content-Disposition']).includes('.xlsx'));
    check('sin caché', out.headers['Cache-Control'] === 'no-store');

    const zip = out.bin as Buffer;
    check('firma PK', zip.readUInt32LE(0) === 0x04034b50);

    const wb = leerEntrada(zip, 'xl/workbook.xml') ?? '';
    const hojas = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    check('hojas Ventas y Compras', hojas.includes('Ventas') && hojas.includes('Compras'), JSON.stringify(hojas));
    check('hoja Diario', hojas.includes('Diario'));
    check('hoja Resumen', hojas.includes('Resumen'));
    check('hoja Pendientes', hojas.includes('Pendientes'));

    const ventas = leerEntrada(zip, 'xl/worksheets/sheet1.xml') ?? '';
    check('Ventas trae el nombre del cliente', ventas.includes('CLIENTE UNO'));
    // En el libro de ventas la razón social es la del cliente; si sale la
    // propia, el libro declara que la empresa se facturó a sí misma.
    check('Ventas NO nombra al propio emisor', !ventas.includes('ZZ LIBRO CLIENTE'));
    const compras = leerEntrada(zip, 'xl/worksheets/sheet2.xml') ?? '';
    check('Compras trae el proveedor confirmado', compras.includes('PROV UNO'));
    check('Compras NO trae el pendiente', !compras.includes('PROV PENDIENTE'), compras.slice(0, 200));

    const pendientes = leerEntrada(zip, 'xl/worksheets/sheet5.xml') ?? '';
    check('el pendiente está en Pendientes', pendientes.includes('PROV PENDIENTE'));
    check('con su motivo', pendientes.includes('Sin revisar'));

    const diario = leerEntrada(zip, 'xl/worksheets/sheet3.xml') ?? '';
    check('el diario tiene líneas de asiento', diario.includes('Proveedores') || diario.includes('42'));

    const resumen = leerEntrada(zip, 'xl/worksheets/sheet4.xml') ?? '';
    check('el resumen lleva el RUC', resumen.includes('20999999961'));
    check('el resumen lleva el IGV a pagar', resumen.includes('IGV a pagar'));
  }

  console.log('\n--- El saldo a favor del mes anterior entra ---');
  {
    // Octubre declara S/ 50 a favor; noviembre debe restarlos. Sin esto el
    // Excel y la pantalla de liquidación daban cifras distintas.
    // El período de octubre tiene que EXISTIR antes de fijarle el saldo: un
    // UPDATE sobre una fila que no está no hace nada y el test mentiría.
    await query(
      `INSERT INTO public.periodos (cliente_id, anio, mes, saldo_a_favor_igv)
       VALUES ($1, 2026, 10, 50) ON CONFLICT (cliente_id, anio, mes)
       DO UPDATE SET saldo_a_favor_igv = 50`,
      [clienteId]
    );
    const chk = await query<{ s: string | null }>(
      `SELECT saldo_a_favor_igv::text AS s FROM public.periodos
        WHERE cliente_id = $1 AND anio = 2026 AND mes = 10`,
      [clienteId]
    );
    check('el saldo quedó guardado', chk[0]?.s === '50.00', String(chk[0]?.s));

    const { out: outLiq, res: resLiq } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId, periodo: '2026-11' }), resLiq as never);
    const libro = outLiq.body as any;
    // IGV ventas 180 - crédito 108 = 72. Con el saldo de 50: 72 - 50 = 22.
    // Lo que se prueba es que el 50 se resta, no el valor concreto.
    check('el libro resta el saldo a favor', libro.igvAPagar === 22, String(libro.igvAPagar));

    const { out: outXl, res: resXl } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId, periodo: '2026-11', descargar: '1' }), resXl as never);
    const resumen = leerEntrada(outXl.bin as Buffer, 'xl/worksheets/sheet4.xml') ?? '';
    check('el Excel lleva el saldo a favor', resumen.includes('-50') || resumen.includes('>50<'),
      'no aparece el saldo');
    check('el Excel llega al mismo resultado que el resumen',
      resumen.includes('22'), 'falta el 22 del resultado');
  }

  console.log('\n--- Excel y pantalla no pueden discrepar ---');
  {
    // Se piden las dos vistas del mismo mes y se comparan. Fue un bug real:
    // /api/libro pasaba saldo 0 y la pantalla restaba el saldo a favor, así que
    // el mismo mes daba dos cifras distintas según dónde se mirara.
    const { default: liqHandler } = await import('../api/_rutas/liquidacion.ts');
    const { out: outLiq, res: resLiq } = fakeRig();
    await liqHandler(req('GET', tokenAdmin, 'liquidacion', { clienteId, periodo: '2026-11' }), resLiq as never);
    const { out: outLibro, res: resLibro } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId, periodo: '2026-11' }), resLibro as never);

    // El IGV viene anidado bajo 'igv' en la liquidación.
    const a = (outLiq.body as any)?.igv?.igvAPagar;
    const b = (outLibro.body as any)?.igvAPagar;
    check('la liquidación responde', outLiq.status === 200, String(outLiq.status));
    check('ambos endpoints dan el mismo IGV', a === b, `liquidación=${a} libro=${b}`);
  }

  console.log('\n--- Período sin comprobantes ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokenAdmin, 'libro', { clienteId, periodo: '2027-01', descargar: '1' }), res as never);
    check('igual genera el libro', out.status === 200 && out.bin !== null);
    const wb = leerEntrada(out.bin as Buffer, 'xl/workbook.xml') ?? '';
    check('con las cinco hojas vacías', (wb.match(/<sheet /g) ?? []).length === 5);
  }

} finally {
  for (const id of clientes) await query(`DELETE FROM public.clientes WHERE id = $1`, [id]);
  for (const id of usuarios) await query(`DELETE FROM neon_auth."user" WHERE id = $1`, [id]);
  server.close();
  const r = await query<{ c: number }>(`SELECT count(*)::int AS c FROM public.clientes WHERE ruc LIKE '2099999996%'`);
  console.log(`\nlimpieza: quedan ${r[0]?.c ?? 0} clientes de prueba`);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);
