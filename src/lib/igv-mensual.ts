/**
 * Re-export desde api/_lib/igv-mensual.ts.
 *
 * La lógica vive en api/_lib/ porque el bundler de Vercel solo resuelve rutas
 * relativas dentro de api/. Aquí se re-exporta para que el frontend use el
 * mismo código sin duplicarlo.
 */

export * from '../../api/_lib/igv-mensual';
