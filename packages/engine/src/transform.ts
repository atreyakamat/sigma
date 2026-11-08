import type { SceneGraph, Transform } from '@sigma/document';
import type { Mat2d, Rect, Vec2 } from '@sigma/geometry';
import { mat2d, rect as R, vec2 } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';

export type HandleId = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type RotateHandleId = 'rot-ne' | 'rot-se' | 'rot-sw' | 'rot-nw';

export const CORNER_HANDLES: HandleId[] = ['nw', 'ne', 'se', 'sw'];
export const EDGE_HANDLES: HandleId[] = ['n', 'e', 's', 'w'];
export const ALL_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * The oriented box around a selection: a local rect (0,0,w,h) placed in the world by `matrix`.
 * A single node uses its own world matrix (so handles follow rotation); multiple nodes use their
 * axis-aligned world bounds.
 */
export interface SelectionFrame {
  matrix: Mat2d;
  width: number;
  height: number;
}

export function getSelectionFrame(
  graph: SceneGraph,
  ids: readonly NodeId[],
): SelectionFrame | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) {
    const id = ids[0] as NodeId;
    const b = graph.getLocalBounds(id);
    const m = mat2d.multiply(graph.getWorldMatrix(id), mat2d.translation(b.x, b.y));
    return { matrix: m, width: b.width, height: b.height };
  }
  const bounds = R.unionAll(ids.map((id) => graph.getWorldBounds(id)));
  if (!bounds) return null;
  return {
    matrix: mat2d.translation(bounds.x, bounds.y),
    width: bounds.width,
    height: bounds.height,
  };
}

/** Local (frame-space) anchor point of a handle. */
export function handleLocalPoint(frame: SelectionFrame, handle: HandleId): Vec2 {
  const { width: w, height: h } = frame;
  switch (handle) {
    case 'nw':
      return { x: 0, y: 0 };
    case 'n':
      return { x: w / 2, y: 0 };
    case 'ne':
      return { x: w, y: 0 };
    case 'e':
      return { x: w, y: h / 2 };
    case 'se':
      return { x: w, y: h };
    case 's':
      return { x: w / 2, y: h };
    case 'sw':
      return { x: 0, y: h };
    case 'w':
      return { x: 0, y: h / 2 };
  }
}

export function handleWorldPoint(frame: SelectionFrame, handle: HandleId): Vec2 {
  return mat2d.apply(frame.matrix, handleLocalPoint(frame, handle));
}

/** The frame's four corners in world space (nw, ne, se, sw). */
export function frameCorners(frame: SelectionFrame): [Vec2, Vec2, Vec2, Vec2] {
  return [
    mat2d.apply(frame.matrix, { x: 0, y: 0 }),
    mat2d.apply(frame.matrix, { x: frame.width, y: 0 }),
    mat2d.apply(frame.matrix, { x: frame.width, y: frame.height }),
    mat2d.apply(frame.matrix, { x: 0, y: frame.height }),
  ];
}

export function frameRotationDegrees(frame: SelectionFrame): number {
  return (Math.atan2(frame.matrix.b, frame.matrix.a) * 180) / Math.PI;
}

/** CSS cursor for a handle, accounting for the frame's rotation. */
export function handleCursor(handle: HandleId, rotationDeg: number): string {
  const base: Record<HandleId, number> = {
    n: 0,
    ne: 45,
    e: 90,
    se: 135,
    s: 180,
    sw: 225,
    w: 270,
    nw: 315,
  };
  const angle = (((base[handle] + rotationDeg) % 360) + 360) % 360;
  const sector = Math.round(angle / 45) % 8;
  return [
    'ns-resize',
    'nesw-resize',
    'ew-resize',
    'nwse-resize',
    'ns-resize',
    'nesw-resize',
    'ew-resize',
    'nwse-resize',
  ][sector] as string;
}

export interface ResizeOptions {
  /** Keep aspect ratio (shift). */
  proportional?: boolean;
  /** Resize symmetrically around the center (alt). */
  fromCenter?: boolean;
  minSize?: number;
}

/**
 * Computes the new local rect (in frame space) when `handle` is dragged so that it sits at
 * `pointerLocal` (the pointer expressed in frame space). The opposite side stays fixed unless
 * `fromCenter`. Width/height may come out negative when the pointer crosses over; callers normalize.
 */
