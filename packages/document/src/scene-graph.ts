import type { Mat2d, Rect } from '@sigma/geometry';
import { mat2d, rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { Emitter, createDocumentId } from '@sigma/shared';
import type { SceneNode, SceneNodeOf } from './nodes';
import { createNodeProps, isContainer } from './nodes';
import type { DocumentJSON, NodeJSON, NodeProps, NodeType } from './schema';
import { SCHEMA_VERSION, parseDocumentJSON } from './schema';
import { migrateDocument } from './migrations';
import { localBounds } from './bounds';

export interface SceneChange {
  /** Monotonic revision after this change. */
  revision: number;
  added: NodeId[];
  removed: NodeId[];
  updated: NodeId[];
  /** True when hierarchy (parent/children/order/pages) changed. */
  structural: boolean;
}

export interface SceneGraphEvents extends Record<string, unknown> {
  change: SceneChange;
}

/** Shallow patch of a node's props. Nested objects (transform, size, style, textStyle, image) are merged one level deep. */
export type NodePatch = {
  [K in keyof NodeProps]?: NodeProps[K] extends object ? Partial<NodeProps[K]> : NodeProps[K];
} & Record<string, unknown>;

const MERGED_KEYS = new Set([
  'transform',
  'size',
  'style',
  'textStyle',
  'image',
  'constraints',
  'metadata',
]);

/** A detached subtree, used by delete/undo and clipboard operations. */
export interface Subtree {
  root: NodeId;
  parentId: NodeId | null;
  index: number;
  /** Nodes in pre-order (root first), with their childIds preserved. */
  nodes: SceneNode[];
}

/**
 * Hierarchical document model stored as a flat map. Nodes are immutable value objects; every
 * mutation replaces the node and bumps `revision`. This shape maps 1:1 onto a Yjs `Y.Map` of nodes,
 * which is what the collaboration layer will bind to (ADR-0004).
 */
export class SceneGraph {
  readonly events = new Emitter<SceneGraphEvents>();
  readonly id: string;
  name: string;
  readonly schemaVersion = SCHEMA_VERSION;
  metadata: Record<string, unknown>;

  private nodes = new Map<NodeId, SceneNode>();
  private _pageIds: NodeId[] = [];
  private _revision = 0;
  private worldMatrixCache = new Map<NodeId, Mat2d>();
  private batchDepth = 0;
  private pending: SceneChange | null = null;

  constructor(options: { id?: string; name?: string; metadata?: Record<string, unknown> } = {}) {
    this.id = options.id ?? createDocumentId();
    this.name = options.name ?? 'Untitled';
    this.metadata = options.metadata ?? {};
  }

  /* ------------------------------------------------------------------ construction */

  static fromJSON(input: unknown): SceneGraph {
    const doc = parseDocumentJSON(migrateDocument(input));
    const graph = new SceneGraph({ id: doc.id, name: doc.name, metadata: doc.metadata });
    graph.batch(() => {
      for (const page of doc.pages) graph.insertSubtreeJSON(page, null);
    });
    graph._revision = 0;
    return graph;
  }

  /** Creates a document with one empty page. */
  static createEmpty(name = 'Untitled'): SceneGraph {
    const graph = new SceneGraph({ name });
    graph.insertNode(createNodeProps('PAGE', { name: 'Page 1' }), null);
    graph._revision = 0;
    return graph;
  }

  toJSON(): DocumentJSON {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      metadata: this.metadata,
      pages: this._pageIds.map((id) => this.nodeToJSON(id)),
    };
  }

  nodeToJSON(id: NodeId): NodeJSON {
    const node = this.requireNode(id);
    const { parentId: _p, childIds, ...props } = node;
    const json: NodeJSON = { ...(props as NodeProps) };
    if (isContainer(node)) json.children = childIds.map((c) => this.nodeToJSON(c));
    return json;
  }

  /* ------------------------------------------------------------------ queries */

  get revision(): number {
    return this._revision;
  }

  get pageIds(): readonly NodeId[] {
    return this._pageIds;
  }

  get pages(): SceneNodeOf<'PAGE'>[] {
    return this._pageIds.map((id) => this.requireNode(id) as SceneNodeOf<'PAGE'>);
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  hasNode(id: NodeId): boolean {
    return this.nodes.has(id);
  }

  getNode(id: NodeId): SceneNode | undefined {
    return this.nodes.get(id);
  }

  requireNode(id: NodeId): SceneNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node "${id}" does not exist`);
    return node;
  }

  getNodeOfType<T extends NodeType>(id: NodeId, type: T): SceneNodeOf<T> | undefined {
    const node = this.nodes.get(id);
    return node && node.type === type ? (node as SceneNodeOf<T>) : undefined;
  }

  getParent(id: NodeId): SceneNode | undefined {
    const pid = this.requireNode(id).parentId;
    return pid ? this.nodes.get(pid) : undefined;
  }

  getChildIds(id: NodeId): readonly NodeId[] {
    return this.requireNode(id).childIds;
  }

  getChildren(id: NodeId): SceneNode[] {
    return this.requireNode(id).childIds.map((c) => this.requireNode(c));
  }

  getIndexInParent(id: NodeId): number {
    const node = this.requireNode(id);
    if (!node.parentId) return this._pageIds.indexOf(id);
    return this.requireNode(node.parentId).childIds.indexOf(id);
  }

  /** Ancestors from the direct parent up to the page. */
  getAncestors(id: NodeId): SceneNode[] {
    const out: SceneNode[] = [];
    let cur = this.requireNode(id).parentId;
    while (cur) {
      const n = this.requireNode(cur);
      out.push(n);
      cur = n.parentId;
    }
    return out;
  }

  isAncestorOf(ancestorId: NodeId, id: NodeId): boolean {
    let cur = this.nodes.get(id)?.parentId ?? null;
    while (cur) {
      if (cur === ancestorId) return true;
      cur = this.requireNode(cur).parentId;
    }
    return false;
  }

  /** The page that contains `id` (or the node itself when it is a page). */
  getPageOf(id: NodeId): SceneNodeOf<'PAGE'> | undefined {
    let cur: SceneNode | undefined = this.nodes.get(id);
    while (cur && cur.parentId) cur = this.nodes.get(cur.parentId);
    return cur?.type === 'PAGE' ? (cur as SceneNodeOf<'PAGE'>) : undefined;
  }

  /** Pre-order traversal of `id`'s descendants (excluding `id`). Return false from the visitor to skip a subtree. */
  traverse(
    id: NodeId,
    visitor: (node: SceneNode, depth: number) => boolean | void,
    depth = 0,
  ): void {
    for (const childId of this.requireNode(id).childIds) {
      const child = this.requireNode(childId);
      if (visitor(child, depth) === false) continue;
      if (child.childIds.length) this.traverse(childId, visitor, depth + 1);
    }
  }

  getDescendantIds(id: NodeId): NodeId[] {
    const out: NodeId[] = [];
    this.traverse(id, (n) => {
      out.push(n.id);
    });
    return out;
  }

  /** Depth of a node (pages are depth 0). */
  getDepth(id: NodeId): number {
    return this.getAncestors(id).length;
  }

  /* ------------------------------------------------------------------ geometry */

  getLocalMatrix(id: NodeId): Mat2d {
    return mat2d.fromTransform(this.requireNode(id).transform);
  }

  getWorldMatrix(id: NodeId): Mat2d {
    const cached = this.worldMatrixCache.get(id);
    if (cached) return cached;
    const node = this.requireNode(id);
    const local = mat2d.fromTransform(node.transform);
    const world = node.parentId ? mat2d.multiply(this.getWorldMatrix(node.parentId), local) : local;
    this.worldMatrixCache.set(id, world);
    return world;
  }

  /** Bounds in the node's own coordinate space (origin at top-left, unrotated). */
  getLocalBounds(id: NodeId): Rect {
    return localBounds(
      this.requireNode(id),
      (cid) => this.getLocalBounds(cid),
      (cid) => this.getLocalMatrix(cid),
    );
  }

  /** Axis-aligned bounds in world (page) coordinates, including rotation. */
  getWorldBounds(id: NodeId): Rect {
    return R.transformBounds(this.getLocalBounds(id), this.getWorldMatrix(id));
  }

  /** Axis-aligned bounds in the parent's coordinate space. */
  getParentBounds(id: NodeId): Rect {
    return R.transformBounds(this.getLocalBounds(id), this.getLocalMatrix(id));
  }

  /* ------------------------------------------------------------------ mutation */

  /** Runs several mutations and emits a single coalesced change event. */
  batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.pending) {
        const change = this.pending;
        this.pending = null;
        this.events.emit('change', change);
      }
    }
  }

  /**
   * Inserts a node. `parentId === null` inserts a page. Containers are inserted empty; use
   * `insertSubtree` to insert a tree. Returns the node id.
   */
  insertNode(props: NodeProps, parentId: NodeId | null, index?: number): NodeId {
    const id = props.id as NodeId;
    if (this.nodes.has(id)) throw new Error(`Node "${id}" already exists`);
    if (parentId === null) {
      if (props.type !== 'PAGE') throw new Error('Only pages can be inserted at the document root');
    } else {
      const parent = this.requireNode(parentId);
      if (!isContainer(parent))
        throw new Error(`Node "${parentId}" (${parent.type}) cannot have children`);
      if (props.type === 'PAGE') throw new Error('Pages cannot be nested');
    }
    const node = { ...props, id, parentId, childIds: [] } as SceneNode;
    this.nodes.set(id, node);
    this.linkChild(parentId, id, index);
    this.commit({ added: [id], structural: true });
    return id;
  }

  /** Inserts a serialized subtree (validated) under `parentId`. Ids must not already exist. */
  insertSubtreeJSON(json: NodeJSON, parentId: NodeId | null, index?: number): NodeId {
    return this.batch(() => {
      const { children, ...props } = json;
      const id = this.insertNode(props as NodeProps, parentId, index);
      children?.forEach((child) => this.insertSubtreeJSON(child, id));
      return id;
    });
  }

  /** Re-attaches a subtree previously removed with `removeNode`. */
  insertSubtree(
    subtree: Subtree,
    parentId: NodeId | null = subtree.parentId,
    index: number = subtree.index,
  ): NodeId {
    return this.batch(() => {
      const root = subtree.nodes[0];
      if (!root) throw new Error('Empty subtree');
      const byId = new Map(subtree.nodes.map((n) => [n.id, n]));
      const insert = (node: SceneNode, pid: NodeId | null, idx?: number): void => {
        const { parentId: _p, childIds, ...props } = node;
        this.insertNode(props as NodeProps, pid, idx);
        for (const cid of childIds) {
          const child = byId.get(cid);
          if (!child) throw new Error(`Subtree is missing node "${cid}"`);
          insert(child, node.id);
        }
      };
      insert(root, parentId, index);
      return root.id;
    });
  }

  /** Removes a node and its descendants. Returns the detached subtree so the operation can be reversed. */
  removeNode(id: NodeId): Subtree {
    const node = this.requireNode(id);
    if (node.parentId === null && this._pageIds.length === 1) {
      throw new Error('A document must keep at least one page');
    }
    const index = this.getIndexInParent(id);
    const nodes: SceneNode[] = [node];
    this.traverse(id, (n) => {
      nodes.push(n);
    });
    this.unlinkChild(node.parentId, id);
    for (const n of nodes) this.nodes.delete(n.id);
    this.commit({ removed: nodes.map((n) => n.id), structural: true });
    return { root: id, parentId: node.parentId, index, nodes };
  }

  /** Applies a patch to a node. Hierarchy fields (`id`, `type`, `parentId`, `childIds`) cannot be patched. */
  updateNode(id: NodeId, patch: NodePatch): SceneNode {
    const prev = this.requireNode(id);
    const next: Record<string, unknown> = { ...prev };
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id' || key === 'type' || key === 'parentId' || key === 'childIds') {
        throw new Error(`Cannot patch "${key}"`);
      }
      if (value === undefined) continue;
      const prevValue = (prev as Record<string, unknown>)[key];
      const nextValue =
        MERGED_KEYS.has(key) && isPlainObject(value) && isPlainObject(prevValue)
          ? { ...(prevValue as object), ...(value as object) }
          : value;
      if (!shallowEqual(prevValue, nextValue)) {
        next[key] = nextValue;
        changed = true;
      }
    }
    if (!changed) return prev;
    const node = next as SceneNode;
    this.nodes.set(id, node);
    if ('transform' in patch || 'size' in patch) this.invalidateWorld(id);
    this.commit({ updated: [id], structural: false });
    return node;
  }

  /** Replaces a node's props wholesale (same id/type). Used by collaboration and undo. */
  replaceNode(props: NodeProps): SceneNode {
    const prev = this.requireNode(props.id as NodeId);
    if (prev.type !== props.type) throw new Error('Cannot change a node type');
    const node = { ...props, parentId: prev.parentId, childIds: prev.childIds } as SceneNode;
    this.nodes.set(node.id, node);
    this.invalidateWorld(node.id);
    this.commit({ updated: [node.id], structural: false });
    return node;
  }

  /** Moves a node to a new parent (and/or index). Validates against cycles and container rules. */
  reparentNode(id: NodeId, newParentId: NodeId, index?: number): void {
    const node = this.requireNode(id);
    if (node.type === 'PAGE') throw new Error('Pages cannot be reparented');
    const parent = this.requireNode(newParentId);
    if (!isContainer(parent)) throw new Error(`Node "${newParentId}" cannot have children`);
    if (id === newParentId || this.isAncestorOf(id, newParentId)) {
      throw new Error('Cannot reparent a node into its own subtree');
    }
    if (node.parentId === newParentId) {
      this.reorderNode(id, index ?? parent.childIds.length - 1);
      return;
    }
    this.unlinkChild(node.parentId, id);
    this.nodes.set(id, { ...node, parentId: newParentId });
    this.linkChild(newParentId, id, index);
    this.invalidateWorld(id);
    this.commit({ updated: [id], structural: true });
  }

  /** Changes a node's index among its siblings (or a page's index among pages). */
  reorderNode(id: NodeId, index: number): void {
    const node = this.requireNode(id);
    const siblings = node.parentId
      ? [...this.requireNode(node.parentId).childIds]
      : [...this._pageIds];
    const from = siblings.indexOf(id);
    const to = Math.max(0, Math.min(index, siblings.length - 1));
    if (from === to) return;
    siblings.splice(from, 1);
    siblings.splice(to, 0, id);
    this.setChildIds(node.parentId, siblings);
    this.commit({ updated: [id], structural: true });
  }

  setName(name: string): void {
    if (this.name === name) return;
    this.name = name;
    this.commit({ structural: false });
  }

  /* ------------------------------------------------------------------ internals */

  private linkChild(parentId: NodeId | null, id: NodeId, index?: number): void {
    const siblings = parentId ? [...this.requireNode(parentId).childIds] : [...this._pageIds];
    const at =
      index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    siblings.splice(at, 0, id);
    this.setChildIds(parentId, siblings);
  }

  private unlinkChild(parentId: NodeId | null, id: NodeId): void {
    const siblings = parentId ? [...this.requireNode(parentId).childIds] : [...this._pageIds];
    const i = siblings.indexOf(id);
    if (i >= 0) siblings.splice(i, 1);
    this.setChildIds(parentId, siblings);
  }

  private setChildIds(parentId: NodeId | null, childIds: NodeId[]): void {
    if (parentId === null) {
      this._pageIds = childIds;
    } else {
      const parent = this.requireNode(parentId);
      this.nodes.set(parentId, { ...parent, childIds });
    }
  }

  private invalidateWorld(id: NodeId): void {
    // Transforms are inherited, so a change invalidates the whole subtree. Clearing the full cache is
    // O(1) and the lazy recompute touches only what the next frame actually renders.
    if (this.worldMatrixCache.size === 0) return;
    if (this.nodes.get(id)?.childIds.length === 0) this.worldMatrixCache.delete(id);
    else this.worldMatrixCache.clear();
  }

  private commit(partial: Partial<SceneChange>): void {
    this._revision++;
    const change: SceneChange = {
      revision: this._revision,
      added: partial.added ?? [],
      removed: partial.removed ?? [],
      updated: partial.updated ?? [],
      structural: partial.structural ?? false,
    };
    if (change.structural) this.worldMatrixCache.clear();
    if (this.batchDepth > 0) {
      if (!this.pending) {
        this.pending = change;
      } else {
        this.pending.revision = change.revision;
        this.pending.added.push(...change.added);
        this.pending.removed.push(...change.removed);
        this.pending.updated.push(...change.updated);
        this.pending.structural ||= change.structural;
      }
      return;
    }
    this.events.emit('change', change);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}
