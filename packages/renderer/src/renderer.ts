import type { SceneGraph } from '@sigma/document';
import type { Rect } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import type { Viewport } from './viewport';

export interface RenderFrame {
  graph: SceneGraph;
  pageId: NodeId;
  viewport: Viewport;
  /** Optional override of the page background. */
  background?: string | null;
  /** Nodes to skip drawing (e.g. while being edited inline). */
  hiddenNodeIds?: ReadonlySet<NodeId>;
}

export interface RenderStats {
  /** Nodes drawn in the last frame. */
  drawn: number;
  /** Nodes skipped by viewport culling in the last frame. */
  culled: number;
  /** Milliseconds spent in the last render call. */
  durationMs: number;
  /** Whether the last frame was a partial (dirty-region) redraw. */
  partial: boolean;
}

/**
 * A renderer draws the current document state. It never mutates the document and holds no
 * authoritative state of its own. Implementations: Canvas2DRenderer (now), WebGL (future).
 */
export interface Renderer {
  /** Marks a world-space region (or everything, when omitted) as needing a redraw. */
  invalidate(worldRect?: Rect): void;
  /** Draws the frame if anything is invalid. Returns true when a draw happened. */
  render(frame: RenderFrame): boolean;
  /** Forces a full redraw on the next render. */
  invalidateAll(): void;
  readonly stats: RenderStats;
  dispose(): void;
}
