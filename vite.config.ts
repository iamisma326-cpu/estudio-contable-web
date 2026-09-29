import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// La misma lógica que api/*.ts (serverless de Vercel), reutilizada
// en desarrollo para que /api/* exista también en `npm run dev`.
import tipoCambio from './api/tipo-cambio';
import cronograma from './api/cronograma';

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
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});
