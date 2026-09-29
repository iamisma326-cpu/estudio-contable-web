import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// La misma lógica que api/tipo-cambio.ts (serverless de Vercel), reutilizada
// en desarrollo para que /api/tipo-cambio exista también en `npm run dev`.
import handler from './api/tipo-cambio';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      {
        // Middleware de desarrollo: puentea /api/* al handler serverless
        name: 'api-dev-middleware',
        configureServer(server) {
          server.middlewares.use('/api/tipo-cambio', (req, res) => {
            handler(req, {
              setHeader(k, v) { res.setHeader(k, v); return this; },
              status(code) { res.statusCode = code; return this; },
              json(body) { res.end(JSON.stringify(body)); return this; },
              end(body) { res.end(body); return this; },
            });
          });
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
