/**
 * Prueba del handler de comprobantes contra la base real, con autenticación real.
 *
 * No se salta el guard: se crea un usuario en neon_auth, se firma un JWT con una
 * clave de prueba y se sirve su JWKS en un servidor local. Así se verifica de
 * verdad que un asistente puede operar, que un cliente no, y que el resto del
 * endpoint funciona.
 *
 * Crea cliente y usuario de prueba, y los borra al final.
 *
 * Uso: npm run test:api-comprobantes
 */

import { neon } from '@neondatabase/serverless';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

// --- JWKS local --------------------------------------------------------------
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

// Los módulos que leen el entorno se importan DESPUÉS de fijarlo.
const { default: handler } = await import('../api/_rutas/comprobantes.ts');
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
  const headers: Record<string, string> = {};
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: unknown) { out.body = b; return res; },
    end() { return res; },
    setHeader(k: string, v: string) { headers[k] = v; return res; },
  };
  return { out, headers, res };
}

function req(method: string, token: string | null, opts: { body?: unknown; query?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return { method, headers, query: opts.query ?? {}, body: opts.body, url: '/api/comprobantes' } as never;
}

let ok = 0;
let fallo = 0;
function check(desc: string, cond: boolean, detalle?: string) {
  if (cond) { ok++; console.log(`OK     ${desc}`); }
  else { fallo++; console.log(`FALLA  ${desc}${detalle ? ` :: ${detalle}` : ''}`); }
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>F001-500</cbc:ID>
  <cbc:IssueDate>2026-11-10</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID>20131312955</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>PROVEEDOR SAC</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cac:TaxSubtotal>
    <cbc:TaxableAmount>100.00</cbc:TaxableAmount><cbc:TaxAmount>18.00</cbc:TaxAmount>
    <cac:TaxCategory><cbc:ID>10</cbc:ID></cac:TaxCategory>
  </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:PayableAmount>118.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>Servicio</cbc:Description></cac:Item>
  </cac:InvoiceLine>
</Invoice>`;

let clienteId = '';
let periodoId = '';
let compId = '';
const usuarios: string[] = [];

try {
  // --- Cliente y usuarios de prueba ----------------------------------------
  const cli = await query<{ id: string }>(
    `INSERT INTO public.clientes (ruc, razon_social, regimen)
     VALUES ('20999999991', 'CLIENTE API PRUEBA', 'RMT') RETURNING id`
  );
  clienteId = cli[0].id;

  async function nuevoUsuario(role: string): Promise<string> {
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO neon_auth."user" (id, email, name, role, "emailVerified", "createdAt", "updatedAt", banned)
       VALUES ($1, $2, $3, $4, true, now(), now(), false)`,
      [id, `test-${id.slice(0, 8)}@example.com`, 'Prueba', role]
    );
    usuarios.push(id);
    return id;
  }

  const idAsistente = await nuevoUsuario('asistente');
  const idCliente = await nuevoUsuario('user');
  const tokAsistente = await firmar(idAsistente);
  const tokCliente = await firmar(idCliente);

  // -------------------------------------------------------------------------
  console.log('--- Autenticación y roles ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', null, { query: { periodoId: 'x' } }), res as never);
    check('sin token => 401', out.status === 401, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', 'token-invalido', { query: { periodoId: 'x' } }), res as never);
    check('token inválido => 401', out.status === 401);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokCliente, { query: { periodoId: 'x' } }), res as never);
    check('rol cliente => 403 (no es staff)', out.status === 403, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokAsistente), res as never);
    check('rol asistente => pasa el guard (400 por falta periodoId)', out.status === 400, String(out.status));
  }

  // -------------------------------------------------------------------------
  console.log('\n--- Validación de entrada ---');
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: {} }), res as never);
    check('sin clienteId => 400', out.status === 400);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: { clienteId } }), res as never);
    check('sin xml => 400', out.status === 400);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: { clienteId, xml: 'no soy xml' } }), res as never);
    check('archivo no UBL => 400', out.status === 400);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, {
      body: { clienteId: '00000000-0000-0000-0000-000000000000', xml: XML },
    }), res as never);
    check('cliente inexistente => 404', out.status === 404);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: { clienteId, xml: 'x'.repeat(2_100_000) } }), res as never);
    check('XML gigante => 413', out.status === 413, String(out.status));
  }

  // -------------------------------------------------------------------------
  console.log('\n--- Lectura sin guardar ---');
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: { clienteId, xml: XML } }), res as never);
    const body = out.body as Record<string, unknown>;
    check('lectura => 200', out.status === 200, String(out.status));
    check('no guarda por defecto', body.guardado === false);
    const c = body.comprobante as Record<string, unknown>;
    check('lee el total', c.total === 118, String(c.total));
    check('detecta compra por RUC', c.operacion === 'compra', String(c.operacion));
    check('estado revisado', c.estado === 'revisado', String(c.estado));

    const enBase = await query<{ c: number }>(`SELECT count(*)::int AS c FROM public.comprobantes WHERE cliente_id=$1`, [clienteId]);
    check('no escribió nada al solo leer', enBase[0].c === 0);
  }

  // -------------------------------------------------------------------------
  console.log('\n--- Guardar ---');
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: { clienteId, xml: XML, guardar: true, guardarAsiento: true } }), res as never);
    const body = out.body as Record<string, unknown>;
    check('guardar => 201', out.status === 201, `${out.status} ${JSON.stringify(body).slice(0, 150)}`);
    check('devuelve comprobanteId', typeof body.comprobanteId === 'string');
    check('creó el asiento', typeof body.asientoId === 'string');
    compId = String(body.comprobanteId);
    periodoId = String(body.periodoId);

    const as = await query<{ debe: string; haber: string }>(
      `SELECT debe::text, haber::text FROM public.asiento_lineas WHERE asiento_id = $1`, [body.asientoId]
    );
    const sd = as.reduce((s, l) => s + Number(l.debe), 0);
    const sh = as.reduce((s, l) => s + Number(l.haber), 0);
    check('las líneas guardadas cuadran', Math.abs(sd - sh) < 0.01, `${sd} vs ${sh}`);
    check('el asiento tiene partida doble', as.length >= 2);
  }

  // -------------------------------------------------------------------------
  console.log('\n--- Duplicado ---');
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: { clienteId, xml: XML, guardar: true } }), res as never);
    check('re-subir => 409', out.status === 409, String(out.status));
    check('no guardó', (out.body as Record<string, unknown>).guardado === false);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('POST', tokAsistente, { body: { clienteId, xml: XML } }), res as never);
    check('leer un duplicado => 200', out.status === 200);
    check('avisa del duplicado', (out.body as Record<string, unknown>).yaExiste === true);
  }

  // -------------------------------------------------------------------------
  console.log('\n--- Listar y totales ---');
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokAsistente, { query: { periodoId } }), res as never);
    const body = out.body as { comprobantes: unknown[]; totales: Record<string, { total: number }> };
    check('lista => 200', out.status === 200);
    check('devuelve el comprobante', body.comprobantes.length === 1, String(body.comprobantes.length));
    check('totales de compras', body.totales.compras.total === 118, String(body.totales.compras.total));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('GET', tokAsistente, { query: { periodoId, estado: 'inventado' } }), res as never);
    check('estado inválido => 400', out.status === 400);
  }

  // -------------------------------------------------------------------------
  console.log('\n--- Estados ---');
  {
    const { out, res } = fakeRig();
    await handler(req('PATCH', tokAsistente, { body: { id: compId, action: 'inventada' } }), res as never);
    check('acción inválida => 400', out.status === 400);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('PATCH', tokAsistente, { body: { id: compId, action: 'confirmar' } }), res as never);
    check('confirmar => 200', out.status === 200, String(out.status));
    const fila = await query<{ estado: string; confirmado_por: string | null }>(
      `SELECT estado, confirmado_por FROM public.comprobantes WHERE id = $1`, [compId]
    );
    check('queda confirmado', fila[0]?.estado === 'confirmado', fila[0]?.estado);
    check('registra al asistente que confirmó', fila[0]?.confirmado_por === idAsistente);
  }
  {
    const { out, res } = fakeRig();
    await handler(req('PATCH', tokAsistente, { body: { id: compId, action: 'descartar' } }), res as never);
    check('no descarta uno confirmado => 409', out.status === 409, String(out.status));
  }

  // -------------------------------------------------------------------------
  console.log('\n--- Otros ---');
  {
    const { out, res } = fakeRig();
    await handler(req('DELETE', tokAsistente), res as never);
    check('DELETE => 405', out.status === 405, String(out.status));
  }
  {
    const { out, res } = fakeRig();
    await handler(req('OPTIONS', null), res as never);
    check('OPTIONS => 204', out.status === 204, String(out.status));
  }

} finally {
  if (clienteId) await query(`DELETE FROM public.clientes WHERE id = $1`, [clienteId]);
  for (const id of usuarios) await query(`DELETE FROM neon_auth."user" WHERE id = $1`, [id]);
  server.close();

  const resto = await query<{ c: number }>(
    `SELECT count(*)::int AS c FROM public.comprobantes WHERE cliente_id = $1`, [clienteId]
  );
  console.log(`\nlimpieza: ${resto[0]?.c ?? 0} comprobantes, ${usuarios.length} usuarios borrados`);
}

console.log(`\n${ok} OK, ${fallo} fallos`);
process.exit(fallo === 0 ? 0 : 1);