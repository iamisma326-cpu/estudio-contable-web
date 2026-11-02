/**
 * Object Storage de Neon (compatible con S3).
 *
 * El bucket es privado: nunca se expone una URL permanente. El admin sube con
 * un PUT prefirmado y el cliente descarga con un GET prefirmado de vida corta.
 *
 * Variables que inyecta Neon (ver .env):
 *   AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * El bucket se declara en neon.ts como `assets`.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.NEON_STORAGE_BUCKET ?? 'assets';

let client: S3Client | null = null;

function s3(): S3Client {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  if (!endpoint) throw new Error('AWS_ENDPOINT_URL_S3 no está configurada');
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint,
      // El endpoint de Neon no usa virtual-host por bucket.
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return client;
}

/** URL de subida (PUT) para una clave concreta. */
export function signedUpload(key: string, contentType: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

/** URL de descarga (GET) temporal. */
export function signedDownload(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Limpia el nombre de archivo para usarlo dentro de una clave S3. */
export function safeFileName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(-80) || 'archivo'
  );
}
