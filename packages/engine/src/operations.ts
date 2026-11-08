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
import {
  applyConstraints,
  computeLayoutPatches,
  createNodeProps,
  instanceChildId,
  layoutOf,
  nodeLocalPath,
  resolveInstanceTarget,
} from '@sigma/document';
import type {
  Interaction,
  InteractionInput,
  Layout,
  LayoutChild,
  LayoutPatch,
} from '@sigma/document';
import { InteractionSchema } from '@sigma/document';
import type { Rect, Vec2 } from '@sigma/geometry';
import type { BooleanOperation, PathCommand } from '@sigma/geometry';
import { booleanPaths, normalizePath, pathBounds, transformPath } from '@sigma/geometry';
import { mat2d, rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { createNodeId } from '@sigma/shared';
void instanceChildId;
void (0 as unknown as LayoutPatch);
import {
  BatchCommand,
  ChangeNodeTypeCommand,
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
import type { EditorTool } from './types';
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
    this.relayout([cmd.nodeId]);
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

  /* ----------------------------------------------------------- prototyping */

  addInteraction(id: NodeId, interaction: InteractionInput): void {
    const node = this.graph.requireNode(id);
    const full = InteractionSchema.parse(interaction);
    this.executeUpdate([[id, { interactions: [...node.interactions, full] }]], 'Add interaction');
  }

  updateInteraction(id: NodeId, index: number, patch: Partial<InteractionInput>): void {
    const node = this.graph.requireNode(id);
    const next = node.interactions.map((it, i) =>
      i === index ? InteractionSchema.parse({ ...it, ...patch }) : it,
    );
    this.executeUpdate([[id, { interactions: next }]], 'Edit interaction');
  }

  removeInteraction(id: NodeId, index: number): void {
    const node = this.graph.requireNode(id);
    this.executeUpdate(
      [[id, { interactions: node.interactions.filter((_, i) => i !== index) }]],
      'Remove interaction',
    );
  }

  /** All navigation/overlay connections on the current page with existing targets. */
  prototypeConnections(): {
    sourceId: NodeId;
    targetId: NodeId;
    trigger: Interaction['trigger'];
    type: string;
  }[] {
    const out: {
      sourceId: NodeId;
      targetId: NodeId;
      trigger: Interaction['trigger'];
      type: string;
    }[] = [];
    const page = this.editor.currentPageId;
    if (!page) return out;
    this.graph.traverse(page, (n) => {
      for (const it of n.interactions) {
        const target = 'targetId' in it.action ? (it.action.targetId as NodeId) : null;
        if (target && this.graph.hasNode(target))
          out.push({ sourceId: n.id, targetId: target, trigger: it.trigger, type: it.action.type });
      }
    });
    return out;
  }

  setFlowStart(frameId: NodeId | null): void {
    const page = this.editor.currentPageId;
    if (!page) return;
    const meta = { ...this.graph.requireNode(page).metadata } as Record<string, unknown>;
    if (frameId) meta.flowStartId = frameId;
    else delete meta.flowStartId;
    this.executeUpdate([[page, { metadata: meta }]], 'Set flow start');
  }

  flowStart(): NodeId | null {
    const page = this.editor.currentPageId;
    const id = page
      ? ((this.graph.requireNode(page).metadata as { flowStartId?: string }).flowStartId ?? null)
      : null;
    return id && this.graph.hasNode(id as NodeId) ? (id as NodeId) : null;
  }

  /* ----------------------------------------------------------- auto layout */

  private layoutSeq = 0;

  /** Re-solves auto-layout frames affected by `ids` and glues the result to the last history entry. */
  private relayout(ids: readonly NodeId[], mergeKey?: string): void {
    const patches = computeLayoutPatches(this.graph, ids);
    if (patches.size === 0) return;
    const entries: [NodeId, NodePatch][] = [...patches].map(([id, p]) => [
      id,
      {
        ...(p.transform ? { transform: p.transform } : {}),
        ...(p.size ? { size: p.size } : {}),
      } as NodePatch,
    ]);
    this.history.attach(
      new UpdateNodesCommand(
        entries,
        'Auto layout',
        undefined,
        mergeKey ?? `layout:${++this.layoutSeq}`,
      ),
    );
  }

  setLayout(frameId: NodeId, layout: Partial<Layout>): void {
    const node = this.graph.requireNode(frameId);
    if (!layoutOf(node) && !('layout' in node)) return;
    const current = (node as { layout: Layout }).layout;
    const next: Layout = {
      ...current,
      ...layout,
      padding: { ...current.padding, ...(layout.padding ?? {}) },
    };
    this.executeUpdate(
      [[frameId, { layout: next }]],
      next.mode === 'NONE' ? 'Remove auto layout' : 'Auto layout',
    );
    this.relayout([frameId]);
  }

  setChildLayout(id: NodeId, child: Partial<LayoutChild>): void {
    const node = this.graph.requireNode(id);
    this.executeUpdate([[id, { layoutChild: { ...node.layoutChild, ...child } }]], 'Child sizing');
    this.relayout([id]);
  }

  /** Resizes a frame and moves/sizes its children according to their constraints. */
  resizeFrame(frameId: NodeId, size: { width?: number; height?: number }, mergeKey?: string): void {
    const frame = this.graph.requireNode(frameId);
    const to = { width: size.width ?? frame.size.width, height: size.height ?? frame.size.height };
    const constraintPatches = applyConstraints(this.graph, frameId, frame.size, to);
    const entries: [NodeId, NodePatch][] = [[frameId, { size: to }]];
    for (const [id, p] of constraintPatches)
      entries.push([
        id,
        { ...(p.transform ? { transform: p.transform } : {}), ...(p.size ? { size: p.size } : {}) },
      ]);
    this.executeUpdate(entries, 'Resize', mergeKey);
    this.relayout([frameId, ...constraintPatches.keys()], mergeKey);
  }

  /* ----------------------------------------------------------- instance overrides */

  /**
   * Rewrites patches that target projected (instance) nodes into overrides on their instance so
   * that the change is persisted and survives master updates. Real nodes pass through unchanged.
   */
  private routeEntries(entries: [NodeId, NodePatch][]): [NodeId, NodePatch][] {
    const out = new Map<NodeId, NodePatch>();
    const overrides = new Map<NodeId, Record<string, Record<string, unknown>>>();
    for (const [id, patch] of entries) {
      const target = resolveInstanceTarget(this.graph, id);
      if (!target) {
        out.set(id, { ...(out.get(id) ?? {}), ...patch });
        continue;
      }
      const inst = this.graph.getNode(target.instanceId);
      if (!inst || inst.type !== 'INSTANCE') continue;
      const current = overrides.get(target.instanceId) ?? {
        ...(inst.overrides as Record<string, Record<string, unknown>>),
      };
      const prev = current[target.mainNodeId] ?? {};
      const merged: Record<string, unknown> = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        const p = merged[k];
        merged[k] =
          p &&
          typeof p === 'object' &&
          !Array.isArray(p) &&
          v &&
          typeof v === 'object' &&
          !Array.isArray(v)
            ? { ...(p as object), ...(v as object) }
            : v;
      }
      current[target.mainNodeId] = merged;
      overrides.set(target.instanceId, current);
    }
    for (const [instanceId, ov] of overrides)
      out.set(instanceId, { ...(out.get(instanceId) ?? {}), overrides: ov });
    return [...out.entries()];
  }

  private executeUpdate(entries: [NodeId, NodePatch][], name: string, mergeKey?: string): boolean {
    const routed = this.routeEntries(entries);
    if (routed.length === 0) return false;
    return this.history.execute(new UpdateNodesCommand(routed, name, undefined, mergeKey));
  }

  /* ----------------------------------------------------------- deletion & duplication */

  deleteNodes(ids: readonly NodeId[]): void {
    const derived = ids.filter((id) => this.graph.isDerived(id));
    if (derived.length) this.setVisible(derived, false);
    const roots = this.topLevelOf(ids.filter((id) => !this.graph.isDerived(id)));
    if (roots.length === 0) return;
    const cmds = roots.map((id) => new DeleteNodeCommand(id));
    const parents = roots
      .map((id) => this.graph.getNode(id)?.parentId)
      .filter((p): p is NodeId => !!p);
    this.editor.selection.remove(roots);
    this.history.execute(
      cmds.length === 1
        ? (cmds[0] as DeleteNodeCommand)
        : new BatchCommand(roots.length === 1 ? 'Delete' : `Delete ${roots.length} layers`, cmds),
    );
    this.relayout(parents);
  }

  deleteSelection(): void {
    this.deleteNodes(this.editor.selection.ids);
  }

  /** Duplicates nodes in place (offset by `offset`), returns the new ids and selects them. */
  duplicateNodes(ids: readonly NodeId[], offset: Vec2 = { x: 10, y: 10 }): NodeId[] {
    const roots = this.topLevelOf(ids.filter((id) => !this.graph.isDerived(id)));
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
    this.relayout(newIds);
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
    this.relayout(ids);
    this.editor.selection.set(ids);
    return ids;
  }

  /* ----------------------------------------------------------- transforms */

  /** Moves nodes by a delta expressed in world units (converted per parent). Merges into drags. */
  moveNodes(ids: readonly NodeId[], worldDelta: Vec2, mergeKey?: string): void {
    const roots = this.topLevelOf(ids);
    if (roots.length === 0) return;
    // Inside an auto-layout parent a drag reorders the child instead of moving it freely.
    const inLayout = roots.filter((id) => {
      const parent = this.graph.getParent(id);
      return parent && layoutOf(parent);
    });
    if (inLayout.length === roots.length && roots.length === 1) {
      const id = roots[0] as NodeId;
      const parent = this.graph.getParent(id) as SceneNode;
      const horizontal = layoutOf(parent)!.mode === 'HORIZONTAL';
      const node = this.graph.requireNode(id);
      const d = mat2d.applyVector(mat2d.invert(this.graph.getWorldMatrix(parent.id)), worldDelta);
      const center = horizontal
        ? node.transform.x + node.size.width / 2 + d.x
        : node.transform.y + node.size.height / 2 + d.y;
      const siblings = this.graph.getChildren(parent.id).filter((c) => c.id !== id);
      let index = siblings.length;
      for (let i = 0; i < siblings.length; i++) {
        const s = siblings[i] as SceneNode;
        const mid = horizontal
          ? s.transform.x + s.size.width / 2
          : s.transform.y + s.size.height / 2;
        if (center < mid) {
          index = i;
          break;
        }
      }
      if (index !== this.graph.getIndexInParent(id)) {
        this.history.execute(new ReorderNodeCommand(id, index));
        this.relayout([id]);
      }
      return;
    }
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
    // Children of resized frames follow their constraints.
    for (const r of results) {
      if (!r.size) continue;
      const node = this.graph.requireNode(r.id);
      if (!('layout' in node)) continue;
      for (const [id, p] of applyConstraints(this.graph, r.id, node.size, {
        width: r.size.width,
        height: r.size.height,
      })) {
        entries.push([
          id,
          {
            ...(p.transform ? { transform: p.transform } : {}),
            ...(p.size ? { size: p.size } : {}),
          },
        ]);
      }
    }
    this.executeUpdate(entries, name, mergeKey);
    this.relayout(
      results.map((r) => r.id),
      mergeKey,
    );
  }

  setTransform(id: NodeId, transform: Partial<Transform>, mergeKey?: string): void {
    this.executeUpdate([[id, { transform }]], 'Transform', mergeKey);
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
    this.executeUpdate([[id, patch]], 'Resize', mergeKey);
    this.relayout([id], mergeKey);
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
    this.executeUpdate(entries, `Align ${mode}`);
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
    if (entries.length) this.executeUpdate(entries, `Distribute ${mode}`);
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
    if (this.graph.isDerived(id) || this.graph.isDerived(parentId)) return false;
    const prevParent = this.graph.getNode(id)?.parentId;
    const ok = this.history.execute(new ReparentNodeCommand(id, parentId, index));
    if (ok) this.relayout(prevParent ? [id, prevParent] : [id]);
    return ok;
  }

  reorder(id: NodeId, index: number): boolean {
    if (this.graph.isDerived(id)) return false;
    const ok = this.history.execute(new ReorderNodeCommand(id, index));
    if (ok) this.relayout([id]);
    return ok;
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
    this.relayout(roots);
  }

  /* ----------------------------------------------------------- properties */

  setProps(ids: readonly NodeId[], patch: NodePatch, name = 'Update', mergeKey?: string): void {
    if (ids.length === 0) return;
    this.executeUpdate(
      ids.map((id) => [id, patch] as [NodeId, NodePatch]),
      name,
      mergeKey,
    );
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
    this.executeUpdate([[id, patch]], 'Edit text', mergeKey);
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

  /** Props every node type shares; used when converting between frame-like types. */
  private sharedProps(node: SceneNode): Record<string, unknown> {
    const keys = [
      'id',
      'name',
      'visible',
      'locked',
      'transform',
      'size',
      'style',
      'constraints',
      'layoutChild',
      'minSize',
      'maxSize',
      'interactions',
      'metadata',
      'clipsContent',
      'layout',
    ];
    const src = node as unknown as Record<string, unknown>;
    return Object.fromEntries(keys.filter((k) => k in src).map((k) => [k, src[k]]));
  }

  /* ----------------------------------------------------------- components */

  /** A selected frame becomes a component in place; other selections are wrapped first. */
  createComponentFromSelection(): NodeId | null {
    const ids = this.topLevelOf(this.editor.selection.ids).filter(
      (id) => !this.graph.isDerived(id),
    );
    if (ids.length === 0) return null;
    let id: NodeId | null = null;
    this.history.transact('Create component', () => {
      const frameId =
        ids.length === 1 && this.graph.getNode(ids[0] as NodeId)?.type === 'FRAME'
          ? (ids[0] as NodeId)
          : this.frameSelection();
      if (!frameId) return;
      const frame = this.graph.requireNode(frameId);
      if (frame.type !== 'FRAME') return;
      const next = createNodeProps('COMPONENT', {
        ...(this.sharedProps(frame) as Parameters<typeof createNodeProps<'COMPONENT'>>[1]),
        id: frameId,
        variantProps: {},
      });
      this.history.execute(new ChangeNodeTypeCommand(frameId, next, 'Create component'));
      id = frameId;
    });
    if (id) this.editor.selection.set([id]);
    return id;
  }

  /** Creates an instance of a component at a world position (projection fills in the children). */
  createInstance(
    componentId: NodeId,
    parentId: NodeId | null = this.editor.currentPageId,
    world?: Vec2,
  ): NodeId {
    const master = this.graph.requireNode(componentId);
    if (master.type !== 'COMPONENT') throw new Error('Not a component');
    const pid = parentId ?? (this.editor.currentPageId as NodeId);
    const pos = world
      ? this.worldRectToParent(pid, { x: world.x, y: world.y, width: 0, height: 0 })
      : { x: 0, y: 0 };
    const props = createNodeProps('INSTANCE', {
      name: master.name,
      componentId,
      transform: { x: pos.x, y: pos.y, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { ...master.size },
      style: master.style,
      clipsContent: master.clipsContent,
    });
    const cmd = new CreateNodeCommand(props as NodeJSON, pid);
    this.history.execute(cmd);
    this.editor.selection.set([cmd.nodeId]);
    return cmd.nodeId;
  }

  /** Converts an instance into a plain frame with real copies of its projected children. */
  detachInstance(instanceId: NodeId): NodeId {
    const inst = this.graph.requireNode(instanceId);
    if (inst.type !== 'INSTANCE') throw new Error('Not an instance');
    const json = this.graph.nodeToJSONIncludingDerived(instanceId);
    const reid = (n: NodeJSON): NodeJSON => {
      const { metadata, ...rest } = n;
      const meta = { ...(metadata as Record<string, unknown>) };
      delete meta.mainNodeId;
      return { ...rest, id: createNodeId(), metadata: meta, children: n.children?.map(reid) };
    };
    const {
      componentId: _c,
      overrides: _o,
      library: _l,
      ...frameProps
    } = json as unknown as Record<string, unknown>;
    const detached = reid({
      ...(frameProps as object),
      type: 'FRAME',
      overflow: 'NONE',
    } as NodeJSON);
    let newId: NodeId | null = null;
    this.history.transact('Detach instance', () => {
      const create = new CreateNodeCommand(
        detached,
        inst.parentId,
        this.graph.getIndexInParent(instanceId) + 1,
      );
      this.history.execute(create);
      this.history.execute(new DeleteNodeCommand(instanceId));
      newId = create.nodeId;
    });
    if (newId) this.editor.selection.set([newId]);
    return newId as unknown as NodeId;
  }

  resetOverrides(instanceId: NodeId): void {
    this.executeUpdate([[instanceId, { overrides: {} }]], 'Reset overrides');
  }

  /** Points an instance at another component (typically a sibling variant). Overrides are kept. */
  swapInstance(instanceId: NodeId, componentId: NodeId): void {
    if (this.graph.getNode(componentId)?.type !== 'COMPONENT') return;
    this.executeUpdate([[instanceId, { componentId }]], 'Swap component');
  }

  /** Components available as variants for an instance: siblings of its master inside a component set. */
  variantsOf(instanceId: NodeId): Extract<SceneNode, { type: 'COMPONENT' }>[] {
    const inst = this.graph.getNode(instanceId);
    if (!inst || inst.type !== 'INSTANCE') return [];
    const master = this.graph.getNode(inst.componentId as NodeId);
    const set = master?.parentId ? this.graph.getNode(master.parentId) : undefined;
    if (!set || set.type !== 'COMPONENT_SET')
      return master && master.type === 'COMPONENT' ? [master] : [];
    return this.graph
      .getChildren(set.id)
      .filter((n): n is Extract<SceneNode, { type: 'COMPONENT' }> => n.type === 'COMPONENT');
  }

  /** Wraps the selected components in a component set whose axes are the union of their variant props. */
  createComponentSet(): NodeId | null {
    const ids = this.topLevelOf(this.editor.selection.ids).filter(
      (id) => this.graph.getNode(id)?.type === 'COMPONENT',
    );
    if (ids.length === 0) return null;
    const axes = [
      ...new Set(
        ids.flatMap((id) =>
          Object.keys(
            (this.graph.requireNode(id) as Extract<SceneNode, { type: 'COMPONENT' }>).variantProps,
          ),
        ),
      ),
    ];
    let setId: NodeId | null = null;
    this.history.transact('Create component set', () => {
      const group = new GroupNodesCommand(ids, 'Component set');
      if (!this.history.execute(group)) return;
      const g = this.graph.requireNode(group.groupId);
      const next = createNodeProps('COMPONENT_SET', {
        ...(this.sharedProps(g) as Parameters<typeof createNodeProps<'COMPONENT_SET'>>[1]),
        id: group.groupId,
        variantAxes: axes,
        style: {
          strokes: [
            {
              paint: { type: 'SOLID', color: { r: 0.545, g: 0.361, b: 0.965, a: 1 } },
              width: 1,
              align: 'OUTSIDE',
              dashPattern: [4, 4],
            },
          ],
        },
      });
      this.history.execute(new ChangeNodeTypeCommand(group.groupId, next, 'Create component set'));
      setId = group.groupId;
    });
    if (setId) this.editor.selection.set([setId]);
    return setId;
  }

  /** Instances of a component anywhere in the document. */
  instancesOf(componentId: NodeId): NodeId[] {
    const out: NodeId[] = [];
    for (const page of this.graph.pageIds)
      this.graph.traverse(page, (n) => {
        if (n.type === 'INSTANCE' && n.componentId === componentId && !this.graph.isDerived(n.id))
          out.push(n.id);
      });
    return out;
  }

  /* ----------------------------------------------------------- vectors */

  /** Replaces a vector's path. The path is re-normalized so the node's origin stays at its bounds. */
  setVectorPath(id: NodeId, path: PathCommand[], mergeKey?: string): void {
    const node = this.graph.requireNode(id);
    if (node.type !== 'VECTOR') return;
    const { commands, offset } = normalizePath(path);
    const b = pathBounds(commands);
    const local = mat2d.applyVector(mat2d.fromTransform({ ...node.transform, x: 0, y: 0 }), offset);
    this.history.execute(
      UpdateNodesCommand.single(
        id,
        {
          path: commands,
          transform: { x: node.transform.x + local.x, y: node.transform.y + local.y },
          size: { width: b.width, height: b.height },
        },
        'Edit path',
        mergeKey,
      ),
    );
  }

  /** Switches to the vector edit tool for a VECTOR node (converting other shapes first). */
  editVector(id: NodeId): void {
    const node = this.graph.requireNode(id);
    let target = id;
    if (node.type !== 'VECTOR') {
      if (
        node.type === 'GROUP' ||
        node.type === 'FRAME' ||
        node.type === 'TEXT' ||
        node.type === 'IMAGE' ||
        node.type === 'PAGE'
      )
        return;
      target = this.flattenToVector([id]) ?? id;
    }
    this.editor.selection.set([target]);
    const tool = this.editor.tools.get('vector-edit') as
      (EditorTool & { edit?: (id: NodeId) => void }) | undefined;
    if (!tool) return;
    this.editor.tools.activate('vector-edit');
    tool.edit?.(target);
  }

  /** Converts shapes into a single VECTOR by flattening their outlines (no boolean), used by edit/outline. */
  flattenToVector(ids: readonly NodeId[]): NodeId | null {
    return this.combineIntoVector(ids, (paths) => paths.flat(), 'Flatten');
  }

  /** Boolean operation on the selection; the bottom-most node is the base for subtract. */
  booleanSelection(op: BooleanOperation): NodeId | null {
    const ids = this.topLevelOf(this.editor.selection.ids);
    if (ids.length < 2) return null;
    const label = {
      union: 'Union',
      subtract: 'Subtract',
      intersect: 'Intersect',
      exclude: 'Exclude',
    }[op];
    return this.combineIntoVector(ids, (paths) => booleanPaths(op, paths), label);
  }

  private combineIntoVector(
    ids: readonly NodeId[],
    combine: (paths: PathCommand[][]) => PathCommand[],
    name: string,
  ): NodeId | null {
    const ordered = [...ids].sort(
      (a, b) => this.editor.hitTester.getZOrder(a) - this.editor.hitTester.getZOrder(b),
    );
    if (ordered.length === 0) return null;
    const bottom = this.graph.requireNode(ordered[0] as NodeId);
    const parentId = bottom.parentId as NodeId;
    const parentInv = mat2d.invert(this.graph.getWorldMatrix(parentId));
    const paths = ordered.map((id) =>
      transformPath(nodeLocalPath(this.graph.requireNode(id)), (p) =>
        mat2d.apply(mat2d.multiply(parentInv, this.graph.getWorldMatrix(id)), p),
      ),
    );
    const combined = combine(paths);
    if (combined.length === 0) return null;
    const { commands, offset } = normalizePath(combined);
    const b = pathBounds(commands);
    const style = bottom.type === 'GROUP' ? undefined : bottom.style;
    let newId: NodeId | null = null;
    this.history.transact(name, () => {
      const props = createNodeProps('VECTOR', {
        name: bottom.name,
        transform: { x: offset.x, y: offset.y, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: b.width, height: b.height },
        path: commands,
        ...(style ? { style } : {}),
      });
      const create = new CreateNodeCommand(
        props as NodeJSON,
        parentId,
        this.graph.getIndexInParent(ordered[ordered.length - 1] as NodeId) + 1,
      );
      this.history.execute(create);
      for (const id of ordered) this.history.execute(new DeleteNodeCommand(id));
      newId = create.nodeId;
    });
    if (newId) this.editor.selection.set([newId]);
    return newId;
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
