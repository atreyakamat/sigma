import type { SceneGraph } from '@sigma/document';
import type { Rect } from '@sigma/geometry';
import { rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { Emitter } from '@sigma/shared';

export interface SelectionEvents extends Record<string, unknown> {
  change: { ids: readonly NodeId[] };
  hover: { id: NodeId | null };
}

/** Local (non-shared) selection state. Ordered by insertion so "last selected" is meaningful. */
export class SelectionManager {
  readonly events = new Emitter<SelectionEvents>();
  private _ids: NodeId[] = [];
  private _hover: NodeId | null = null;

  constructor(private readonly graph: SceneGraph) {}

  get ids(): readonly NodeId[] {
    return this._ids;
  }

  get size(): number {
    return this._ids.length;
  }

  get isEmpty(): boolean {
    return this._ids.length === 0;
  }

  get first(): NodeId | null {
    return this._ids[0] ?? null;
  }

  get hover(): NodeId | null {
    return this._hover;
  }

  has(id: NodeId): boolean {
    return this._ids.includes(id);
  }

  set(ids: Iterable<NodeId>): void {
    const next = [...new Set(ids)].filter((id) => this.graph.hasNode(id));
    if (next.length === this._ids.length && next.every((id, i) => id === this._ids[i])) return;
    this._ids = next;
    this.events.emit('change', { ids: this._ids });
  }

  add(ids: Iterable<NodeId>): void {
    this.set([...this._ids, ...ids]);
  }

  remove(ids: Iterable<NodeId>): void {
    const drop = new Set(ids);
    this.set(this._ids.filter((id) => !drop.has(id)));
  }

  toggle(id: NodeId): void {
    if (this.has(id)) this.remove([id]);
    else this.add([id]);
  }

  clear(): void {
    this.set([]);
  }

  setHover(id: NodeId | null): void {
    if (id === this._hover) return;
    this._hover = id;
    this.events.emit('hover', { id });
  }

  /** Drops ids that no longer exist (called after document changes). */
  prune(): void {
    if (this._ids.some((id) => !this.graph.hasNode(id))) this.set(this._ids);
    if (this._hover && !this.graph.hasNode(this._hover)) this.setHover(null);
  }

  /** World-space axis-aligned bounds of the whole selection. */
  getBounds(): Rect | null {
    return R.unionAll(this._ids.map((id) => this.graph.getWorldBounds(id)));
  }

  /** True when some selected node is `id` or one of its descendants. */
  intersectsSubtree(id: NodeId): boolean {
    return this._ids.some((s) => s === id || this.graph.isAncestorOf(id, s));
  }
}
