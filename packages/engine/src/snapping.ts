import type { Rect, Vec2 } from '@sigma/geometry';

export interface SnapGuide {
  axis: 'x' | 'y';
  /** World coordinate of the guide line. */
  position: number;
  /** World-space extent along the other axis (for drawing). */
  from: number;
  to: number;
}

export interface SnapResult {
  delta: Vec2;
  guides: SnapGuide[];
}

export interface SnapTarget {
  rect: Rect;
}

function edges(r: Rect): { x: number[]; y: number[] } {
  return {
    x: [r.x, r.x + r.width / 2, r.x + r.width],
    y: [r.y, r.y + r.height / 2, r.y + r.height],
  };
}

/**
 * Snaps a moving rect against target rects (edges + centers) and optionally a grid.
 * Returns the delta to add to the proposed position and the guides to draw.
 */
export function snapRect(
  moving: Rect,
  targets: readonly SnapTarget[],
  options: { threshold: number; gridSize?: number | null; pixelSnap?: boolean },
): SnapResult {
  const me = edges(moving);
  let bestX: { delta: number; dist: number; guide: SnapGuide } | null = null;
  let bestY: { delta: number; dist: number; guide: SnapGuide } | null = null;

  for (const t of targets) {
    const te = edges(t.rect);
    for (const a of me.x) {
      for (const b of te.x) {
        const d = Math.abs(a - b);
        if (d <= options.threshold && (!bestX || d < bestX.dist)) {
          bestX = {
            delta: b - a,
            dist: d,
            guide: {
              axis: 'x',
              position: b,
              from: Math.min(moving.y, t.rect.y),
              to: Math.max(moving.y + moving.height, t.rect.y + t.rect.height),
            },
          };
        }
      }
    }
    for (const a of me.y) {
      for (const b of te.y) {
        const d = Math.abs(a - b);
        if (d <= options.threshold && (!bestY || d < bestY.dist)) {
          bestY = {
            delta: b - a,
            dist: d,
            guide: {
              axis: 'y',
              position: b,
              from: Math.min(moving.x, t.rect.x),
              to: Math.max(moving.x + moving.width, t.rect.x + t.rect.width),
            },
          };
        }
      }
    }
  }

  const guides: SnapGuide[] = [];
  let dx = 0;
  let dy = 0;
  if (bestX) {
    dx = bestX.delta;
    guides.push(bestX.guide);
  } else if (options.gridSize) {
    const g = options.gridSize;
    dx = Math.round(moving.x / g) * g - moving.x;
  } else if (options.pixelSnap) {
    dx = Math.round(moving.x) - moving.x;
  }
  if (bestY) {
    dy = bestY.delta;
    guides.push(bestY.guide);
  } else if (options.gridSize) {
    const g = options.gridSize;
    dy = Math.round(moving.y / g) * g - moving.y;
  } else if (options.pixelSnap) {
    dy = Math.round(moving.y) - moving.y;
  }
  return { delta: { x: dx, y: dy }, guides };
}

/** Snaps a single point (used while drawing shapes) to grid/pixels. */
export function snapPoint(
  p: Vec2,
  options: { gridSize?: number | null; pixelSnap?: boolean },
): Vec2 {
  if (options.gridSize) {
    const g = options.gridSize;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }
  if (options.pixelSnap) return { x: Math.round(p.x), y: Math.round(p.y) };
  return p;
}
