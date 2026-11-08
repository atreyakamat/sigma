import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** AES-256-GCM with a key derived from SESSION_SECRET; used for TOTP secrets at rest. */
export function encryptSecret(plain: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptSecret(value: string, secret: string): string {
  const [iv, enc, tag] = value.split('.');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv as string, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag as string, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(enc as string, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
