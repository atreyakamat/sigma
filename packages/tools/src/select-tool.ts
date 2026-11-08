import type { SceneNode } from '@sigma/document';
import type {
  EditorKeyEvent,
  EditorPointerEvent,
  HandleId,
  OverlayContext,
  SelectionFrame,
  SnapTarget,
} from '@sigma/engine';
import {
  applyFrameRectToNodes,
  drawMarquee,
  frameCorners,
  frameRotationDegrees,
  handleCursor,
  handleLocalPoint,
  handleWorldPoint,
  HANDLE_SIZE,
  normalizeDeg,
  resizeFrameRect,
  rotateNodesAround,
  snapRect,
  ALL_HANDLES,
} from '@sigma/engine';
import type { Rect, Vec2 } from '@sigma/geometry';
import { mat2d, rect as R, vec2 } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { BaseTool } from './base-tool';

type Interaction =
  | { kind: 'none' }
  | {
      kind: 'pending';
      start: Vec2;
      startScreen: Vec2;
      target: NodeId | null;
      additive: boolean;
      wasSelected: boolean;
    }
  | { kind: 'marquee'; start: Vec2; current: Vec2; additive: boolean; base: NodeId[] }
  | {
      kind: 'move';
      start: Vec2;
      last: Vec2;
      ids: NodeId[];
      origin: Map<NodeId, Rect>;
      duplicated: boolean;
      mergeKey: string;
    }
  | { kind: 'resize'; handle: HandleId; frame: SelectionFrame; ids: NodeId[]; mergeKey: string }
  | {
      kind: 'rotate';
      frame: SelectionFrame;
      ids: NodeId[];
      pivot: Vec2;
      startAngle: number;
      startRotations: Map<NodeId, number>;
      mergeKey: string;
    };

const ROTATE_ZONE = 14;
const DRAG_THRESHOLD = 3;

/**
 * Selection tool: click/shift-click selection, marquee, move with snapping, resize via handles
 * (shift = proportional, alt = from center), rotate from just outside the corners (shift = 15°
 * steps), alt-drag duplicates, double-click edits text or enters groups.
 */
export class SelectTool extends BaseTool {
  readonly id = 'select';
  readonly name = 'Select';
  override readonly shortcut = 'v';
  override readonly cursor = 'default';
  private state: Interaction = { kind: 'none' };
  private seq = 0;

  override deactivate(): void {
    this.state = { kind: 'none' };
    this.editor.hideHandles = false;
    this.editor.snapGuides = [];
    this.editor.selection.setHover(null);
  }

  /* ------------------------------------------------------------------ pointer down */

  override onPointerDown(e: EditorPointerEvent): void {
    if (e.button !== 0 || this.editor.isOnRulers(e.screen)) return;
    const editor = this.editor;
    const sel = editor.selection;
    const frame = editor.getSelectionFrame();
    const ids = [...sel.ids];

    if (frame && ids.length > 0) {
      const handle = this.handleAt(e.screen, frame);
      if (handle) {
        this.state = { kind: 'resize', handle, frame, ids, mergeKey: `resize:${++this.seq}` };
        editor.hideHandles = true;
        return;
      }
      const rot = this.rotateZoneAt(e.screen, frame);
      if (rot) {
        const pivot = mat2d.apply(frame.matrix, { x: frame.width / 2, y: frame.height / 2 });
        const startAngle = Math.atan2(e.world.y - pivot.y, e.world.x - pivot.x);
        const startRotations = new Map(
          ids.map((id) => [id, editor.graph.requireNode(id).transform.rotation]),
        );
        this.state = {
          kind: 'rotate',
          frame,
          ids,
          pivot,
          startAngle,
          startRotations,
          mergeKey: `rotate:${++this.seq}`,
        };
        editor.hideHandles = true;
        return;
      }
    }

    const hit = this.pick(e.world, e.modifiers.mod);
    const additive = e.modifiers.shift;
    this.state = {
      kind: 'pending',
      start: e.world,
      startScreen: e.screen,
      target: hit?.id ?? null,
      additive,
      wasSelected: hit ? sel.has(hit.id) : false,
    };

    if (!hit) {
      if (!additive) sel.clear();
      return;
    }
    if (additive) {
      if (!sel.has(hit.id)) sel.add([hit.id]);
    } else if (!sel.has(hit.id)) {
      sel.set([hit.id]);
    }
  }

  override onDoubleClick(e: EditorPointerEvent): void {
    const hit = this.editor.hitTester.hitTest(e.world, { tolerance: this.editor.worldTolerance() });
    if (!hit) return;
    if (hit.type === 'TEXT') {
      this.editor.selection.set([hit.id]);
      this.editor.requestTextEdit(hit.id);
      return;
    }
    // Drill into groups: select the deepest hit directly, and allow dragging it right away.
    this.editor.selection.set([hit.id]);
    this.state = {
      kind: 'pending',
      start: e.world,
      startScreen: e.screen,
      target: hit.id,
      additive: false,
      wasSelected: true,
    };
  }

