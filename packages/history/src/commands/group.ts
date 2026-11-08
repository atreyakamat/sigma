import type { SceneGraph, Subtree } from '@sigma/document';
import { createNodeProps } from '@sigma/document';
import type { Rect } from '@sigma/geometry';
import { mat2d, rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { createNodeId } from '@sigma/shared';
import { BaseCommand } from '../command';

interface Placement {
  id: NodeId;
  parentId: NodeId;
  index: number;
  transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
}

function orderByDocument(graph: SceneGraph, ids: readonly NodeId[]): NodeId[] {
  const rank = new Map<NodeId, number>();
  let i = 0;
  const page = graph.getPageOf(ids[0] as NodeId);
  if (!page) return [...ids];
  graph.traverse(page.id, (n) => {
    rank.set(n.id, i++);
  });
  return [...ids].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

/**
 * Wraps nodes in a new GROUP positioned at the union of their bounds. World positions of the
 * children are preserved. The group is created in the parent of the top-most selected node
 * (Figma semantics); nodes under other parents are reparented into it.
 */
export class GroupNodesCommand extends BaseCommand {
  readonly name = 'Group';
  readonly groupId: NodeId;
  private placements: Placement[] = [];
  private groupParentId: NodeId | null = null;
  private groupIndex = 0;

  constructor(
    private readonly ids: NodeId[],
    private readonly groupName = 'Group',
  ) {
    super();
    this.groupId = createNodeId();
  }

  override validate(graph: SceneGraph): boolean {
    if (this.ids.length === 0) return false;
    for (const id of this.ids) {
      const n = graph.getNode(id);
      if (!n || n.type === 'PAGE' || !n.parentId) return false;
      for (const other of this.ids) if (other !== id && graph.isAncestorOf(id, other)) return false;
    }
    return true;
  }

  execute(graph: SceneGraph): void {
    graph.batch(() => {
      const ordered = orderByDocument(graph, this.ids);
      // Host parent = parent of the last node in document order (the top-most in z).
      const top = graph.requireNode(ordered[ordered.length - 1] as NodeId);
      const hostParentId = top.parentId as NodeId;
      const hostWorld = graph.getWorldMatrix(hostParentId);
      const hostInv = mat2d.invert(hostWorld);

      this.placements = ordered.map((id) => {
        const n = graph.requireNode(id);
        return {
          id,
          parentId: n.parentId as NodeId,
          index: graph.getIndexInParent(id),
          transform: { ...n.transform },
        };
      });

      const bounds = R.unionAll(
        ordered.map((id) => R.transformBounds(graph.getWorldBounds(id), hostInv)),
      ) as Rect;
      this.groupParentId = hostParentId;
      this.groupIndex = graph.getIndexInParent(top.id);

      graph.insertNode(
        createNodeProps('GROUP', {
          id: this.groupId,
          name: this.groupName,
          transform: { x: bounds.x, y: bounds.y, rotation: 0, scaleX: 1, scaleY: 1 },
          size: { width: bounds.width, height: bounds.height },
        }),
        hostParentId,
        this.groupIndex,
      );
      const groupInv = mat2d.invert(graph.getWorldMatrix(this.groupId));

      for (const id of ordered) {
        const world = graph.getWorldMatrix(id);
        const local = mat2d.toTransform(mat2d.multiply(groupInv, world));
        graph.reparentNode(id, this.groupId);
        graph.updateNode(id, { transform: local });
      }
    });
  }

  undo(graph: SceneGraph): void {
    graph.batch(() => {
      // Restore from lowest index upward so indices stay valid.
      const restore = [...this.placements].sort((a, b) => a.index - b.index);
      for (const p of restore) {
        graph.reparentNode(p.id, p.parentId, p.index);
        graph.updateNode(p.id, { transform: p.transform });
      }
      graph.removeNode(this.groupId);
    });
  }

  affectedNodeIds(): readonly NodeId[] {
    return [this.groupId, ...this.ids];
  }
}

/** Dissolves a GROUP, moving its children into the group's parent while preserving world positions. */
export class UngroupNodesCommand extends BaseCommand {
  readonly name = 'Ungroup';
  private subtree: Subtree | null = null;
  private childIds: NodeId[] = [];
  private childTransforms = new Map<NodeId, Placement['transform']>();

  constructor(private readonly groupId: NodeId) {
    super();
  }

  override validate(graph: SceneGraph): boolean {
    const g = graph.getNode(this.groupId);
    return !!g && g.type === 'GROUP' && g.parentId !== null;
  }

  execute(graph: SceneGraph): void {
    graph.batch(() => {
      const group = graph.requireNode(this.groupId);
      const parentId = group.parentId as NodeId;
      const index = graph.getIndexInParent(this.groupId);
      const parentInv = mat2d.invert(graph.getWorldMatrix(parentId));
      this.childIds = [...group.childIds];
      this.childTransforms.clear();
      this.childIds.forEach((cid, i) => {
        const child = graph.requireNode(cid);
        this.childTransforms.set(cid, { ...child.transform });
        const local = mat2d.toTransform(mat2d.multiply(parentInv, graph.getWorldMatrix(cid)));
        graph.reparentNode(cid, parentId, index + i);
        graph.updateNode(cid, { transform: local });
      });
      this.subtree = graph.removeNode(this.groupId);
    });
  }

  undo(graph: SceneGraph): void {
    if (!this.subtree) throw new Error('UngroupNodesCommand was not executed');
    graph.batch(() => {
      const sub = this.subtree as Subtree;
      graph.insertSubtree({
        ...sub,
        nodes: [{ ...(sub.nodes[0] as Subtree['nodes'][number]), childIds: [] }],
      });
      for (const cid of this.childIds) {
        graph.reparentNode(cid, this.groupId);
        graph.updateNode(cid, {
          transform: this.childTransforms.get(cid) as Placement['transform'],
        });
      }
    });
  }

  affectedNodeIds(): readonly NodeId[] {
    return [this.groupId, ...this.childIds];
  }
}
