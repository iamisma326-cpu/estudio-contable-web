import { readFileSync } from 'node:fs';

const BASE = 'https://estudio-contable-web-chi.vercel.app';
const pdfPath = process.argv[2] ?? '/tmp/pdf-test/factura-real.pdf';

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user: process.env.ADMIN_USER, password: process.env.ADMIN_PASSWORD }),
});
console.log('login status:', login.status);
if (!login.ok) process.exit(1);
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];

const b64 = readFileSync(pdfPath).toString('base64');
const res = await fetch(`${BASE}/api/pdf-edit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ pdfBase64: b64, instruction: 'x', debug: true }),
});
console.log('debug status:', res.status);
console.log(JSON.stringify(await res.json(), null, 2));
