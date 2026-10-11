import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

// La misma lógica que api/*.ts (serverless de Vercel), reutilizada
// en desarrollo para que /api/* exista también en `npm run dev`.
import tipoCambio from './api/tipo-cambio';
import cronograma from './api/cronograma';
import rentaAnual from './api/renta-anual';
import adminLogin from './api/admin/login';
import adminLogout from './api/admin/logout';
import adminSession from './api/admin/session';
import pdfEdit from './api/pdf-edit';
import pdfRender from './api/pdf-render';

/** Shape que esperan los handlers de api/ (espejo de ResLike en cada uno) */
interface DevRes {
  setHeader(k: string, v: string): DevRes;
  status(code: number): DevRes;
  json(body: unknown): DevRes;
  end(body?: string): DevRes;
}

export default defineConfig(({ mode }) => {
  // Los handlers serverless leen process.env.GOOGLE_AI_API_KEY / GROQ_API_KEY.
  // En Vercel llegan del dashboard; en dev, loadEnv las trae de .env al
  // process.env para que el middleware de /api/* los vea igual que prod.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('GOOGLE_') || k.startsWith('GROQ_') || k.startsWith('ADMIN_')) {
      process.env[k] = v;
    }
  }
  return {
    plugins: [
      react(),
      {
        // Middleware de desarrollo: puentea /api/* a los handlers serverless.
        // El res de Connect expone setHeader/statusCode/end; se adapta al
        // shape que esperan los handlers con un objeto devuelto fluido.
        name: 'api-dev-middleware',
        configureServer(server) {
          // Connect (el server de Vite) NO parsea el body: en Vercel req.body
          // llega como objeto (bodyParser automático), pero en dev llega
          // undefined y los handlers que usan readJsonBody ven null. Este
          // wrapper lo reconstruye a mano para que dev == prod.
          const readBody = (req: { method?: string; headers?: Record<string, unknown>; on?: unknown; body?: unknown }): Promise<unknown> =>
            new Promise((resolve) => {
              if (req.body !== undefined && req.body !== null) {
                resolve(req.body);
                return;
              }
              const chunks: Buffer[] = [];
              const r = req as unknown as {
                on(ev: string, cb: (d?: Buffer) => void): void;
                headers?: Record<string, string | string[] | undefined>;
              };
              r.on('data', (d?: Buffer) => { if (d) chunks.push(d); });
              r.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                if (!raw) { resolve(null); return; }
                try { resolve(JSON.parse(raw)); } catch { resolve(null); }
              });
              r.on('error', () => resolve(null));
            });

          const bridge =
            (handler: (req: { method?: string }, res: DevRes) => Promise<void>) =>
            async (req: { method?: string }, res: {
              setHeader(k: string, v: string): void;
              statusCode: number;
              end(body?: string): void;
            }) => {
              const adapted: DevRes = {
                setHeader(k, v) { res.setHeader(k, v); return adapted; },
                status(code) { res.statusCode = code; return adapted; },
                json(body) { res.end(JSON.stringify(body)); return adapted; },
                end(body) { res.end(body); return adapted; },
              };
              const hasBody = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';
              if (hasBody) {
                (req as { body?: unknown }).body = await readBody(req);
              }
              await handler(req, adapted);
            };

          server.middlewares.use('/api/tipo-cambio', bridge(tipoCambio));
          server.middlewares.use('/api/cronograma', bridge(cronograma));
          server.middlewares.use('/api/renta-anual', bridge(rentaAnual));
          server.middlewares.use('/api/admin/login', bridge(adminLogin));
          server.middlewares.use('/api/admin/logout', bridge(adminLogout));
          server.middlewares.use('/api/admin/session', bridge(adminSession));
          server.middlewares.use('/api/pdf-edit', bridge(pdfEdit));
          server.middlewares.use('/api/pdf-render', bridge(pdfRender));
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // es2022: Vite deja de emitir el polyfill de modulepreload y compacta
      // mejor optional chaining/nullish. Lo soportan todos los navegadores
      // con share de ES modules, que es el único público que sirve un
      // `type="module"`.
      target: 'es2022',
      rollupOptions: {
        output: {
          // El chunk de entrada mezclaba react-dom (~630 KB fuente), GSAP
          // (~380 KB) y el router en un solo archivo: cualquier cambio del
          // sitio revalidaba todo y la cachecita de vendor se perdía.
          // Separarlos además permite cachear cada uno con su cabecera.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (/node_modules\/(@gsap|gsap)\//.test(id)) return 'gsap';
            if (/node_modules\/react-router/.test(id)) return 'router';
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});