  /* ------------------------------------------------------------------ pointer move */

  override onPointerMove(e: EditorPointerEvent): void {
    const editor = this.editor;
    const s = this.state;
    switch (s.kind) {
      case 'none':
        this.updateHoverAndCursor(e);
        return;
      case 'pending': {
        if (vec2.distance(e.screen, s.startScreen) < DRAG_THRESHOLD) return;
        if (s.target === null) {
          this.state = {
            kind: 'marquee',
            start: s.start,
            current: e.world,
            additive: s.additive,
            base: s.additive ? [...editor.selection.ids] : [],
          };
          editor.hideHandles = true;
          return;
        }
        let ids = editor.ops.topLevelOf(editor.selection.ids);
        let duplicated = false;
        if (e.modifiers.alt && ids.length > 0) {
          ids = editor.ops.duplicateNodes(ids, { x: 0, y: 0 });
          duplicated = true;
        }
        const origin = new Map(ids.map((id) => [id, editor.graph.getWorldBounds(id)]));
        this.state = {
          kind: 'move',
          start: s.start,
          last: s.start,
          ids,
          origin,
          duplicated,
          mergeKey: `move:${++this.seq}`,
        };
        editor.hideHandles = true;
        this.applyMove(e);
        return;
      }
      case 'marquee':
        s.current = e.world;
        this.applyMarquee(s);
        return;
      case 'move':
        this.applyMove(e);
        return;
      case 'resize':
        this.applyResize(e, s);
        return;
      case 'rotate':
        this.applyRotate(e, s);
        return;
    }
  }

  override onPointerUp(e: EditorPointerEvent): void {
    const editor = this.editor;
    const s = this.state;
    if (
      s.kind === 'pending' &&
      s.target &&
      !s.additive &&
      s.wasSelected &&
      editor.selection.size > 1
    ) {
      // Click (no drag) on an already multi-selected node selects just that node.
      editor.selection.set([s.target]);
    } else if (s.kind === 'pending' && s.target && s.additive && s.wasSelected) {
      editor.selection.remove([s.target]);
    } else if (s.kind === 'marquee') {
      this.applyMarquee(s);
    }
    this.state = { kind: 'none' };
    editor.hideHandles = false;
    editor.snapGuides = [];
    this.updateHoverAndCursor(e);
    editor.requestOverlay();
  }

  override onKeyDown(e: EditorKeyEvent): boolean | void {
    if (e.key === 'Escape' && this.state.kind !== 'none') {
      if (
        this.state.kind === 'move' ||
        this.state.kind === 'resize' ||
        this.state.kind === 'rotate'
      ) {
        // Cancel: undo the merged interaction entry.
        this.editor.history.undo();
      }
      this.state = { kind: 'none' };
      this.editor.hideHandles = false;
      this.editor.snapGuides = [];
      this.editor.requestOverlay();
      return true;
    }
  }

