import type { PathCommand, SceneChange, SceneGraph, SceneNode } from '@sigma/document';
import type { Rect, Vec2 } from '@sigma/geometry';
import {
  cubicFlatten,
  mat2d,
  pointInEllipse,
  pointInPolygon,
  pointInRect,
  pointNearPolyline,
  rect as R,
  regularPolygonPoints,
  SpatialIndex,
  starPoints,
} from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { paintMargin } from '@sigma/renderer';

export interface HitTestOptions {
  /** Extra predicate applied to the node and its ancestors (see Editor.nodeGuard). */
  guard?: (node: SceneNode) => boolean;
  /** World-space tolerance (usually a few screen px divided by zoom). */
  tolerance?: number;
  /** Ignore locked nodes (default true). */
  skipLocked?: boolean;
  /** Ignore hidden nodes (default true). */
  skipHidden?: boolean;
  /** Ids to exclude (e.g. the nodes currently being dragged). */
  exclude?: ReadonlySet<NodeId>;
}

/**
 * Accelerated hit testing for one page. Maintains a spatial index of world bounds plus a z-order
 * map so pointer queries never walk the whole document.
 */
export class HitTester {
  private index = new SpatialIndex<NodeId>(512);
  private zOrder = new Map<NodeId, number>();
  private pageId: NodeId | null = null;

  constructor(private readonly graph: SceneGraph) {}

  setPage(pageId: NodeId | null): void {
    this.pageId = pageId;
    this.rebuild();
  }

  /** Incrementally applies a scene change. */
  applyChange(change: SceneChange): void {
    if (!this.pageId || !this.graph.hasNode(this.pageId)) {
      this.pageId = null;
      this.index.clear();
      this.zOrder.clear();
      return;
    }
    if (change.structural) {
      this.rebuild();
      return;
    }
    for (const id of change.updated) {
      if (!this.graph.hasNode(id) || this.graph.getPageOf(id)?.id !== this.pageId) continue;
      this.indexNode(id);
      for (const did of this.graph.getDescendantIds(id)) this.indexNode(did);
      // Group bounds depend on children: refresh ancestors too.
      for (const anc of this.graph.getAncestors(id))
        if (anc.type !== 'PAGE') this.indexNode(anc.id);
    }
  }

  rebuild(): void {
    this.index.clear();
    this.zOrder.clear();
    if (!this.pageId) return;
    let z = 0;
    this.graph.traverse(this.pageId, (node) => {
      this.zOrder.set(node.id, z++);
      this.indexNode(node.id);
    });
  }

  private indexNode(id: NodeId): void {
    const node = this.graph.requireNode(id);
    const margin = paintMargin(node);
    this.index.update(id, R.inflate(this.graph.getWorldBounds(id), margin));
  }

  getZOrder(id: NodeId): number {
    return this.zOrder.get(id) ?? -1;
  }

  /** Top-most node under a world point, or null. Returns the deepest hit (not selection-resolved). */
  hitTest(world: Vec2, options: HitTestOptions = {}): SceneNode | null {
    const tolerance = options.tolerance ?? 0;
    const candidates = this.index.searchPoint(world.x, world.y, tolerance);
    let best: SceneNode | null = null;
    let bestZ = -1;
    for (const id of candidates) {
      if (options.exclude?.has(id)) continue;
      const node = this.graph.getNode(id);
      if (!node) continue;
      const z = this.zOrder.get(id) ?? -1;
      if (z <= bestZ) continue;
      if (!this.isInteractive(node, options)) continue;
      if (options.exclude && this.graph.getAncestors(id).some((a) => options.exclude?.has(a.id)))
        continue;
      if (this.hitsGeometry(node, world, tolerance)) {
        best = node;
        bestZ = z;
      }
    }
    return best;
  }

  /** All nodes whose world bounds intersect (or are contained by) a world rect. */
  nodesInRect(
    rect: Rect,
    mode: 'intersect' | 'contain' = 'intersect',
    options: HitTestOptions = {},
  ): SceneNode[] {
    const out: SceneNode[] = [];
    for (const id of this.index.search(rect)) {
      const node = this.graph.getNode(id);
      if (!node || !this.isInteractive(node, options)) continue;
      const wb = this.graph.getWorldBounds(id);
      if (mode === 'contain' ? R.containsRect(rect, wb) : R.intersects(rect, wb)) out.push(node);
    }
    return out.sort((a, b) => this.getZOrder(a.id) - this.getZOrder(b.id));
  }

