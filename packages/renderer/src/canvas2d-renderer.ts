import type { SceneGraph } from '@sigma/document';
import { colorToCss } from '@sigma/document';
import type { Rect } from '@sigma/geometry';
import { rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import type { DrawContext } from './draw';
import { drawNode } from './draw';
import { ImageCache } from './image-cache';
import type { RenderFrame, RenderStats, Renderer } from './renderer';

export interface Canvas2DRendererOptions {
  images?: ImageCache;
  /** Disable partial redraws (always redraw everything). Useful for debugging. */
  disableDirtyRegions?: boolean;
}

/**
 * Canvas 2D implementation of the Renderer. Supports viewport culling and dirty-region redraws:
 * when only a world region is invalidated, the canvas is clipped to it and only intersecting nodes
 * are drawn.
 */
export class Canvas2DRenderer implements Renderer {
  readonly images: ImageCache;
  readonly stats: RenderStats = { drawn: 0, culled: 0, durationMs: 0, partial: false };
  private ctx: CanvasRenderingContext2D;
  private dirtyAll = true;
  private dirtyWorld: Rect | null = null;
  private lastViewportKey = '';
  private lastPageId: NodeId | null = null;
  private lastRevision = -1;
  private readonly disableDirtyRegions: boolean;

  constructor(
    readonly canvas: HTMLCanvasElement,
    options: Canvas2DRendererOptions = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available');
    this.ctx = ctx;
    this.images = options.images ?? new ImageCache();
    this.disableDirtyRegions = options.disableDirtyRegions ?? false;
  }

  invalidate(worldRect?: Rect): void {
    if (!worldRect || this.disableDirtyRegions) {
      this.dirtyAll = true;
      return;
    }
    this.dirtyWorld = this.dirtyWorld ? R.union(this.dirtyWorld, worldRect) : worldRect;
  }

  invalidateAll(): void {
    this.dirtyAll = true;
    this.dirtyWorld = null;
  }

  render(frame: RenderFrame): boolean {
    const { viewport, graph, pageId } = frame;
    const dpr = viewport.devicePixelRatio;
    const w = Math.max(1, Math.round(viewport.width * dpr));
    const h = Math.max(1, Math.round(viewport.height * dpr));
    const key = `${viewport.zoom}:${viewport.offsetX}:${viewport.offsetY}:${w}:${h}`;
    if (key !== this.lastViewportKey || pageId !== this.lastPageId) this.dirtyAll = true;
    if (!this.dirtyAll && graph.revision !== this.lastRevision && !this.dirtyWorld)
      this.dirtyAll = true;
    if (!this.dirtyAll && !this.dirtyWorld) return false;

    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.dirtyAll = true;
    }
    this.lastViewportKey = key;
    this.lastPageId = pageId;
    this.lastRevision = graph.revision;

    const ctx = this.ctx;
    const page = graph.getNode(pageId);
    const partial = !this.dirtyAll && this.dirtyWorld !== null;
    const visible = viewport.getVisibleWorldRect();
    const cullRect = partial
      ? (R.intersection(this.dirtyWorld as Rect, visible) ?? R.empty())
      : visible;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (partial) {
      const s = viewport.worldRectToScreen(cullRect);
      const clip = R.inflate(R.round(s), 2);
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.width, clip.height);
      ctx.clip();
    }
    const bg =
      frame.background === undefined
        ? page?.type === 'PAGE'
          ? colorToCss(page.backgroundColor)
          : '#f0f0f0'
        : frame.background;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
    } else {
      ctx.clearRect(0, 0, viewport.width, viewport.height);
    }

    const m = viewport.getMatrix();
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);

    const dc: DrawContext = {
      ctx,
      graph,
      images: this.images,
      cullRect: R.isEmpty(cullRect) ? { x: 0, y: 0, width: 0, height: 0 } : cullRect,
      hiddenNodeIds: frame.hiddenNodeIds,
      stats: { drawn: 0, culled: 0 },
      zoom: viewport.zoom,
    };
    if (page) {
      for (const childId of page.childIds) drawNode(dc, graph.requireNode(childId));
    }
    ctx.restore();

    this.stats.drawn = dc.stats.drawn;
    this.stats.culled = dc.stats.culled;
    this.stats.partial = partial;
    this.stats.durationMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    this.dirtyAll = false;
    this.dirtyWorld = null;
    return true;
  }

  dispose(): void {
    this.images.clear();
  }
}

export interface RasterizeOptions {
  /** Output scale (1 = 1 world unit per CSS pixel). */
  scale?: number;
  /** Background CSS color; null for transparent. Defaults to transparent. */
  background?: string | null;
  images?: ImageCache;
  /** Extra margin (world units) around the rendered bounds. */
  padding?: number;
  /** Canvas factory for non-browser environments (e.g. @napi-rs/canvas in Node). */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
}

/**
 * Renders a set of nodes (or a whole page) into a new canvas at the given scale. Used by PNG export
 * and thumbnails. Nodes keep their relative positions; the canvas covers the union of their bounds.
 */
export function rasterizeNodes(
  graph: SceneGraph,
  nodeIds: readonly NodeId[],
  options: RasterizeOptions = {},
): HTMLCanvasElement {
  const scale = options.scale ?? 1;
  const padding = options.padding ?? 0;
  // Pages have no size of their own: cover their children.
  const bounds =
    R.unionAll(
      nodeIds.flatMap((id) => {
        const node = graph.requireNode(id);
        return node.type === 'PAGE'
          ? node.childIds.map((c) => graph.getWorldBounds(c))
          : [graph.getWorldBounds(id)];
      }),
    ) ?? R.of(0, 0, 1, 1);
  const area = R.inflate(bounds, padding);
  const width = Math.max(1, Math.ceil(area.width * scale));
  const height = Math.max(1, Math.ceil(area.height * scale));
  const canvas = options.createCanvas
    ? options.createCanvas(width, height)
    : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is not available');
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
  const dc: DrawContext = {
    ctx,
    graph,
    images: options.images ?? new ImageCache(),
    cullRect: null,
    stats: { drawn: 0, culled: 0 },
    zoom: scale,
  };
  for (const id of nodeIds) {
    const node = graph.requireNode(id);
    // drawNode expects the parent's coordinate space: apply the parent's world matrix.
    ctx.save();
    if (node.parentId) {
      const pm = graph.getWorldMatrix(node.parentId);
      ctx.transform(pm.a, pm.b, pm.c, pm.d, pm.e, pm.f);
    }
    if (node.type === 'PAGE') {
      for (const cid of node.childIds) drawNode(dc, graph.requireNode(cid));
    } else {
      drawNode(dc, node);
    }
    ctx.restore();
  }
  return canvas;
}
