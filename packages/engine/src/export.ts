import type { SceneGraph } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import type { ImageCache } from '@sigma/renderer';
import { rasterizeNodes } from '@sigma/renderer';

export interface PngExportOptions {
  scale?: number;
  background?: string | null;
  padding?: number;
  images?: ImageCache;
}

/** Renders nodes (or a page) to a PNG blob. */
export async function exportPng(
  graph: SceneGraph,
  ids: readonly NodeId[],
  options: PngExportOptions = {},
): Promise<Blob> {
  const canvas = rasterizeNodes(graph, ids, {
    scale: options.scale ?? 1,
    background: options.background ?? null,
    padding: options.padding ?? 0,
    images: options.images,
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    );
  });
}

/** Renders nodes to a PNG data URL (thumbnails). */
export function exportPngDataUrl(
  graph: SceneGraph,
  ids: readonly NodeId[],
  options: PngExportOptions = {},
): string {
  const canvas = rasterizeNodes(graph, ids, {
    scale: options.scale ?? 1,
    background: options.background ?? null,
    padding: options.padding ?? 0,
    images: options.images,
  });
  return canvas.toDataURL('image/png');
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
