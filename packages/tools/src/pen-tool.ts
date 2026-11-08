import type { EditorKeyEvent, EditorPointerEvent, OverlayContext } from '@sigma/engine';
import { OVERLAY_COLORS, snapPoint } from '@sigma/engine';
import type { PathCommand, Vec2 } from '@sigma/geometry';
import { normalizePath, pathBounds, vec2 } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { BaseTool } from './base-tool';

interface Anchor {
  point: Vec2;
  /** Outgoing handle (absolute), mirrored for the incoming one unless broken. */
  handleOut: Vec2 | null;
  handleIn: Vec2 | null;
}

/**
 * Pen tool: click to add corner anchors, drag to pull out symmetric handles, click the first
 * anchor to close, Enter to finish an open path, Escape to discard. Creates one VECTOR node.
 */
export class PenTool extends BaseTool {
  readonly id = 'pen';
  readonly name = 'Pen';
  override readonly shortcut = 'p';
  override readonly cursor = 'crosshair';
  private anchors: Anchor[] = [];
  private dragging: { index: number; start: Vec2 } | null = null;
  private hover: Vec2 | null = null;

  override activate(): void {
    this.anchors = [];
    this.editor.hideHandles = true;
  }

  override deactivate(): void {
    this.anchors = [];
    this.dragging = null;
    this.editor.hideHandles = false;
  }

  private snap(p: Vec2): Vec2 {
    const s = this.editor.settings;
    return snapPoint(p, { gridSize: s.snapToGrid ? s.gridSize : null, pixelSnap: s.snapToPixels });
  }

  override onPointerDown(e: EditorPointerEvent): void {
    if (e.button !== 0 || this.editor.isOnRulers(e.screen)) return;
    const p = this.snap(e.world);
    const first = this.anchors[0];
    if (
      first &&
      this.anchors.length > 2 &&
      vec2.distance(p, first.point) <= this.editor.worldTolerance(8)
    ) {
      this.finish(true);
      return;
    }
    this.anchors.push({ point: p, handleOut: null, handleIn: null });
    this.dragging = { index: this.anchors.length - 1, start: p };
    this.editor.requestOverlay();
  }

  override onPointerMove(e: EditorPointerEvent): void {
    this.hover = this.snap(e.world);
    if (this.dragging) {
      const a = this.anchors[this.dragging.index] as Anchor;
      const d = vec2.sub(this.hover, a.point);
      if (vec2.length(d) > this.editor.worldTolerance(2)) {
        a.handleOut = this.hover;
        a.handleIn = vec2.sub(a.point, d);
      }
    }
    this.editor.requestOverlay();
  }

  override onPointerUp(): void {
    this.dragging = null;
    this.editor.requestOverlay();
  }

  override onKeyDown(e: EditorKeyEvent): boolean | void {
    if (e.key === 'Enter') {
      this.finish(false);
      return true;
    }
    if (e.key === 'Escape') {
      this.anchors = [];
      this.editor.tools.activate('select');
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      this.anchors.pop();
      this.editor.requestOverlay();
      return true;
    }
  }

  /** Path commands in world space for the current anchors. */
  private commands(close: boolean): PathCommand[] {
    const out: PathCommand[] = [];
    this.anchors.forEach((a, i) => {
      if (i === 0) {
        out.push({ type: 'M', x: a.point.x, y: a.point.y });
        return;
      }
      const prev = this.anchors[i - 1] as Anchor;
      out.push(segment(prev, a));
    });
    if (close && this.anchors.length > 2) {
      const last = this.anchors[this.anchors.length - 1] as Anchor;
      const first = this.anchors[0] as Anchor;
      if (last.handleOut || first.handleIn) out.push(segment(last, first));
      out.push({ type: 'Z' });
    }
    return out;
  }

  private finish(close: boolean): NodeId | null {
    if (this.anchors.length < 2) {
      this.anchors = [];
      this.editor.tools.activate('select');
      return null;
    }
    const world = this.commands(close);
    const { commands, offset } = normalizePath(world);
    const b = pathBounds(commands);
    const parentId = this.editor.ops.findContainerAt(offset) as NodeId;
    const local = this.editor.ops.worldRectToParent(parentId, {
      x: offset.x,
      y: offset.y,
      width: 0,
      height: 0,
    });
    const id = this.editor.ops.createNode(
      'VECTOR',
      {
        transform: { x: local.x, y: local.y, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: Math.max(b.width, 0), height: Math.max(b.height, 0) },
        path: commands,
        style: close
          ? {
              fills: [{ type: 'SOLID', color: { r: 0.851, g: 0.851, b: 0.851, a: 1 } }],
              strokes: [
                {
                  paint: { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } },
                  width: 1,
                  align: 'CENTER',
                },
              ],
            }
          : {
              fills: [],
              strokes: [
                {
                  paint: { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } },
                  width: 2,
                  align: 'CENTER',
                },
              ],
            },
      },
      parentId,
    );
    this.anchors = [];
    this.editor.tools.activate('select');
    return id;
  }

  override renderOverlay({ ctx, editor }: OverlayContext): void {
    if (this.anchors.length === 0) return;
    const vp = editor.viewport;
    ctx.save();
    ctx.strokeStyle = OVERLAY_COLORS.selection;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const cmds = this.commands(false);
    for (const c of cmds) {
      if (c.type === 'M') {
        const p = vp.worldToScreen(c);
        ctx.moveTo(p.x, p.y);
      } else if (c.type === 'L') {
        const p = vp.worldToScreen(c);
        ctx.lineTo(p.x, p.y);
      } else if (c.type === 'C') {
        const a = vp.worldToScreen({ x: c.x1, y: c.y1 });
        const b = vp.worldToScreen({ x: c.x2, y: c.y2 });
        const p = vp.worldToScreen(c);
        ctx.bezierCurveTo(a.x, a.y, b.x, b.y, p.x, p.y);
      }
    }
    if (this.hover && !this.dragging) {
      const last = this.anchors[this.anchors.length - 1] as Anchor;
      const seg = segment(last, { point: this.hover, handleIn: null, handleOut: null });
      const p = vp.worldToScreen(this.hover);
      if (seg.type === 'C') {
        const a = vp.worldToScreen({ x: seg.x1, y: seg.y1 });
        ctx.bezierCurveTo(a.x, a.y, p.x, p.y, p.x, p.y);
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    for (const a of this.anchors) {
      const p = vp.worldToScreen(a.point);
      for (const h of [a.handleIn, a.handleOut]) {
        if (!h) continue;
        const hp = vp.worldToScreen(h);
        ctx.strokeStyle = 'rgba(47,109,246,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(hp.x, hp.y);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = OVERLAY_COLORS.selection;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = OVERLAY_COLORS.selection;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(p.x - 3.5, p.y - 3.5, 7, 7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function segment(from: Anchor, to: Anchor): PathCommand {
  if (!from.handleOut && !to.handleIn) return { type: 'L', x: to.point.x, y: to.point.y };
  const c1 = from.handleOut ?? from.point;
  const c2 = to.handleIn ?? to.point;
  return { type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: to.point.x, y: to.point.y };
}
