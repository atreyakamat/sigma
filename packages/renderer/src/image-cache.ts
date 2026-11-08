import { Emitter } from '@sigma/shared';

export type ImageSource = CanvasImageSource & { width: number; height: number };

export interface ImageCacheEvents extends Record<string, unknown> {
  /** An image finished loading (or failed); callers should re-render. */
  change: { src: string; ok: boolean };
}

/**
 * Loads and caches images referenced by image fills. Loading is asynchronous; the renderer draws a
 * placeholder until the image arrives and the cache emits `change` so the editor can request a frame.
 */
export class ImageCache {
  readonly events = new Emitter<ImageCacheEvents>();
  private images = new Map<string, ImageSource | null>();
  private pending = new Set<string>();

  /** Returns the image when loaded, `null` when it failed, `undefined` while loading. */
  get(src: string): ImageSource | null | undefined {
    if (this.images.has(src)) return this.images.get(src);
    this.load(src);
    return undefined;
  }

  has(src: string): boolean {
    return this.images.has(src);
  }

  set(src: string, image: ImageSource): void {
    this.images.set(src, image);
    this.events.emit('change', { src, ok: true });
  }

  private load(src: string): void {
    if (this.pending.has(src) || typeof Image === 'undefined') return;
    this.pending.add(src);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.pending.delete(src);
      this.images.set(src, img);
      this.events.emit('change', { src, ok: true });
    };
    img.onerror = () => {
      this.pending.delete(src);
      this.images.set(src, null);
      this.events.emit('change', { src, ok: false });
    };
    img.src = src;
  }

  clear(): void {
    this.images.clear();
    this.pending.clear();
  }
}
