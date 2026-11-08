import type { NodeJSON, NodeProps, SceneGraph, Subtree } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import { BaseCommand } from '../command';

/** Creates a node (optionally with a nested subtree) under a parent. */
export class CreateNodeCommand extends BaseCommand {
  readonly name: string;
  readonly nodeId: NodeId;

  constructor(
    private readonly node: NodeJSON,
    private readonly parentId: NodeId | null,
    private readonly index?: number,
  ) {
    super();
    this.nodeId = node.id as NodeId;
    this.name = `Create ${node.name || node.type.toLowerCase()}`;
  }

  override validate(graph: SceneGraph): boolean {
    if (graph.hasNode(this.nodeId)) return false;
    return this.parentId === null || graph.hasNode(this.parentId);
  }

  execute(graph: SceneGraph): void {
    graph.insertSubtreeJSON(this.node, this.parentId, this.index);
  }

  undo(graph: SceneGraph): void {
    graph.removeNode(this.nodeId);
  }

  affectedNodeIds(): readonly NodeId[] {
    return [this.nodeId];
  }
}

/** Deletes a node and its subtree; undo restores it at the same position. */
export class DeleteNodeCommand extends BaseCommand {
  readonly name: string;
  private subtree: Subtree | null = null;

  constructor(private readonly nodeId: NodeId) {
    super();
    this.name = 'Delete';
  }

  override validate(graph: SceneGraph): boolean {
    const node = graph.getNode(this.nodeId);
    if (!node) return false;
    return !(node.type === 'PAGE' && graph.pageIds.length === 1);
  }

  execute(graph: SceneGraph): void {
    this.subtree = graph.removeNode(this.nodeId);
  }

  undo(graph: SceneGraph): void {
    if (!this.subtree) throw new Error('DeleteNodeCommand was not executed');
    graph.insertSubtree(this.subtree);
  }

  affectedNodeIds(): readonly NodeId[] {
    return this.subtree ? this.subtree.nodes.map((n) => n.id) : [this.nodeId];
  }
}

/** Moves a node to another parent and/or index. */
export class ReparentNodeCommand extends BaseCommand {
  readonly name = 'Move layer';
  private prevParentId: NodeId | null = null;
  private prevIndex = 0;

  constructor(
    private readonly nodeId: NodeId,
    private readonly newParentId: NodeId,
    private readonly newIndex?: number,
  ) {
    super();
  }

  override validate(graph: SceneGraph): boolean {
    const node = graph.getNode(this.nodeId);
    const parent = graph.getNode(this.newParentId);
    if (!node || !parent || node.type === 'PAGE') return false;
    if (this.nodeId === this.newParentId || graph.isAncestorOf(this.nodeId, this.newParentId))
      return false;
    return true;
  }

  execute(graph: SceneGraph): void {
    const node = graph.requireNode(this.nodeId);
    this.prevParentId = node.parentId;
    this.prevIndex = graph.getIndexInParent(this.nodeId);
    graph.reparentNode(this.nodeId, this.newParentId, this.newIndex);
  }

  undo(graph: SceneGraph): void {
    if (this.prevParentId === null) throw new Error('ReparentNodeCommand was not executed');
    graph.reparentNode(this.nodeId, this.prevParentId, this.prevIndex);
  }

  affectedNodeIds(): readonly NodeId[] {
    return [this.nodeId];
  }
}

/** Changes a node's z-order within its parent. */
export class ReorderNodeCommand extends BaseCommand {
  readonly name = 'Reorder layer';
  private prevIndex = 0;

  constructor(
    private readonly nodeId: NodeId,
    private readonly index: number,
  ) {
    super();
  }

  override validate(graph: SceneGraph): boolean {
    return graph.hasNode(this.nodeId);
  }

  execute(graph: SceneGraph): void {
    this.prevIndex = graph.getIndexInParent(this.nodeId);
    graph.reorderNode(this.nodeId, this.index);
  }

  undo(graph: SceneGraph): void {
    graph.reorderNode(this.nodeId, this.prevIndex);
  }

  affectedNodeIds(): readonly NodeId[] {
    return [this.nodeId];
  }
}

/** Replaces a node's props wholesale (used by paste-over and collaboration tooling). */
export class ReplaceNodeCommand extends BaseCommand {
  readonly name = 'Replace';
  private prev: NodeProps | null = null;

  constructor(private readonly props: NodeProps) {
    super();
  }

  override validate(graph: SceneGraph): boolean {
    const node = graph.getNode(this.props.id as NodeId);
    return !!node && node.type === this.props.type;
  }

  execute(graph: SceneGraph): void {
    const { parentId: _p, childIds: _c, ...prev } = graph.requireNode(this.props.id as NodeId);
    this.prev = prev as NodeProps;
    graph.replaceNode(this.props);
  }

  undo(graph: SceneGraph): void {
    if (!this.prev) throw new Error('ReplaceNodeCommand was not executed');
    graph.replaceNode(this.prev);
  }

  affectedNodeIds(): readonly NodeId[] {
    return [this.props.id as NodeId];
  }
}
