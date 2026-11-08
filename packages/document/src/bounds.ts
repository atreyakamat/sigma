import type { Mat2d, Rect } from '@sigma/geometry';
import { rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import type { SceneNode } from './nodes';

/**
 * Local bounds of a node. Shapes are their `size`. Groups have no size of their own: their bounds are
 * the union of their children's bounds in the group's coordinate space.
 */
export function localBounds(
  node: SceneNode,
  childBounds: (id: NodeId) => Rect,
  childMatrix: (id: NodeId) => Mat2d,
): Rect {
  if (node.type === 'GROUP') {
    const rects = node.childIds.map((cid) => R.transformBounds(childBounds(cid), childMatrix(cid)));
    return R.unionAll(rects) ?? { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x: 0, y: 0, width: node.size.width, height: node.size.height };
}
