/**
 * Re-export desde api/_lib/moneda.ts.
 *
 * La lógica vive en api/_lib/ porque la API la necesita y el bundler de Vercel
 * solo resuelve rutas relativas dentro de api/. Aquí se re-exporta para que el
 * frontend use el mismo código sin duplicarlo; si se editara una copia, las dos
 * versiones se desincronizarían en silencio.
 */

export * from '../../api/_lib/moneda';
