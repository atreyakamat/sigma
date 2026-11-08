import type { NodePatch, SceneGraph, Size, Style, Transform } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import type { Command } from '../command';
import { BaseCommand } from '../command';

type Snapshot = Record<string, unknown>;

/**
 * Applies a patch to one or more nodes. Undo restores the previous value of every top-level key
 * that the patch touched. All specialised property commands build on this one.
 */
export class UpdateNodesCommand extends BaseCommand {
  readonly name: string;
  override readonly mergeKey?: string;
  private before = new Map<NodeId, Snapshot>();
  private patches: Map<NodeId, NodePatch>;

  constructor(
    patches: Iterable<[NodeId, NodePatch]> | NodeId[],
    patchOrName?: NodePatch | string,
    name?: string,
    mergeKey?: string,
  ) {
    super();
    if (Array.isArray(patches) && typeof patches[0] === 'string') {
      const patch = patchOrName as NodePatch;
      this.patches = new Map((patches as NodeId[]).map((id) => [id, patch]));
      this.name = name ?? 'Update';
    } else {
      this.patches = new Map(patches as Iterable<[NodeId, NodePatch]>);
      this.name = (patchOrName as string | undefined) ?? name ?? 'Update';
    }
    this.mergeKey = mergeKey;
  }

  static single(
    id: NodeId,
    patch: NodePatch,
    name = 'Update',
    mergeKey?: string,
  ): UpdateNodesCommand {
    return new UpdateNodesCommand([id], patch, name, mergeKey);
  }

  override validate(graph: SceneGraph): boolean {
    for (const id of this.patches.keys()) if (!graph.hasNode(id)) return false;
    return this.patches.size > 0;
  }

  execute(graph: SceneGraph): void {
    graph.batch(() => {
      for (const [id, patch] of this.patches) {
        const node = graph.requireNode(id) as unknown as Snapshot;
        if (!this.before.has(id)) {
          const snap: Snapshot = {};
          for (const key of Object.keys(patch)) snap[key] = node[key];
          this.before.set(id, snap);
        }
        graph.updateNode(id, patch);
      }
    });
  }

  undo(graph: SceneGraph): void {
    graph.batch(() => {
      for (const [id, snap] of this.before) graph.updateNode(id, snap as NodePatch);
    });
  }

  affectedNodeIds(): readonly NodeId[] {
    return [...this.patches.keys()];
  }

  override merge(next: Command): boolean {
    if (!(next instanceof UpdateNodesCommand) || next.mergeKey !== this.mergeKey || !this.mergeKey)
      return false;
    for (const [id, patch] of next.patches) {
      const mine = this.patches.get(id);
      this.patches.set(id, mine ? mergePatch(mine, patch) : patch);
      const snap = next.before.get(id);
      if (snap && !this.before.has(id)) this.before.set(id, snap);
      else if (snap && this.before.has(id)) {
        const existing = this.before.get(id) as Snapshot;
        for (const key of Object.keys(snap)) if (!(key in existing)) existing[key] = snap[key];
      }
    }
    return true;
  }
}

function mergePatch(a: NodePatch, b: NodePatch): NodePatch {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] =
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev) &&
      v &&
      typeof v === 'object' &&
      !Array.isArray(v)
        ? { ...(prev as object), ...(v as object) }
        : v;
  }
  return out as NodePatch;
}

/** Translates nodes by a delta in their parents' coordinate space. Consecutive moves merge. */
export class MoveNodesCommand extends UpdateNodesCommand {
  constructor(
    graph: SceneGraph,
    ids: NodeId[],
    delta: { x: number; y: number },
    mergeKey = `move:${ids.join(',')}`,
  ) {
    super(
      ids.map((id) => {
        const t = graph.requireNode(id).transform;
        return [id, { transform: { x: t.x + delta.x, y: t.y + delta.y } }] as [NodeId, NodePatch];
      }),
      ids.length === 1 ? 'Move' : `Move ${ids.length} layers`,
      undefined,
      mergeKey,
    );
  }
}

/** Sets a node's transform + size (the result of a resize interaction). */
export class ResizeNodeCommand extends UpdateNodesCommand {
  constructor(
    id: NodeId,
    transform: Partial<Transform>,
    size: Partial<Size>,
    mergeKey = `resize:${id}`,
  ) {
    super([id], { transform, size }, 'Resize', mergeKey);
  }
}

/** Sets a node's rotation (degrees) and optional compensating position. */
export class RotateNodeCommand extends UpdateNodesCommand {
  constructor(id: NodeId, transform: Partial<Transform>, mergeKey = `rotate:${id}`) {
    super([id], { transform }, 'Rotate', mergeKey);
  }
}

/** Patches style properties on one or more nodes. */
export class UpdateStyleCommand extends UpdateNodesCommand {
  constructor(ids: NodeId[], style: Partial<Style>, name = 'Change style', mergeKey?: string) {
    super(ids, { style }, name, mergeKey);
  }
}

/** Sets node transforms absolutely (used by alignment/distribution/flip). */
export class SetTransformsCommand extends UpdateNodesCommand {
  constructor(entries: Iterable<[NodeId, Partial<Transform>]>, name = 'Transform') {
    super(
      [...entries].map(([id, transform]) => [id, { transform }] as [NodeId, NodePatch]),
      name,
    );
  }
}
