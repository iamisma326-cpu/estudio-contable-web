/**
 * Re-export desde api/_lib/pdf-factura.ts.
 *
 * La lógica vive en api/_lib/ porque el bundler de Vercel solo resuelve rutas
 * relativas dentro de api/. Aquí se re-exporta para que el frontend use el
 * mismo código sin duplicarlo.
 */

export * from '../../api/_lib/pdf-factura';