export function resizeFrameRect(
  frame: SelectionFrame,
  handle: HandleId,
  pointerLocal: Vec2,
  options: ResizeOptions = {},
): Rect {
  const { width: w, height: h } = frame;
  const min = options.minSize ?? 1;
  let x0 = 0;
  let y0 = 0;
  let x1 = w;
  let y1 = h;
  const affectsX = handle.includes('e') || handle.includes('w');
  const affectsY = handle.includes('n') || handle.includes('s');

  if (options.fromCenter) {
    const cx = w / 2;
    const cy = h / 2;
    if (handle.includes('e')) {
      x1 = pointerLocal.x;
      x0 = cx - (x1 - cx);
    } else if (handle.includes('w')) {
      x0 = pointerLocal.x;
      x1 = cx + (cx - x0);
    }
    if (handle.includes('s')) {
      y1 = pointerLocal.y;
      y0 = cy - (y1 - cy);
    } else if (handle.includes('n')) {
      y0 = pointerLocal.y;
      y1 = cy + (cy - y0);
    }
  } else {
    if (handle.includes('e')) x1 = pointerLocal.x;
    else if (handle.includes('w')) x0 = pointerLocal.x;
    if (handle.includes('s')) y1 = pointerLocal.y;
    else if (handle.includes('n')) y0 = pointerLocal.y;
  }

  let nw = x1 - x0;
  let nh = y1 - y0;

  if (options.proportional && w > 0 && h > 0) {
    const ratio = w / h;
    if (affectsX && affectsY) {
      // Corner: use the larger relative change.
      const sx = Math.abs(nw) / w;
      const sy = Math.abs(nh) / h;
      if (sx > sy) nh = Math.sign(nh || 1) * (Math.abs(nw) / ratio);
      else nw = Math.sign(nw || 1) * Math.abs(nh) * ratio;
    } else if (affectsX) {
      nh = Math.sign(nh || 1) * (Math.abs(nw) / ratio);
    } else {
      nw = Math.sign(nw || 1) * Math.abs(nh) * ratio;
    }
    if (options.fromCenter) {
      const cx = w / 2;
      const cy = h / 2;
      x0 = cx - nw / 2;
      y0 = cy - nh / 2;
    } else {
      if (handle.includes('w')) x0 = x1 - nw;
      else if (affectsX) x0 = 0;
      else x0 = (w - nw) / 2;
      if (handle.includes('n')) y0 = y1 - nh;
      else if (affectsY) y0 = 0;
      else y0 = (h - nh) / 2;
    }
  }

  if (Math.abs(nw) < min) nw = Math.sign(nw || 1) * min;
  if (Math.abs(nh) < min) nh = Math.sign(nh || 1) * min;
  return { x: x0, y: y0, width: nw, height: nh };
}

export interface NodeTransformResult {
  id: NodeId;
  transform: Partial<Transform>;
  size?: { width: number; height: number };
}

/**
 * Maps a new frame-space rect back to node transforms. For a single node, the node's size becomes
 * the rect size and its origin moves to the rect origin (flips are expressed as negative scale).
 * For multiple nodes, each node is scaled/translated proportionally inside the frame.
 */
