import type { NodeId } from '@sigma/shared';
import type { SceneNode } from './nodes';
import type { Layout } from './schema';
import type { SceneGraph } from './scene-graph';

export interface LayoutPatch {
  transform?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
}

export function layoutOf(node: SceneNode): Layout | null {
  const l = (node as { layout?: Layout }).layout;
  return l && l.mode !== 'NONE' ? l : null;
}

const clamp = (node: SceneNode, axis: 'width' | 'height', v: number): number => {
  const min = node.minSize[axis];
  const max = node.maxSize[axis];
  if (min !== null && v < min) v = min;
  if (max !== null && v > max) v = max;
  return v;
};

/**
 * Computes child positions and (for hug sizing) the frame size for one auto-layout frame, using
 * the sizes currently in `overrides` or the graph. Returns patches keyed by node id.
 */
export function solveFrameLayout(
  graph: SceneGraph,
  frameId: NodeId,
  overrides: Map<NodeId, LayoutPatch>,
): Map<NodeId, LayoutPatch> {
  const out = new Map<NodeId, LayoutPatch>();
  const frame = graph.requireNode(frameId);
  const layout = layoutOf(frame);
  if (!layout) return out;
  const horizontal = layout.mode === 'HORIZONTAL';
  const children = graph.getChildren(frameId).filter((c) => c.visible);
  const sizeOf = (n: SceneNode) => ({
    width: overrides.get(n.id)?.size?.width ?? n.size.width,
    height: overrides.get(n.id)?.size?.height ?? n.size.height,
  });
  const frameSize = {
    width: overrides.get(frameId)?.size?.width ?? frame.size.width,
    height: overrides.get(frameId)?.size?.height ?? frame.size.height,
  };
  const pad = layout.padding;
  const primary = horizontal ? 'width' : 'height';
  const counter = horizontal ? 'height' : 'width';
  const padPrimary = horizontal ? pad.left + pad.right : pad.top + pad.bottom;
  const padCounter = horizontal ? pad.top + pad.bottom : pad.left + pad.right;

  const sizes = children.map(sizeOf);
  const fixedPrimary = children.reduce(
    (sum, c, i) => sum + (c.layoutChild.primary === 'FILL' ? 0 : sizes[i]![primary]),
    0,
  );
  const gaps = Math.max(0, children.length - 1) * layout.gap;
  const contentCounter = children.reduce(
    (m, c, i) => Math.max(m, c.layoutChild.counter === 'FILL' ? 0 : sizes[i]![counter]),
    0,
  );

  // Frame size
  let framePrimary =
    layout.primarySizing === 'HUG' ? fixedPrimary + gaps + padPrimary : frameSize[primary];
  let frameCounter =
    layout.counterSizing === 'HUG' ? contentCounter + padCounter : frameSize[counter];
  framePrimary = clamp(frame, primary, framePrimary);
  frameCounter = clamp(frame, counter, frameCounter);
  const fillCount = children.filter((c) => c.layoutChild.primary === 'FILL').length;
  const freePrimary = Math.max(0, framePrimary - padPrimary - gaps - fixedPrimary);
  const fillPrimary = fillCount ? freePrimary / fillCount : 0;

  // Primary-axis start offset from justify
  const used = fixedPrimary + gaps + fillCount * fillPrimary;
  const slack = framePrimary - padPrimary - used;
  let cursor = horizontal ? pad.left : pad.top;
  let extraGap = 0;
  if (fillCount === 0) {
    if (layout.justifyContent === 'CENTER') cursor += slack / 2;
    else if (layout.justifyContent === 'END') cursor += slack;
    else if (layout.justifyContent === 'SPACE_BETWEEN' && children.length > 1)
      extraGap = slack / (children.length - 1);
  }

  children.forEach((child, i) => {
    const size = { ...sizes[i]! };
    if (child.layoutChild.primary === 'FILL') size[primary] = fillPrimary;
    if (child.layoutChild.counter === 'FILL')
      size[counter] = Math.max(0, frameCounter - padCounter);
    const counterSpace = frameCounter - padCounter - size[counter];
    let counterPos = horizontal ? pad.top : pad.left;
    if (layout.alignItems === 'CENTER') counterPos += counterSpace / 2;
    else if (layout.alignItems === 'END') counterPos += counterSpace;
    const x = horizontal ? cursor : counterPos;
    const y = horizontal ? counterPos : cursor;
    const patch: LayoutPatch = {};
    if (Math.abs(child.transform.x - x) > 1e-6 || Math.abs(child.transform.y - y) > 1e-6)
      patch.transform = { x, y };
    const cur = sizeOf(child);
    if (
      child.type !== 'GROUP' &&
      (Math.abs(cur.width - size.width) > 1e-6 || Math.abs(cur.height - size.height) > 1e-6)
    )
      patch.size = { width: size.width, height: size.height };
    if (patch.transform || patch.size) out.set(child.id, patch);
    cursor += size[primary] + layout.gap + extraGap;
  });
  if (
    Math.abs(frameSize[primary] - framePrimary) > 1e-6 ||
    Math.abs(frameSize[counter] - frameCounter) > 1e-6
  ) {
    out.set(frameId, {
      size: horizontal
        ? { width: framePrimary, height: frameCounter }
        : { width: frameCounter, height: framePrimary },
    });
  }
  return out;
}