  override renderOverlay({ ctx, editor }: OverlayContext): void {
    if (this.state.kind === 'marquee') {
      const r = R.fromPoints(this.state.start, this.state.current);
      drawMarquee(ctx, editor.viewport.worldRectToScreen(r));
    }
    if (this.state.kind === 'rotate') {
      const id = this.state.ids[0] as NodeId;
      const rot = normalizeDeg(editor.graph.requireNode(id).transform.rotation);
      const p = editor.lastPointerScreen;
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      const label = `${rot.toFixed(1)}°`;
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = '#2f6df6';
      ctx.fillRect(p.x + 12, p.y + 12, w, 18);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x + 17, p.y + 21);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ interactions */

  private applyMove(e: EditorPointerEvent): void {
    const s = this.state;
    if (s.kind !== 'move') return;
    const editor = this.editor;
    let delta = vec2.sub(e.world, s.start);
    if (e.modifiers.shift) {
      if (Math.abs(delta.x) > Math.abs(delta.y)) delta = { x: delta.x, y: 0 };
      else delta = { x: 0, y: delta.y };
    }
    // Snap the moving selection bounds against other nodes.
    const originBounds = R.unionAll([...s.origin.values()]) as Rect;
    const proposed = R.translate(originBounds, delta);
    editor.snapGuides = [];
    if (!e.modifiers.mod) {
      const settings = editor.settings;
      const targets = settings.snapToObjects ? this.snapTargets(s.ids) : [];
      const result = snapRect(proposed, targets, {
        threshold: editor.worldTolerance(6),
        gridSize: settings.snapToGrid ? settings.gridSize : null,
        pixelSnap: settings.snapToPixels,
      });
      delta = vec2.add(delta, result.delta);
      editor.snapGuides = result.guides;
    }
    // Apply absolute: world delta relative to origin bounds, per node.
    const current = R.unionAll(s.ids.map((id) => editor.graph.getWorldBounds(id))) as Rect;
    const step = vec2.sub(R.translate(originBounds, delta), current);
    if (Math.abs(step.x) > 1e-9 || Math.abs(step.y) > 1e-9) {
      editor.ops.moveNodes(s.ids, { x: step.x, y: step.y }, s.mergeKey);
    }
    s.last = e.world;
  }

  private applyResize(e: EditorPointerEvent, s: Extract<Interaction, { kind: 'resize' }>): void {
    const editor = this.editor;
    const inv = mat2d.invert(s.frame.matrix);
    let local = mat2d.apply(inv, e.world);
    const settings = editor.settings;
    if (
      !e.modifiers.mod &&
      (settings.snapToGrid || settings.snapToPixels) &&
      frameRotationDegrees(s.frame) === 0
    ) {
      const g = settings.snapToGrid ? settings.gridSize : 1;
      const origin = mat2d.apply(s.frame.matrix, { x: 0, y: 0 });
      const wx = Math.round((origin.x + local.x) / g) * g;
      const wy = Math.round((origin.y + local.y) / g) * g;
      local = { x: wx - origin.x, y: wy - origin.y };
    }
    const next = resizeFrameRect(s.frame, s.handle, local, {
      proportional: e.modifiers.shift,
      fromCenter: e.modifiers.alt,
      minSize: 1,
    });
    const results = applyFrameRectToNodes(editor.graph, s.ids, s.frame, next);
    editor.ops.applyTransforms(results, 'Resize', s.mergeKey);
  }

  private applyRotate(e: EditorPointerEvent, s: Extract<Interaction, { kind: 'rotate' }>): void {
    const editor = this.editor;
    const angle = Math.atan2(e.world.y - s.pivot.y, e.world.x - s.pivot.x);
    let deltaDeg = ((angle - s.startAngle) * 180) / Math.PI;
    if (e.modifiers.shift) {
      const first = s.ids[0] as NodeId;
      const base = s.startRotations.get(first) ?? 0;
      deltaDeg = Math.round((base + deltaDeg) / 15) * 15 - base;
    }
    // Compute from the ORIGINAL rotations: apply (delta - current applied delta).
    const first = s.ids[0] as NodeId;
    const currentRot = editor.graph.requireNode(first).transform.rotation;
    const applied = normalizeDeg(currentRot - (s.startRotations.get(first) ?? 0));
    const step = normalizeDeg(deltaDeg - applied);
    if (Math.abs(step) < 1e-6) return;
    const results = rotateNodesAround(editor.graph, s.ids, s.pivot, step);
    editor.ops.applyTransforms(results, 'Rotate', s.mergeKey);
    editor.requestOverlay();
  }

  private applyMarquee(s: Extract<Interaction, { kind: 'marquee' }>): void {
    const editor = this.editor;
    const r = R.fromPoints(s.start, s.current);
    const page = editor.currentPageId;
    if (!page) return;
    // Select top-level children of the page (or of frames when fully contained) that intersect.
    const hits = editor.hitTester.nodesInRect(r, 'intersect', {
      guard: editor.nodeGuard ?? undefined,
    });
    const picked = new Set<NodeId>();
    for (const n of hits) {
      const target = this.selectableAncestor(n, false);
      if (target && R.intersects(editor.graph.getWorldBounds(target.id), r)) picked.add(target.id);
    }
    editor.selection.set([...s.base, ...picked]);
  }

  /* ------------------------------------------------------------------ picking */

  /** Hit-tests and resolves which node a click should select. `deep` (⌘) selects the deepest node. */
  private pick(world: Vec2, deep: boolean): SceneNode | null {
    const hit = this.editor.hitTester.hitTest(world, {
      tolerance: this.editor.worldTolerance(),
      guard: this.editor.nodeGuard ?? undefined,
    });
    if (!hit) return null;
    return this.selectableAncestor(hit, deep);
  }

  /**
   * Walks up from a hit node to the node that should be selected: groups capture clicks unless the
   * selection is already inside them. Frames do not capture (their children are directly selectable).
   */
  private selectableAncestor(hit: SceneNode, deep: boolean): SceneNode | null {
    if (deep) return hit;
    const graph = this.editor.graph;
    const sel = this.editor.selection;
    let node = hit;
    let cur = hit;
    // Climb while the parent is a group that is not "open".
    for (;;) {
      const parent = cur.parentId ? graph.getNode(cur.parentId) : undefined;
      if (!parent || parent.type !== 'GROUP') break;
      const open = sel.ids.some((id) => id !== parent.id && graph.isAncestorOf(parent.id, id));
      if (open) break;
      node = parent;
      cur = parent;
    }
    return node;
  }

  private handleAt(screen: Vec2, frame: SelectionFrame): HandleId | null {
    const vp = this.editor.viewport;
    const w = frame.width * vp.zoom;
    const h = frame.height * vp.zoom;
    let best: HandleId | null = null;
    let bestDist = Infinity;
    for (const handle of ALL_HANDLES) {
      if ((handle === 'n' || handle === 's') && w < 40) continue;
      if ((handle === 'e' || handle === 'w') && h < 40) continue;
      const p = vp.worldToScreen(handleWorldPoint(frame, handle));
      const d = Math.max(Math.abs(p.x - screen.x), Math.abs(p.y - screen.y));
      if (d <= HANDLE_SIZE / 2 + 3 && d < bestDist) {
        best = handle;
        bestDist = d;
      }
    }
    if (best) return best;
    // Edges: anywhere along an edge within 4px (outside tiny selections).
    const inv = mat2d.invert(frame.matrix);
    const local = mat2d.apply(inv, vp.screenToWorld(screen));
    const tol = 4 / vp.zoom;
    const insideX = local.x >= -tol && local.x <= frame.width + tol;
    const insideY = local.y >= -tol && local.y <= frame.height + tol;
    if (insideY && Math.abs(local.x) <= tol) return 'w';
    if (insideY && Math.abs(local.x - frame.width) <= tol) return 'e';
    if (insideX && Math.abs(local.y) <= tol) return 'n';
    if (insideX && Math.abs(local.y - frame.height) <= tol) return 's';
    return null;
  }

  private rotateZoneAt(screen: Vec2, frame: SelectionFrame): boolean {
    const vp = this.editor.viewport;
    const inv = mat2d.invert(frame.matrix);
    const local = mat2d.apply(inv, vp.screenToWorld(screen));
    const z = ROTATE_ZONE / vp.zoom;
    const hs = HANDLE_SIZE / 2 / vp.zoom;
    const nearCornerX =
      (local.x < -hs && local.x > -z) || (local.x > frame.width + hs && local.x < frame.width + z);
    const nearCornerY =
      (local.y < -hs && local.y > -z) ||
      (local.y > frame.height + hs && local.y < frame.height + z);
    const withinX = local.x > -z && local.x < frame.width + z;
    const withinY = local.y > -z && local.y < frame.height + z;
    return (
      (nearCornerX && withinY && (local.y < hs || local.y > frame.height - hs)) ||
      (nearCornerY && withinX && (local.x < hs || local.x > frame.width - hs))
    );
  }

  private updateHoverAndCursor(e: EditorPointerEvent): void {
    const editor = this.editor;
    const frame = editor.getSelectionFrame();
    if (frame && editor.selection.size > 0) {
      const handle = this.handleAt(e.screen, frame);
      if (handle) {
        editor.setCursor(handleCursor(handle, frameRotationDegrees(frame)));
        editor.selection.setHover(null);
        return;
      }
      if (this.rotateZoneAt(e.screen, frame)) {
        editor.setCursor(ROTATE_CURSOR);
        editor.selection.setHover(null);
        return;
      }
    }
    editor.setCursor('default');
    const hit = this.pick(e.world, e.modifiers.mod);
    editor.selection.setHover(hit?.id ?? null);
  }

  private snapTargets(moving: readonly NodeId[]): SnapTarget[] {
    const editor = this.editor;
    const graph = editor.graph;
    const page = editor.currentPageId;
    if (!page) return [];
    const exclude = new Set(moving);
    const visible = editor.viewport.getVisibleWorldRect();
    const out: SnapTarget[] = [];
    // Siblings of the moving nodes + top-level frames, limited to what is on screen.
    const parents = new Set(moving.map((id) => graph.getNode(id)?.parentId ?? page));
    for (const pid of parents) {
      for (const sib of graph.getChildren(pid)) {
        if (exclude.has(sib.id) || !sib.visible) continue;
        const wb = graph.getWorldBounds(sib.id);
        if (R.intersects(wb, visible)) out.push({ rect: wb });
      }
      if (pid !== page) out.push({ rect: graph.getWorldBounds(pid) });
    }
    return out;
  }
}

const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M10 3a7 7 0 1 1-6.5 4.4" fill="none" stroke="white" stroke-width="3.5"/><path d="M10 3a7 7 0 1 1-6.5 4.4" fill="none" stroke="black" stroke-width="1.5"/><path d="M1.5 3.5v4.5h4.5" fill="none" stroke="white" stroke-width="3.5"/><path d="M1.5 3.5v4.5h4.5" fill="none" stroke="black" stroke-width="1.5"/></svg>',
)}") 10 10, crosshair`;

export { frameCorners, handleLocalPoint };
