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
    // Solo se reintenta con .ts si el import terminaba en .js y es relativo.
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
