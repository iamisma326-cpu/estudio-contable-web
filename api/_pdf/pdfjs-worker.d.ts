/**
 * El bundle del worker legacy de pdfjs-dist no incluye tipos; se importa
 * dinámicamente en api/_pdf/text.ts para fijar el worker en un entorno
 * serverless (Vercel) donde el fake worker falla al intentar cargar el
 * archivo del worker con import dinámico en runtime.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  const pdfjsWorker: unknown;
  export { pdfjsWorker };
}