export function applyFrameRectToNodes(
  graph: SceneGraph,
  ids: readonly NodeId[],
  frame: SelectionFrame,
  next: Rect,
): NodeTransformResult[] {
  const results: NodeTransformResult[] = [];
  const flipX = next.width < 0;
  const flipY = next.height < 0;
  const normalized = R.fromPoints(
    { x: next.x, y: next.y },
    { x: next.x + next.width, y: next.y + next.height },
  );

  if (ids.length === 1) {
    const id = ids[0] as NodeId;
    const node = graph.requireNode(id);
    const lb = graph.getLocalBounds(id);
    const parentInv = node.parentId
      ? mat2d.invert(graph.getWorldMatrix(node.parentId))
      : mat2d.identity();
    // New world origin of the node's local (bounds.x, bounds.y) corner. When flipped we keep the
    // visual box but mirror via scale, so the origin is the normalized rect's corner adjusted.
    const originLocal = { x: normalized.x - (flipX ? 0 : 0), y: normalized.y };
    const worldOrigin = mat2d.apply(frame.matrix, originLocal);
    const parentOrigin = mat2d.apply(parentInv, worldOrigin);
    const scaleX = Math.abs(node.transform.scaleX) * (flipX ? -1 : 1);
    const scaleY = Math.abs(node.transform.scaleY) * (flipY ? -1 : 1);
    if (node.type === 'GROUP') {
      // Groups have no size: scale children instead.
      const sx = normalized.width / Math.max(lb.width, 1e-6);
      const sy = normalized.height / Math.max(lb.height, 1e-6);
      for (const cid of node.childIds) {
        const child = graph.requireNode(cid);
        const cb = graph.getLocalBounds(cid);
        results.push({
          id: cid,
          transform: {
            x: normalized.x + (child.transform.x - lb.x) * sx,
            y: normalized.y + (child.transform.y - lb.y) * sy,
          },
          size:
            child.type === 'GROUP'
              ? undefined
              : { width: Math.max(1, cb.width * sx), height: Math.max(1, cb.height * sy) },
        });
      }
      return results;
    }
    const t: Partial<Transform> = {
      x: parentOrigin.x - lb.x * Math.abs(node.transform.scaleX),
      y: parentOrigin.y - lb.y * Math.abs(node.transform.scaleY),
    };
    if (flipX || flipY) {
      t.scaleX = scaleX;
      t.scaleY = scaleY;
      // Mirroring around the local origin moves the box; shift so it stays where the pointer is.
      const shift = mat2d.applyVector(mat2d.multiply(parentInv, frame.matrix), {
        x: flipX ? normalized.width : 0,
        y: flipY ? normalized.height : 0,
      });
      t.x = (t.x as number) + shift.x;
      t.y = (t.y as number) + shift.y;
    }
    results.push({
      id,
      transform: t,
      size: { width: normalized.width, height: normalized.height },
    });
    return results;
  }

  // Multi-selection: frame is axis aligned. Scale each node's world bounds within it.
  const sx = normalized.width / Math.max(frame.width, 1e-6);
  const sy = normalized.height / Math.max(frame.height, 1e-6);
  const frameOrigin = mat2d.apply(frame.matrix, { x: 0, y: 0 });
  const newOrigin = mat2d.apply(frame.matrix, { x: normalized.x, y: normalized.y });
  for (const id of ids) {
    const node = graph.requireNode(id);
    const wb = graph.getWorldBounds(id);
    const parentInv = node.parentId
      ? mat2d.invert(graph.getWorldMatrix(node.parentId))
      : mat2d.identity();
    const nwb: Rect = {
      x: newOrigin.x + (wb.x - frameOrigin.x) * sx,
      y: newOrigin.y + (wb.y - frameOrigin.y) * sy,
      width: wb.width * sx,
      height: wb.height * sy,
    };
    if (node.type === 'GROUP' || node.transform.rotation % 360 !== 0) {
      // Keep orientation; move the node so its bounds' origin lands in the right place and scale size.
      const lb = graph.getLocalBounds(id);
      const delta = vec2.sub({ x: nwb.x, y: nwb.y }, { x: wb.x, y: wb.y });
      const dLocal = mat2d.applyVector(parentInv, delta);
      results.push({
        id,
        transform: { x: node.transform.x + dLocal.x, y: node.transform.y + dLocal.y },
        size:
          node.type === 'GROUP'
            ? undefined
            : { width: Math.max(1, lb.width * sx), height: Math.max(1, lb.height * sy) },
      });
    } else {
      const parentOrigin = mat2d.apply(parentInv, { x: nwb.x, y: nwb.y });
      results.push({
        id,
        transform: { x: parentOrigin.x, y: parentOrigin.y },
        size: { width: Math.max(1, nwb.width), height: Math.max(1, nwb.height) },
      });
    }
  }
  return results;
}

/** Rotates nodes around a world pivot by `deltaDeg`, returning new transforms. */
export function rotateNodesAround(
  graph: SceneGraph,
  ids: readonly NodeId[],
  pivotWorld: Vec2,
  deltaDeg: number,
): NodeTransformResult[] {
  const rad = (deltaDeg * Math.PI) / 180;
  const rot = mat2d.compose(
    mat2d.translation(pivotWorld.x, pivotWorld.y),
    mat2d.rotation(rad),
    mat2d.translation(-pivotWorld.x, -pivotWorld.y),
  );
  return ids.map((id) => {
    const node = graph.requireNode(id);
    const parentInv = node.parentId
      ? mat2d.invert(graph.getWorldMatrix(node.parentId))
      : mat2d.identity();
    const world = graph.getWorldMatrix(id);
    const local = mat2d.multiply(parentInv, mat2d.multiply(rot, world));
    const t = mat2d.toTransform(local);
    return {
      id,
      transform: {
        x: t.x,
        y: t.y,
        rotation: normalizeDeg(node.transform.rotation + deltaDeg),
        scaleX: node.transform.scaleX,
        scaleY: node.transform.scaleY,
      },
    };
  });
}

export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return Math.abs(d) < 1e-9 ? 0 : d;
}

/** Flips nodes horizontally/vertically around the selection's world center. */
export function flipNodes(
  graph: SceneGraph,
  ids: readonly NodeId[],
  axis: 'horizontal' | 'vertical',
): NodeTransformResult[] {
  const bounds = R.unionAll(ids.map((id) => graph.getWorldBounds(id)));
  if (!bounds) return [];
  const c = R.center(bounds);
  const flip = mat2d.compose(
    mat2d.translation(c.x, c.y),
    mat2d.scaling(axis === 'horizontal' ? -1 : 1, axis === 'vertical' ? -1 : 1),
    mat2d.translation(-c.x, -c.y),
  );
  return ids.map((id) => {
    const node = graph.requireNode(id);
    const parentInv = node.parentId
      ? mat2d.invert(graph.getWorldMatrix(node.parentId))
      : mat2d.identity();
    const local = mat2d.multiply(parentInv, mat2d.multiply(flip, graph.getWorldMatrix(id)));
    const t = mat2d.toTransform(local);
    return {
      id,
      transform: {
        x: t.x,
        y: t.y,
        rotation: normalizeDeg(t.rotation),
        scaleX: t.scaleX,
        scaleY: t.scaleY,
      },
    };
  });
}
