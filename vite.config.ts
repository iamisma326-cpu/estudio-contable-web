import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// La misma lógica que api/*.ts (serverless de Vercel), reutilizada
// en desarrollo para que /api/* exista también en `npm run dev`.
import tipoCambio from './api/tipo-cambio';
import cronograma from './api/cronograma';
import rentaAnual from './api/renta-anual';

/** Shape que esperan los handlers de api/ (espejo de ResLike en cada uno) */
interface DevRes {
  setHeader(k: string, v: string): DevRes;
  status(code: number): DevRes;
  json(body: unknown): DevRes;
  end(body?: string): DevRes;
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      {
        // Middleware de desarrollo: puentea /api/* a los handlers serverless.
        // El res de Connect expone setHeader/statusCode/end; se adapta al
        // shape que esperan los handlers con un objeto devuelto fluido.
        name: 'api-dev-middleware',
        configureServer(server) {
          const bridge =
            (handler: (req: { method?: string }, res: DevRes) => Promise<void>) =>
            (req: { method?: string }, res: {
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
              handler(req, adapted);
            };

          server.middlewares.use('/api/tipo-cambio', bridge(tipoCambio));
          server.middlewares.use('/api/cronograma', bridge(cronograma));
          server.middlewares.use('/api/renta-anual', bridge(rentaAnual));
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
