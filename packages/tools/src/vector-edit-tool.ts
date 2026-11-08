import type { EditorKeyEvent, EditorPointerEvent, OverlayContext } from '@sigma/engine';
import { OVERLAY_COLORS } from '@sigma/engine';
import type { PathCommand, Vec2 } from '@sigma/geometry';
import { cubicPoint, cubicSplit, distanceToSegment, mat2d, vec2 } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { BaseTool } from './base-tool';

type Handle =
  | { kind: 'anchor'; index: number }
  | { kind: 'in'; index: number }
  | { kind: 'out'; index: number };

/**
 * Edits a VECTOR node's anchors and handles in place. Enter/double-click a vector to start;
 * drag anchors or handles, double-click a segment to insert an anchor, Delete removes selected
 * anchors, Escape returns to the select tool.
 */
export class VectorEditTool extends BaseTool {
  readonly id = 'vector-edit';
  readonly name = 'Edit path';
  override readonly cursor = 'default';
  private nodeId: NodeId | null = null;
  private selected = new Set<number>();
  private drag: { handle: Handle; path: PathCommand[]; start: Vec2; mergeKey: string } | null =
    null;
  private seq = 0;

  edit(id: NodeId): void {
    this.nodeId = id;
    this.selected.clear();
    this.editor.hideHandles = true;
    this.editor.requestOverlay();
  }

  override deactivate(): void {
    this.nodeId = null;
    this.selected.clear();
    this.drag = null;
    this.editor.hideHandles = false;
  }

  private path(): PathCommand[] {
    const node = this.nodeId ? this.editor.graph.getNode(this.nodeId) : undefined;
    return node?.type === 'VECTOR' ? (node.path as PathCommand[]) : [];
  }

  private toLocal(world: Vec2): Vec2 {
    return mat2d.apply(
      mat2d.invert(this.editor.graph.getWorldMatrix(this.nodeId as NodeId)),
      world,
    );
  }

  private toWorld(local: Vec2): Vec2 {
    return mat2d.apply(this.editor.graph.getWorldMatrix(this.nodeId as NodeId), local);
  }

  /** Anchor/handle under a local point, anchors first. */
  private hitHandle(local: Vec2, tolerance: number): Handle | null {
    const path = this.path();
    for (let i = 0; i < path.length; i++) {
      const c = path[i] as PathCommand;
      if (c.type === 'Z') continue;
      if (vec2.distance(local, c) <= tolerance) return { kind: 'anchor', index: i };
    }
    for (let i = 0; i < path.length; i++) {
      const c = path[i] as PathCommand;
      if (c.type !== 'C') continue;
      if (this.selected.has(i) && vec2.distance(local, { x: c.x2, y: c.y2 }) <= tolerance)
        return { kind: 'in', index: i };
      const next = path[i + 1];
      if (
        next?.type === 'C' &&
        this.selected.has(i) &&
        vec2.distance(local, { x: next.x1, y: next.y1 }) <= tolerance
      )
        return { kind: 'out', index: i };
    }
    return null;
  }

  override onPointerDown(e: EditorPointerEvent): void {
    if (!this.nodeId || e.button !== 0) return;
    const local = this.toLocal(e.world);
    const hit = this.hitHandle(local, this.editor.worldTolerance(6));
    if (!hit) {
      if (!e.modifiers.shift) this.selected.clear();
      this.editor.requestOverlay();
      return;
    }
    if (hit.kind === 'anchor') {
      if (e.modifiers.shift) {
        if (this.selected.has(hit.index)) this.selected.delete(hit.index);
        else this.selected.add(hit.index);
      } else if (!this.selected.has(hit.index)) this.selected = new Set([hit.index]);
    }
    this.drag = {
      handle: hit,
      path: this.path().map((c) => ({ ...c })),
      start: local,
      mergeKey: `vector:${++this.seq}`,
    };
    this.editor.requestOverlay();
  }

  override onPointerMove(e: EditorPointerEvent): void {
    if (!this.drag || !this.nodeId) return;
    const local = this.toLocal(e.world);
    const d = vec2.sub(local, this.drag.start);
    const next = this.drag.path.map((c) => ({ ...c })) as PathCommand[];
    const move = (i: number): void => {
      const c = next[i] as PathCommand;
      if (c.type === 'Z') return;
      c.x += d.x;
      c.y += d.y;
      if (c.type === 'C') {
        c.x2 += d.x;
        c.y2 += d.y;
      }
      const after = next[i + 1];
      if (after?.type === 'C') {
        after.x1 += d.x;
        after.y1 += d.y;
      }
    };
    if (this.drag.handle.kind === 'anchor') {
      const indices = this.selected.has(this.drag.handle.index)
        ? [...this.selected]
        : [this.drag.handle.index];
      indices.forEach(move);
    } else if (this.drag.handle.kind === 'in') {
      const c = next[this.drag.handle.index] as Extract<PathCommand, { type: 'C' }>;
      c.x2 += d.x;
      c.y2 += d.y;
      if (!e.modifiers.alt) {
        const after = next[this.drag.handle.index + 1];
        if (after?.type === 'C') {
          after.x1 = 2 * c.x - c.x2;
          after.y1 = 2 * c.y - c.y2;
        }
      }
    } else {
      const anchor = next[this.drag.handle.index] as Extract<PathCommand, { type: 'C' }>;
      const after = next[this.drag.handle.index + 1] as Extract<PathCommand, { type: 'C' }>;
      after.x1 += d.x;
      after.y1 += d.y;
      if (!e.modifiers.alt) {
        anchor.x2 = 2 * anchor.x - after.x1;
        anchor.y2 = 2 * anchor.y - after.y1;
      }
    }
    this.editor.ops.setVectorPath(this.nodeId, next, this.drag.mergeKey);
    // Normalization may have moved the node origin; keep dragging relative to the new local frame.
    this.drag.path = this.path().map((c) => ({ ...c }));
    this.drag.start = this.toLocal(e.world);
  }

