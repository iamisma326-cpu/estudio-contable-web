/**
 * Hook de resolución: .js → .ts cuando el .js no existe en disco.
 * Ver _resolver-ts.mjs.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Los imports internos van sin extensión (para que Vercel los resuelva al
    // compilar y para que el código sea portable). Node necesita el .ts.
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      try {
        const resuelto = await nextResolve(specifier + '.ts', context);
        if (existsSync(fileURLToPath(resuelto.url))) return resuelto;
      } catch {
        /* cae al error original */
      }
    }
    // Compatibilidad con los handlers de api/, que importan con .js.
    if (specifier.endsWith('.js') && specifier.startsWith('.')) {
      const ts = specifier.slice(0, -3) + '.ts';
      try {
        const resuelto = await nextResolve(ts, context);
        if (existsSync(fileURLToPath(resuelto.url))) return resuelto;
      } catch {
        /* cae al error original */
      }
    }
    throw err;
  }
}
