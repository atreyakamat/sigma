export type SupportedImageMime =
  'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/svg+xml';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Sniffs the real image type from magic bytes. File extensions and the browser-provided MIME are
 * not trusted. Returns null when the bytes are not a supported raster/vector image.
 */
export function sniffImageMime(bytes: Uint8Array): SupportedImageMime | null {
  const b = bytes;
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp';
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  )
    return 'image/gif';
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(b.subarray(0, Math.min(b.length, 512)))
    .trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head))
    return 'image/svg+xml';
  return null;
}

export interface DecodedImage {
  mime: SupportedImageMime;
  /** Data URL suitable for an image fill `src`. */
  dataUrl: string;
  width: number;
  height: number;
  size: number;
  name: string;
}

export class ImageImportError extends Error {
  constructor(
    message: string,
    public readonly code: 'TOO_LARGE' | 'UNSUPPORTED' | 'DECODE_FAILED',
  ) {
    super(message);
    this.name = 'ImageImportError';
  }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}

/** Validates and decodes an image file in the browser, measuring its natural size. */
export async function decodeImageFile(
  file: Blob & { name?: string },
  maxBytes = MAX_IMAGE_BYTES,
): Promise<DecodedImage> {
  if (file.size > maxBytes)
    throw new ImageImportError(
      `Image exceeds ${Math.round(maxBytes / 1024 / 1024)} MB`,
      'TOO_LARGE',
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) throw new ImageImportError('Unsupported or corrupt image', 'UNSUPPORTED');
  const dataUrl = bytesToDataUrl(bytes, mime);
  const { width, height } = await measureImage(dataUrl);
  return { mime, dataUrl, width, height, size: file.size, name: file.name ?? 'Image' };
}

export function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = () => reject(new ImageImportError('Image could not be decoded', 'DECODE_FAILED'));
    img.src = src;
  });
}