  override onPointerUp(): void {
    this.drag = null;
    this.editor.history.markBoundary();
    this.editor.requestOverlay();
  }

  override onDoubleClick(e: EditorPointerEvent): void {
    if (!this.nodeId) return;
    const local = this.toLocal(e.world);
    const tol = this.editor.worldTolerance(6);
    const path = this.path();
    let cur: Vec2 = { x: 0, y: 0 };
    let subStart: Vec2 = cur;
    for (let i = 0; i < path.length; i++) {
      const c = path[i] as PathCommand;
      if (c.type === 'M') {
        cur = subStart = c;
        continue;
      }
      const end: Vec2 = c.type === 'Z' ? subStart : c;
      if (c.type === 'L' || c.type === 'Z') {
        if (distanceToSegment(local, cur, end) <= tol) {
          const next = [...path];
          next.splice(i, 0, { type: 'L', x: local.x, y: local.y });
          this.editor.ops.setVectorPath(this.nodeId, next);
          this.selected = new Set([i]);
          return;
        }
      } else if (c.type === 'C') {
        let bestT = -1;
        let bestD = Infinity;
        for (let t = 0; t <= 1; t += 1 / 32) {
          const d = vec2.distance(
            local,
            cubicPoint(cur, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, c, t),
          );
          if (d < bestD) {
            bestD = d;
            bestT = t;
          }
        }
        if (bestD <= tol) {
          const [a, b] = cubicSplit(cur, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, c, bestT);
          const next = [...path];
          next.splice(
            i,
            1,
            { type: 'C', x1: a[1].x, y1: a[1].y, x2: a[2].x, y2: a[2].y, x: a[3].x, y: a[3].y },
            { type: 'C', x1: b[1].x, y1: b[1].y, x2: b[2].x, y2: b[2].y, x: b[3].x, y: b[3].y },
          );
          this.editor.ops.setVectorPath(this.nodeId, next);
          this.selected = new Set([i]);
          return;
        }
      }
      cur = end;
    }
  }

  override onKeyDown(e: EditorKeyEvent): boolean | void {
    if (e.key === 'Escape' || e.key === 'Enter') {
      this.editor.tools.activate('select');
      return true;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.nodeId && this.selected.size) {
      const path = this.path();
      const next = path.filter((_, i) => !this.selected.has(i));
      // A path needs at least two points; keep the first command a moveto.
      if (next.filter((c) => c.type !== 'Z').length >= 2) {
        if (next[0]?.type !== 'M') {
          const first = next[0] as Extract<PathCommand, { type: 'L' | 'C' }>;
          next[0] = { type: 'M', x: first.x, y: first.y };
        }
        this.editor.ops.setVectorPath(this.nodeId, next);
      }
      this.selected.clear();
      return true;
    }
  }

  override renderOverlay({ ctx, editor }: OverlayContext): void {
    if (!this.nodeId) return;
    const path = this.path();
    const vp = editor.viewport;
    ctx.save();
    ctx.lineWidth = 1;
    let prev: Vec2 | null = null;
    path.forEach((c, i) => {
      if (c.type === 'Z') return;
      const p = vp.worldToScreen(this.toWorld(c));
      if (c.type === 'C' && this.selected.has(i) && prev) {
        const h2 = vp.worldToScreen(this.toWorld({ x: c.x2, y: c.y2 }));
        ctx.strokeStyle = 'rgba(47,109,246,0.6)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(h2.x, h2.y);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = OVERLAY_COLORS.selection;
        ctx.beginPath();
        ctx.arc(h2.x, h2.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const next = path[i + 1];
      if (next?.type === 'C' && this.selected.has(i)) {
        const h1 = vp.worldToScreen(this.toWorld({ x: next.x1, y: next.y1 }));
        ctx.strokeStyle = 'rgba(47,109,246,0.6)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(h1.x, h1.y);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = OVERLAY_COLORS.selection;
        ctx.beginPath();
        ctx.arc(h1.x, h1.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = this.selected.has(i) ? OVERLAY_COLORS.selection : '#fff';
      ctx.strokeStyle = OVERLAY_COLORS.selection;
      ctx.beginPath();
      ctx.rect(p.x - 3.5, p.y - 3.5, 7, 7);
      ctx.fill();
      ctx.stroke();
      prev = p;
    });
    ctx.restore();
  }
}
