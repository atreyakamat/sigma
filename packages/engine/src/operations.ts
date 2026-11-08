import type {
  NodeJSON,
  NodePatch,
  NodeProps,
  NodeType,
  SceneNode,
  Style,
  TextStyle,
  Transform,
} from '@sigma/document';
import { createNodeProps } from '@sigma/document';
import type { Rect, Vec2 } from '@sigma/geometry';
import { mat2d, rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { createNodeId } from '@sigma/shared';
import {
  BatchCommand,
  CreateNodeCommand,
  DeleteNodeCommand,
  GroupNodesCommand,
  ReorderNodeCommand,
  ReparentNodeCommand,
  UngroupNodesCommand,
  UpdateNodesCommand,
  UpdateStyleCommand,
} from '@sigma/history';
import { layoutText } from '@sigma/renderer';
import type { Editor } from './editor';
import type { NodeTransformResult } from './transform';
import { flipNodes } from './transform';

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type DistributeMode = 'horizontal' | 'vertical';

/**
 * High-level editing operations used by tools and the UI. Every method goes through the history so
 * it is undoable; nothing here touches the scene graph directly.
 */
export class EditorOperations {
  constructor(private readonly editor: Editor) {}

  private get graph() {
    return this.editor.graph;
  }
  private get history() {
    return this.editor.history;
  }

  /* ----------------------------------------------------------- creation */

  /** Creates a node of `type` under `parentId` (defaults to the current page) and selects it. */
  createNode<T extends NodeType>(
    type: T,
    props: Parameters<typeof createNodeProps<T>>[1] = {},
    parentId: NodeId | null = this.editor.currentPageId,
    index?: number,
    select = true,
  ): NodeId {
    const nodeProps = createNodeProps(type, props);
    const cmd = new CreateNodeCommand(nodeProps as NodeJSON, parentId, index);
    if (!this.history.execute(cmd)) throw new Error('Could not create node');
    if (select) this.editor.selection.set([cmd.nodeId]);
    return cmd.nodeId;
  }

  /**
   * Finds the frame/page that should receive a new node drawn at a world point: the top-most frame
   * under the point, otherwise the current page.
   */
  findContainerAt(world: Vec2, exclude?: ReadonlySet<NodeId>): NodeId {
    const page = this.editor.currentPageId;
    if (!page) throw new Error('No current page');
    const hit = this.editor.hitTester.hitTest(world, { tolerance: 0, exclude });
    let cur: SceneNode | undefined | null = hit;
    while (cur) {
      if (cur.type === 'FRAME') return cur.id;
      cur = cur.parentId ? this.graph.getNode(cur.parentId) : null;
    }
    return page;
  }

  /** Converts a world rect into the parent's local space (axis-aligned parents only). */
  worldRectToParent(parentId: NodeId, r: Rect): Rect {
    const inv = mat2d.invert(this.graph.getWorldMatrix(parentId));
    return R.transformBounds(r, inv);
  }

  /* ----------------------------------------------------------- deletion & duplication */

  deleteNodes(ids: readonly NodeId[]): void {
    const roots = this.topLevelOf(ids);
    if (roots.length === 0) return;
    const cmds = roots.map((id) => new DeleteNodeCommand(id));
    this.editor.selection.remove(roots);
    this.history.execute(
      cmds.length === 1
        ? (cmds[0] as DeleteNodeCommand)
        : new BatchCommand(roots.length === 1 ? 'Delete' : `Delete ${roots.length} layers`, cmds),
    );
  }

  deleteSelection(): void {
    this.deleteNodes(this.editor.selection.ids);
  }

  /** Duplicates nodes in place (offset by `offset`), returns the new ids and selects them. */
  duplicateNodes(ids: readonly NodeId[], offset: Vec2 = { x: 10, y: 10 }): NodeId[] {
    const roots = this.topLevelOf(ids);
    const cmds: CreateNodeCommand[] = [];
    for (const id of roots) {
      const node = this.graph.requireNode(id);
      const json = this.cloneSubtreeJSON(id);
      json.transform = {
        ...json.transform,
        x: json.transform.x + offset.x,
        y: json.transform.y + offset.y,
      };
      cmds.push(new CreateNodeCommand(json, node.parentId, this.graph.getIndexInParent(id) + 1));
    }
    if (cmds.length === 0) return [];
    this.history.execute(
      cmds.length === 1 ? (cmds[0] as CreateNodeCommand) : new BatchCommand('Duplicate', cmds),
    );
    const newIds = cmds.map((c) => c.nodeId);
    this.editor.selection.set(newIds);
    return newIds;
  }

  /** Deep-copies a subtree to JSON with fresh ids. */
  cloneSubtreeJSON(id: NodeId): NodeJSON {
    const json = this.graph.nodeToJSON(id);
    const reid = (n: NodeJSON): NodeJSON => ({
      ...n,
      id: createNodeId(),
      children: n.children?.map(reid),
    });
    return reid(json);
  }

  /** Inserts JSON subtrees (e.g. from the clipboard) under a parent and selects them. */
  insertJSON(
    nodes: NodeJSON[],
    parentId: NodeId | null = this.editor.currentPageId,
    offset?: Vec2,
  ): NodeId[] {
    const cmds = nodes.map((n) => {
      const fresh = (function reid(x: NodeJSON): NodeJSON {
        return { ...x, id: createNodeId(), children: x.children?.map(reid) };
      })(n);
      if (offset)
        fresh.transform = {
          ...fresh.transform,
          x: fresh.transform.x + offset.x,
          y: fresh.transform.y + offset.y,
        };
      return new CreateNodeCommand(fresh, parentId);
    });
    if (cmds.length === 0) return [];
    this.history.execute(
      cmds.length === 1 ? (cmds[0] as CreateNodeCommand) : new BatchCommand('Paste', cmds),
    );
    const ids = cmds.map((c) => c.nodeId);
    this.editor.selection.set(ids);
    return ids;
  }

  /* ----------------------------------------------------------- transforms */

  /** Moves nodes by a delta expressed in world units (converted per parent). Merges into drags. */
  moveNodes(ids: readonly NodeId[], worldDelta: Vec2, mergeKey?: string): void {
    const roots = this.topLevelOf(ids);
    if (roots.length === 0) return;
    const entries: [NodeId, NodePatch][] = roots.map((id) => {
      const node = this.graph.requireNode(id);
      const d = node.parentId
        ? mat2d.applyVector(mat2d.invert(this.graph.getWorldMatrix(node.parentId)), worldDelta)
        : worldDelta;
      return [id, { transform: { x: node.transform.x + d.x, y: node.transform.y + d.y } }];
    });
    this.history.execute(
      new UpdateNodesCommand(
        entries,
        roots.length === 1 ? 'Move' : `Move ${roots.length} layers`,
        undefined,
        mergeKey ?? `move:${roots.join(',')}`,
      ),
    );
  }

  nudgeSelection(dx: number, dy: number): void {
    this.moveNodes(
      this.editor.selection.ids,
      { x: dx, y: dy },
      `nudge:${this.editor.selection.ids.join(',')}`,
    );
  }

  /** Applies computed transform/size results (from resize, rotate, flip). */
  applyTransforms(results: NodeTransformResult[], name: string, mergeKey?: string): void {
    if (results.length === 0) return;
    const entries: [NodeId, NodePatch][] = results.map((r) => [
      r.id,
      r.size ? { transform: r.transform, size: r.size } : { transform: r.transform },
    ]);
    this.history.execute(new UpdateNodesCommand(entries, name, undefined, mergeKey));
  }

  setTransform(id: NodeId, transform: Partial<Transform>, mergeKey?: string): void {
    this.history.execute(UpdateNodesCommand.single(id, { transform }, 'Transform', mergeKey));
  }

  setSize(id: NodeId, size: { width?: number; height?: number }, mergeKey?: string): void {
    const node = this.graph.requireNode(id);
    const next = {
      width: Math.max(0, size.width ?? node.size.width),
      height: Math.max(0, size.height ?? node.size.height),
    };
    const patch: NodePatch = { size: next };
    if (node.type === 'TEXT' && node.autoResize === 'WIDTH_AND_HEIGHT' && size.width !== undefined)
      patch.autoResize = 'HEIGHT';
    this.history.execute(UpdateNodesCommand.single(id, patch, 'Resize', mergeKey));
  }

  flipSelection(axis: 'horizontal' | 'vertical'): void {
    const ids = this.topLevelOf(this.editor.selection.ids);
    this.applyTransforms(
      flipNodes(this.graph, ids, axis),
      axis === 'horizontal' ? 'Flip horizontal' : 'Flip vertical',
    );
  }

  /* ----------------------------------------------------------- alignment */

  align(ids: readonly NodeId[], mode: AlignMode): void {
    const roots = this.topLevelOf(ids);
    if (roots.length === 0) return;
    // With one node, align to its parent frame (or page: no-op).
    let target: Rect | null;
    if (roots.length === 1) {
      const parent = this.graph.getParent(roots[0] as NodeId);
      if (!parent || parent.type === 'PAGE') return;
      target = this.graph.getWorldBounds(parent.id);
    } else {
      target = R.unionAll(roots.map((id) => this.graph.getWorldBounds(id)));
    }
    if (!target) return;
    const entries: [NodeId, NodePatch][] = [];
    for (const id of roots) {
      const wb = this.graph.getWorldBounds(id);
      let dx = 0;
      let dy = 0;
      switch (mode) {
        case 'left':
          dx = target.x - wb.x;
          break;
        case 'hcenter':
          dx = target.x + target.width / 2 - (wb.x + wb.width / 2);
          break;
        case 'right':
          dx = target.x + target.width - (wb.x + wb.width);
          break;
        case 'top':
          dy = target.y - wb.y;
          break;
        case 'vcenter':
          dy = target.y + target.height / 2 - (wb.y + wb.height / 2);
          break;
        case 'bottom':
          dy = target.y + target.height - (wb.y + wb.height);
          break;
      }
      const node = this.graph.requireNode(id);
      const d = node.parentId
        ? mat2d.applyVector(mat2d.invert(this.graph.getWorldMatrix(node.parentId)), {
            x: dx,
            y: dy,
          })
        : { x: dx, y: dy };
      entries.push([id, { transform: { x: node.transform.x + d.x, y: node.transform.y + d.y } }]);
    }
    this.history.execute(new UpdateNodesCommand(entries, `Align ${mode}`));
  }

  distribute(ids: readonly NodeId[], mode: DistributeMode): void {
    const roots = this.topLevelOf(ids);
    if (roots.length < 3) return;
    const items = roots.map((id) => ({ id, wb: this.graph.getWorldBounds(id) }));
    const axis = mode === 'horizontal' ? 'x' : 'y';
    const len = mode === 'horizontal' ? 'width' : 'height';
    items.sort((a, b) => a.wb[axis] - b.wb[axis]);
    const first = items[0] as (typeof items)[number];
    const last = items[items.length - 1] as (typeof items)[number];
    const total = last.wb[axis] + last.wb[len] - first.wb[axis];
    const occupied = items.reduce((s, it) => s + it.wb[len], 0);
    const gap = (total - occupied) / (items.length - 1);
    let cursor = first.wb[axis];
    const entries: [NodeId, NodePatch][] = [];
    for (const it of items) {
      const delta = cursor - it.wb[axis];
      cursor += it.wb[len] + gap;
      if (Math.abs(delta) < 1e-9) continue;
      const node = this.graph.requireNode(it.id);
      const d = mode === 'horizontal' ? { x: delta, y: 0 } : { x: 0, y: delta };
      const dl = node.parentId
        ? mat2d.applyVector(mat2d.invert(this.graph.getWorldMatrix(node.parentId)), d)
        : d;
      entries.push([
        it.id,
        { transform: { x: node.transform.x + dl.x, y: node.transform.y + dl.y } },
      ]);
    }
    if (entries.length) this.history.execute(new UpdateNodesCommand(entries, `Distribute ${mode}`));
  }

  /* ----------------------------------------------------------- hierarchy */

  groupSelection(): NodeId | null {
    const ids = this.topLevelOf(this.editor.selection.ids);
    if (ids.length === 0) return null;
    const cmd = new GroupNodesCommand(ids);
    if (!this.history.execute(cmd)) return null;
    this.editor.selection.set([cmd.groupId]);
    return cmd.groupId;
  }

  ungroupSelection(): void {
    const groups = this.editor.selection.ids.filter(
      (id) => this.graph.getNode(id)?.type === 'GROUP',
    );
    if (groups.length === 0) return;
    const children = groups.flatMap((g) => [...this.graph.getChildIds(g)]);
    const cmds = groups.map((g) => new UngroupNodesCommand(g));
    this.history.execute(
      cmds.length === 1 ? (cmds[0] as UngroupNodesCommand) : new BatchCommand('Ungroup', cmds),
    );
    this.editor.selection.set(children);
  }

  /** Wraps the selection in a new frame sized to its bounds. */
  frameSelection(): NodeId | null {
    const ids = this.topLevelOf(this.editor.selection.ids);
    if (ids.length === 0) return null;
    const groupCmd = new GroupNodesCommand(ids, 'Frame');
    let frameId: NodeId | null = null;
    this.history.transact('Frame selection', () => {
      if (!this.history.execute(groupCmd)) return;
      const group = this.graph.requireNode(groupCmd.groupId);
      // Convert the group into a frame: create frame with the same placement, move children, delete group.
      const frame = createNodeProps('FRAME', {
        name: 'Frame',
        transform: group.transform,
        size: group.size,
      });
      const create = new CreateNodeCommand(
        frame as NodeJSON,
        group.parentId,
        this.graph.getIndexInParent(group.id),
      );
      this.history.execute(create);
      for (const cid of [...group.childIds])
        this.history.execute(new ReparentNodeCommand(cid, create.nodeId));
      this.history.execute(new DeleteNodeCommand(group.id));
      frameId = create.nodeId;
    });
    if (frameId) this.editor.selection.set([frameId]);
    return frameId;
  }

  reparent(id: NodeId, parentId: NodeId, index?: number): boolean {
    return this.history.execute(new ReparentNodeCommand(id, parentId, index));
  }

  reorder(id: NodeId, index: number): boolean {
    return this.history.execute(new ReorderNodeCommand(id, index));
  }

  bringForward(ids: readonly NodeId[]): void {
    this.shiftOrder(ids, 1);
  }
  sendBackward(ids: readonly NodeId[]): void {
    this.shiftOrder(ids, -1);
  }
  bringToFront(ids: readonly NodeId[]): void {
    this.shiftOrder(ids, Number.POSITIVE_INFINITY);
  }
  sendToBack(ids: readonly NodeId[]): void {
    this.shiftOrder(ids, Number.NEGATIVE_INFINITY);
  }

  private shiftOrder(ids: readonly NodeId[], by: number): void {
    const roots = this.topLevelOf(ids);
    const cmds: ReorderNodeCommand[] = [];
    const ordered = [...roots].sort(
      (a, b) => this.graph.getIndexInParent(a) - this.graph.getIndexInParent(b),
    );
    if (by > 0) ordered.reverse();
    for (const id of ordered) {
      const node = this.graph.requireNode(id);
      const count = node.parentId
        ? this.graph.getChildIds(node.parentId).length
        : this.graph.pageIds.length;
      const cur = this.graph.getIndexInParent(id);
      const target = Number.isFinite(by) ? cur + by : by > 0 ? count - 1 : 0;
      const clamped = Math.max(0, Math.min(count - 1, target));
      if (clamped !== cur) cmds.push(new ReorderNodeCommand(id, clamped));
    }
    if (cmds.length === 0) return;
    this.history.execute(
      cmds.length === 1 ? (cmds[0] as ReorderNodeCommand) : new BatchCommand('Reorder', cmds),
    );
  }

  /* ----------------------------------------------------------- properties */

  setProps(ids: readonly NodeId[], patch: NodePatch, name = 'Update', mergeKey?: string): void {
    if (ids.length === 0) return;
    this.history.execute(new UpdateNodesCommand([...ids], patch, name, mergeKey));
  }

  rename(id: NodeId, name: string): void {
    this.setProps([id], { name }, 'Rename');
  }

  setVisible(ids: readonly NodeId[], visible: boolean): void {
    this.setProps(ids, { visible }, visible ? 'Show' : 'Hide');
  }

  setLocked(ids: readonly NodeId[], locked: boolean): void {
    this.setProps(ids, { locked }, locked ? 'Lock' : 'Unlock');
    if (locked) this.editor.selection.remove(ids);
  }

  setStyle(
    ids: readonly NodeId[],
    style: Partial<Style>,
    name = 'Change style',
    mergeKey?: string,
  ): void {
    if (ids.length === 0) return;
    this.history.execute(new UpdateStyleCommand([...ids], style, name, mergeKey));
  }

  /** Sets text content and re-measures auto-sized text nodes. */
  setText(id: NodeId, characters: string, mergeKey?: string): void {
    const node = this.graph.requireNode(id);
    if (node.type !== 'TEXT') return;
    const patch: NodePatch = { characters };
    Object.assign(patch, this.measuredSize({ ...node, characters }));
    this.history.execute(UpdateNodesCommand.single(id, patch, 'Edit text', mergeKey));
  }

  setTextStyle(ids: readonly NodeId[], textStyle: Partial<TextStyle>, mergeKey?: string): void {
    this.editor.defaults.textStyle = { ...this.editor.defaults.textStyle, ...textStyle };
    const entries: [NodeId, NodePatch][] = [];
    for (const id of ids) {
      const node = this.graph.requireNode(id);
      if (node.type !== 'TEXT') continue;
      const merged = { ...node, textStyle: { ...node.textStyle, ...textStyle } };
      entries.push([id, { textStyle, ...this.measuredSize(merged) }]);
    }
    if (entries.length)
      this.history.execute(
        new UpdateNodesCommand(entries, 'Change text style', undefined, mergeKey),
      );
  }

  private measuredSize(node: Extract<NodeProps, { type: 'TEXT' }>): NodePatch {
    if (node.autoResize === 'NONE') return {};
    const layout = layoutText(node);
    if (node.autoResize === 'WIDTH_AND_HEIGHT') {
      return {
        size: {
          width: Math.max(1, Math.ceil(layout.width)),
          height: Math.max(1, Math.ceil(layout.height)),
        },
      };
    }
    return { size: { width: node.size.width, height: Math.max(1, Math.ceil(layout.height)) } };
  }

  /* ----------------------------------------------------------- pages */

  addPage(name?: string): NodeId {
    const page = createNodeProps('PAGE', { name: name ?? `Page ${this.graph.pageIds.length + 1}` });
    const cmd = new CreateNodeCommand(page as NodeJSON, null);
    this.history.execute(cmd);
    this.editor.setPage(cmd.nodeId);
    return cmd.nodeId;
  }

  deletePage(id: NodeId): boolean {
    if (this.graph.pageIds.length <= 1) return false;
    const idx = this.graph.pageIds.indexOf(id);
    const ok = this.history.execute(new DeleteNodeCommand(id));
    if (ok && this.editor.currentPageId === id) {
      const next = this.graph.pageIds[Math.max(0, idx - 1)] as NodeId;
      this.editor.setPage(next);
    }
    return ok;
  }

  /* ----------------------------------------------------------- helpers */

  /** Filters out ids whose ancestor is also in the set, so subtree operations run once. */
  topLevelOf(ids: readonly NodeId[]): NodeId[] {
    const guard = this.editor.nodeGuard;
    const allowed = (id: NodeId): boolean => {
      if (!guard) return true;
      const node = this.graph.getNode(id);
      if (!node) return false;
      return guard(node) && this.graph.getAncestors(id).every(guard);
    };
    const set = new Set(ids.filter((id) => this.graph.hasNode(id) && allowed(id)));
    return [...set].filter((id) => !this.graph.getAncestors(id).some((a) => set.has(a.id)));
  }
}
