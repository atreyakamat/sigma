import type { NodeProps, NodeType } from '@sigma/document';
import type { EditorKeyEvent, EditorPointerEvent, OverlayContext } from '@sigma/engine';
import { drawMarquee, snapPoint } from '@sigma/engine';
import type { Rect, Vec2 } from '@sigma/geometry';
import { rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { BaseTool } from './base-tool';

/**
 * Shared drag-to-create behaviour for rectangle/ellipse/frame/line/polygon/star tools.
 * Shift constrains to a square, alt draws from the center. A click without drag creates a
 * default-sized shape.
 */
export abstract class ShapeTool extends BaseTool {
  abstract readonly nodeType: Exclude<NodeType, 'PAGE' | 'GROUP' | 'TEXT' | 'IMAGE' | 'VECTOR'>;
  override readonly cursor = 'crosshair';
  protected defaultSize: Vec2 = { x: 100, y: 100 };
  private start: Vec2 | null = null;
  private current: Vec2 | null = null;
  private modifiers = { shift: false, alt: false };

  protected extraProps(_rect: Rect): Partial<NodeProps> {
    return {};
  }

  override deactivate(): void {
    this.start = this.current = null;
    this.editor.hideHandles = false;
  }

  override onPointerDown(e: EditorPointerEvent): void {
    if (e.button !== 0 || this.editor.isOnRulers(e.screen)) return;
    this.start = this.snap(e.world);
    this.current = this.start;
    this.modifiers = { shift: e.modifiers.shift, alt: e.modifiers.alt };
    this.editor.hideHandles = true;
  }

  override onPointerMove(e: EditorPointerEvent): void {
    if (!this.start) return;
    this.current = this.snap(e.world);
    this.modifiers = { shift: e.modifiers.shift, alt: e.modifiers.alt };
    this.editor.requestOverlay();
  }

  override onPointerUp(e: EditorPointerEvent): void {
    if (!this.start) return;
    this.current = this.snap(e.world);
    this.modifiers = { shift: e.modifiers.shift, alt: e.modifiers.alt };
    let rect = this.previewRect();
    const dragged = rect.width >= 2 || rect.height >= 2;
    if (!dragged) {
      rect =
        this.nodeType === 'LINE'
          ? R.of(this.start.x, this.start.y, this.defaultSize.x, 0)
          : R.of(this.start.x, this.start.y, this.defaultSize.x, this.defaultSize.y);
    }
    this.start = this.current = null;
    this.editor.hideHandles = false;
    this.create(rect, e);
    if (!e.modifiers.shift) this.editor.tools.activate('select');
  }

  override onKeyDown(e: EditorKeyEvent): boolean | void {
    if (e.key === 'Escape' && this.start) {
      this.start = this.current = null;
      this.editor.hideHandles = false;
      this.editor.requestOverlay();
      return true;
    }
  }

  override renderOverlay({ ctx, editor }: OverlayContext): void {
    if (!this.start || !this.current) return;
    const rect = this.previewRect();
    drawMarquee(ctx, editor.viewport.worldRectToScreen(rect));
  }

  protected snap(p: Vec2): Vec2 {
    const s = this.editor.settings;
    return snapPoint(p, { gridSize: s.snapToGrid ? s.gridSize : null, pixelSnap: s.snapToPixels });
  }

  protected previewRect(): Rect {
    const a = this.start as Vec2;
    let b = this.current as Vec2;
    if (this.modifiers.shift) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      b = { x: a.x + Math.sign(dx || 1) * m, y: a.y + Math.sign(dy || 1) * m };
    }
    if (this.modifiers.alt) {
      return R.fromPoints({ x: a.x - (b.x - a.x), y: a.y - (b.y - a.y) }, b);
    }
    return R.fromPoints(a, b);
  }

  protected create(worldRect: Rect, e: EditorPointerEvent): NodeId {
    const parent =
      this.nodeType === 'FRAME'
        ? this.editor.currentPageId
        : this.editor.ops.findContainerAt(R.center(worldRect));
    const parentId = parent as NodeId;
    const local = this.editor.ops.worldRectToParent(parentId, worldRect);
    const props = {
      transform: { x: local.x, y: local.y, rotation: 0, scaleX: 1, scaleY: 1 },
      size: {
        width: Math.max(local.width, this.nodeType === 'LINE' ? 1 : 1),
        height: this.nodeType === 'LINE' ? 0 : Math.max(local.height, 1),
      },
      ...this.extraProps(worldRect),
    };
    if (this.nodeType === 'LINE') {
      // Lines are stored as a horizontal segment with a rotation.
      const start = this.lineStart ?? { x: worldRect.x, y: worldRect.y };
      const end = this.lineEnd ?? {
        x: worldRect.x + worldRect.width,
        y: worldRect.y + worldRect.height,
      };
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || this.defaultSize.x;
      const ps = this.editor.ops.worldRectToParent(parentId, R.of(start.x, start.y, 0, 0));
      props.transform = {
        x: ps.x,
        y: ps.y,
        rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
        scaleX: 1,
        scaleY: 1,
      };
      props.size = { width: len, height: 0 };
    }
    void e;
    return this.editor.ops.createNode(this.nodeType, props as never, parentId);
  }

  protected lineStart: Vec2 | null = null;
  protected lineEnd: Vec2 | null = null;
}

