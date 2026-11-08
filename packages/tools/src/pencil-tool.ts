import type { EditorPointerEvent, OverlayContext } from '@sigma/engine';
import { OVERLAY_COLORS } from '@sigma/engine';
import type { Vec2 } from '@sigma/geometry';
import { normalizePath, pathBounds, simplifyPoints, smoothPolyline } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { BaseTool } from './base-tool';

/** Freehand drawing: points are simplified (RDP) and smoothed into cubic curves on release. */
export class PencilTool extends BaseTool {
  readonly id = 'pencil';
  readonly name = 'Pencil';
  override readonly shortcut = 'shift+p';
  override readonly cursor = 'crosshair';
  private points: Vec2[] = [];

  override deactivate(): void {
    this.points = [];
  }

  override onPointerDown(e: EditorPointerEvent): void {
    if (e.button !== 0 || this.editor.isOnRulers(e.screen)) return;
    this.points = [e.world];
  }

  override onPointerMove(e: EditorPointerEvent): void {
    if (this.points.length === 0) return;
    this.points.push(e.world);
    this.editor.requestOverlay();
  }

  override onPointerUp(e: EditorPointerEvent): void {
    if (this.points.length === 0) return;
    this.points.push(e.world);
    const simplified = simplifyPoints(this.points, this.editor.worldTolerance(1.5));
    this.points = [];
    if (simplified.length < 2) return;
    const { commands, offset } = normalizePath(smoothPolyline(simplified));
    const b = pathBounds(commands);
    const parentId = this.editor.ops.findContainerAt(offset) as NodeId;
    const local = this.editor.ops.worldRectToParent(parentId, {
      x: offset.x,
      y: offset.y,
      width: 0,
      height: 0,
    });
    this.editor.ops.createNode(
      'VECTOR',
      {
        name: 'Drawing',
        transform: { x: local.x, y: local.y, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: b.width, height: b.height },
        path: commands,
        style: {
          fills: [],
          strokes: [
            {
              paint: { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } },
              width: 2,
              align: 'CENTER',
              cap: 'ROUND',
              join: 'ROUND',
            },
          ],
        },
      },
      parentId,
    );
    if (!e.modifiers.shift) this.editor.tools.activate('select');
  }

  override renderOverlay({ ctx, editor }: OverlayContext): void {
    if (this.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = OVERLAY_COLORS.selection;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.points.forEach((p, i) => {
      const s = editor.viewport.worldToScreen(p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();
  }
}
