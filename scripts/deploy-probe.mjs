/**
 * Probe E2E del endpoint desplegado /api/pdf-edit con la factura real.
 * Uso: node --env-file=/tmp/pdf-test/.env.vercel scripts/deploy-probe.mjs <pdf> <instrucción>
 */
import { readFileSync } from 'node:fs';

const BASE = 'https://estudio-contable-web-chi.vercel.app';
const pdfPath = process.argv[2] ?? '/tmp/pdf-test/factura-real.pdf';
const instruction = process.argv[3] ?? 'Cambiar el nombre del cliente Carlos Pérez por Ana Torres, y el total S/ 115.0 por S/ 140.0';

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }),
});
console.log('login status:', login.status);
if (!login.ok) {
  console.log(await login.text());
  process.exit(1);
}
const setCookie = login.headers.get('set-cookie') ?? '';
const cookie = setCookie.split(';')[0];

const b64 = readFileSync(pdfPath).toString('base64');
const t0 = Date.now();
const res = await fetch(`${BASE}/api/pdf-edit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ pdfBase64: b64, instruction }),
});
console.log('pdf-edit status:', res.status, `(${Date.now() - t0} ms)`);
const j = await res.json();
console.log(JSON.stringify(j, null, 2));
