/**
 * Resolver ESM para las pruebas: permite que Node cargue los módulos de api/
 * tal como están escritos.
 *
 * Los handlers de api/ importan con extensión .js (es lo que espera el
 * bundler de Vercel al compilar TS). Node, en cambio, resuelve literal y busca
 * db.js, que no existe porque el archivo es db.ts. Este hook traduce .js → .ts
 * cuando el .js no existe.
 *
 * Uso: node --import ./scripts/_resolver-ts.mjs <script>
 */

import { register } from 'node:module';

register('./_resolver-ts-hooks.mjs', import.meta.url);