  private isInteractive(node: SceneNode, options: HitTestOptions): boolean {
    const skipLocked = options.skipLocked ?? true;
    const skipHidden = options.skipHidden ?? true;
    if (skipHidden && !node.visible) return false;
    if (skipLocked && node.locked) return false;
    if (options.guard && !options.guard(node)) return false;
    for (const anc of this.graph.getAncestors(node.id)) {
      if (skipHidden && !anc.visible) return false;
      if (skipLocked && anc.locked) return false;
      if (options.guard && !options.guard(anc)) return false;
    }
    return true;
  }

  /** Precise geometry test in the node's local space. */
  hitsGeometry(node: SceneNode, world: Vec2, tolerance: number): boolean {
    const inv = mat2d.invert(this.graph.getWorldMatrix(node.id));
    const p = mat2d.apply(inv, world);
    const scale = mat2d.scaleFactor(inv);
    const tol = tolerance * scale;
    const bounds = this.graph.getLocalBounds(node.id);
    const strokeTol = Math.max(tol, maxStrokeWidth(node) / 2);
    switch (node.type) {
      case 'GROUP':
        // Groups are hit through their children only.
        return false;
      case 'FRAME': {
        const hasFill = node.style.fills.some((f) => f.visible);
        if (hasFill || node.childIds.length === 0) return pointInRect(p, bounds, tol);
        return pointInRect(p, bounds, strokeTol) && !pointInRect(p, R.inflate(bounds, -strokeTol));
      }
      case 'RECTANGLE':
      case 'IMAGE':
      case 'TEXT':
        return pointInRect(p, bounds, tol);
      case 'ELLIPSE':
        return pointInEllipse(p, bounds, tol);
      case 'LINE':
        return pointNearPolyline(
          p,
          [
            { x: 0, y: 0 },
            { x: bounds.width, y: 0 },
          ],
          strokeTol + tol,
        );
      case 'POLYGON':
        return (
          pointInPolygon(p, regularPolygonPoints(bounds, node.pointCount)) ||
          pointNearPolyline(p, regularPolygonPoints(bounds, node.pointCount), tol, true)
        );
      case 'STAR': {
        const pts = starPoints(bounds, node.pointCount, node.innerRadius);
        return pointInPolygon(p, pts) || pointNearPolyline(p, pts, tol, true);
      }
      case 'VECTOR': {
        const polys = flattenPath(node.path);
        const closed = node.path.some((c) => c.type === 'Z');
        for (const poly of polys) {
          if (closed && node.style.fills.some((f) => f.visible) && pointInPolygon(p, poly))
            return true;
          if (pointNearPolyline(p, poly, strokeTol + tol, closed)) return true;
        }
        return false;
      }
      default:
        return pointInRect(p, bounds, tol);
    }
  }
}

function maxStrokeWidth(node: SceneNode): number {
  let w = 0;
  for (const s of node.style.strokes)
    if (s.visible)
      w = Math.max(w, s.align === 'INSIDE' ? 0 : s.align === 'CENTER' ? s.width : s.width * 2);
  return w;
}

/** Flattens path commands into one polyline per sub-path. */
export function flattenPath(path: PathCommand[]): Vec2[][] {
  const polys: Vec2[][] = [];
  let current: Vec2[] = [];
  let last: Vec2 = { x: 0, y: 0 };
  for (const c of path) {
    if (c.type === 'M') {
      if (current.length) polys.push(current);
      current = [{ x: c.x, y: c.y }];
      last = { x: c.x, y: c.y };
    } else if (c.type === 'L') {
      last = { x: c.x, y: c.y };
      current.push(last);
    } else if (c.type === 'C') {
      const end = { x: c.x, y: c.y };
      const pts = cubicFlatten(last, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, end, 12);
      current.push(...pts.slice(1));
      last = end;
    }
  }
  if (current.length) polys.push(current);
  return polys;
}