/**
 * Resolves every auto-layout frame that could be affected by changes to `ids`: the frames
 * themselves, their ancestors, and nested layout frames below them, innermost first.
 */
export function computeLayoutPatches(
  graph: SceneGraph,
  ids: readonly NodeId[],
): Map<NodeId, LayoutPatch> {
  const roots = new Set<NodeId>();
  for (const id of ids) {
    if (!graph.hasNode(id)) continue;
    let top: NodeId | null = null;
    for (const anc of [graph.requireNode(id), ...graph.getAncestors(id)])
      if (layoutOf(anc)) top = anc.id;
    if (top) roots.add(top);
  }
  const patches = new Map<NodeId, LayoutPatch>();
  const visit = (id: NodeId): void => {
    for (const c of graph.getChildIds(id)) visit(c);
    if (layoutOf(graph.requireNode(id))) {
      for (const [k, v] of solveFrameLayout(graph, id, patches)) {
        const prev = patches.get(k) ?? {};
        patches.set(k, {
          transform: { ...prev.transform, ...v.transform },
          size: { ...prev.size, ...v.size },
        });
      }
    }
  };
  for (const root of roots) visit(root);
  for (const [k, v] of patches) {
    if (v.transform && Object.keys(v.transform).length === 0) delete v.transform;
    if (v.size && Object.keys(v.size).length === 0) delete v.size;
    if (!v.transform && !v.size) patches.delete(k);
  }
  return patches;
}

/** Patches that keep children in place according to their constraints when a frame resizes. */
export function applyConstraints(
  graph: SceneGraph,
  frameId: NodeId,
  from: { width: number; height: number },
  to: { width: number; height: number },
): Map<NodeId, LayoutPatch> {
  const out = new Map<NodeId, LayoutPatch>();
  const frame = graph.requireNode(frameId);
  if (layoutOf(frame)) return out;
  const dx = to.width - from.width;
  const dy = to.height - from.height;
  const sx = from.width ? to.width / from.width : 1;
  const sy = from.height ? to.height / from.height : 1;
  for (const child of graph.getChildren(frameId)) {
    const c = child.constraints;
    const patch: LayoutPatch = { transform: {}, size: {} };
    switch (c.horizontal) {
      case 'RIGHT':
        patch.transform!.x = child.transform.x + dx;
        break;
      case 'CENTER':
        patch.transform!.x = child.transform.x + dx / 2;
        break;
      case 'STRETCH':
        patch.size!.width = Math.max(0, child.size.width + dx);
        break;
      case 'SCALE':
        patch.transform!.x = child.transform.x * sx;
        patch.size!.width = child.size.width * sx;
        break;
    }
    switch (c.vertical) {
      case 'BOTTOM':
        patch.transform!.y = child.transform.y + dy;
        break;
      case 'CENTER':
        patch.transform!.y = child.transform.y + dy / 2;
        break;
      case 'STRETCH':
        patch.size!.height = Math.max(0, child.size.height + dy);
        break;
      case 'SCALE':
        patch.transform!.y = child.transform.y * sy;
        patch.size!.height = child.size.height * sy;
        break;
    }
    if (Object.keys(patch.transform!).length === 0) delete patch.transform;
    if (Object.keys(patch.size!).length === 0 || child.type === 'GROUP') delete patch.size;
    if (patch.transform || patch.size) out.set(child.id, patch);
  }
  return out;
}