export class RectangleTool extends ShapeTool {
  readonly id = 'rectangle';
  readonly name = 'Rectangle';
  override readonly shortcut = 'r';
  readonly nodeType = 'RECTANGLE' as const;
}

export class EllipseTool extends ShapeTool {
  readonly id = 'ellipse';
  readonly name = 'Ellipse';
  override readonly shortcut = 'o';
  readonly nodeType = 'ELLIPSE' as const;
}

export class FrameTool extends ShapeTool {
  readonly id = 'frame';
  readonly name = 'Frame';
  override readonly shortcut = 'f';
  readonly nodeType = 'FRAME' as const;
  protected override defaultSize = { x: 375, y: 812 };
}

export class PolygonTool extends ShapeTool {
  readonly id = 'polygon';
  readonly name = 'Polygon';
  readonly nodeType = 'POLYGON' as const;
  protected override extraProps(): Partial<NodeProps> {
    return { pointCount: 3 } as Partial<NodeProps>;
  }
}

export class StarTool extends ShapeTool {
  readonly id = 'star';
  readonly name = 'Star';
  readonly nodeType = 'STAR' as const;
  protected override extraProps(): Partial<NodeProps> {
    return { pointCount: 5, innerRadius: 0.382 } as Partial<NodeProps>;
  }
}

export class LineTool extends ShapeTool {
  readonly id = 'line';
  readonly name = 'Line';
  override readonly shortcut = 'l';
  readonly nodeType = 'LINE' as const;

  override onPointerDown(e: EditorPointerEvent): void {
    super.onPointerDown(e);
    this.lineStart = this.snap(e.world);
  }

  override onPointerMove(e: EditorPointerEvent): void {
    super.onPointerMove(e);
    this.lineEnd = this.constrain(this.snap(e.world), e);
  }

  override onPointerUp(e: EditorPointerEvent): void {
    const end = this.constrain(this.snap(e.world), e);
    const start = this.lineStart;
    if (start && Math.hypot(end.x - start.x, end.y - start.y) < 2) {
      this.lineEnd = { x: start.x + this.defaultSize.x, y: start.y };
    } else {
      this.lineEnd = end;
    }
    super.onPointerUp(e);
    this.lineStart = this.lineEnd = null;
  }

  private constrain(p: Vec2, e: EditorPointerEvent): Vec2 {
    if (!e.modifiers.shift || !this.lineStart) return p;
    const s = this.lineStart;
    const angle = Math.atan2(p.y - s.y, p.x - s.x);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(p.x - s.x, p.y - s.y);
    return { x: s.x + Math.cos(snapped) * len, y: s.y + Math.sin(snapped) * len };
  }

  override renderOverlay({ ctx, editor }: OverlayContext): void {
    if (!this.lineStart || !this.lineEnd) return;
    const a = editor.viewport.worldToScreen(this.lineStart);
    const b = editor.viewport.worldToScreen(this.lineEnd);
    ctx.save();
    ctx.strokeStyle = '#2f6df6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}
