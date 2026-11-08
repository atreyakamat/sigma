import type { EditorPointerEvent } from '@sigma/engine';
import { snapPoint } from '@sigma/engine';
import type { Vec2 } from '@sigma/geometry';
import { rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { BaseTool } from './base-tool';

/** Click to create an auto-width text node (drag to create a fixed-width one), then edit inline. */
export class TextTool extends BaseTool {
  readonly id = 'text';
  readonly name = 'Text';
  override readonly shortcut = 't';
  override readonly cursor = 'text';
  private start: Vec2 | null = null;

  override onPointerDown(e: EditorPointerEvent): void {
    if (e.button !== 0 || this.editor.isOnRulers(e.screen)) return;
    const hit = this.editor.hitTester.hitTest(e.world, { tolerance: this.editor.worldTolerance() });
    if (hit?.type === 'TEXT') {
      this.editor.selection.set([hit.id]);
      this.editor.requestTextEdit(hit.id);
      this.editor.tools.activate('select');
      return;
    }
    this.start = this.snap(e.world);
  }

  override onPointerUp(e: EditorPointerEvent): void {
    if (!this.start) return;
    const end = this.snap(e.world);
    const dragged = Math.abs(end.x - this.start.x) > 4;
    const worldRect = dragged
      ? R.fromPoints(this.start, end)
      : R.of(this.start.x, this.start.y, 1, 1);
    const parentId = this.editor.ops.findContainerAt(this.start) as NodeId;
    const local = this.editor.ops.worldRectToParent(parentId, worldRect);
    const id = this.editor.ops.createNode(
      'TEXT',
      {
        characters: '',
        textStyle: this.editor.defaults.textStyle,
        autoResize: dragged ? 'HEIGHT' : 'WIDTH_AND_HEIGHT',
        transform: { x: local.x, y: local.y, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: dragged ? Math.max(local.width, 10) : 1, height: 20 },
      },
      parentId,
    );
    this.start = null;
    this.editor.tools.activate('select');
    this.editor.requestTextEdit(id);
  }

  private snap(p: Vec2): Vec2 {
    const s = this.editor.settings;
    return snapPoint(p, { gridSize: s.snapToGrid ? s.gridSize : null, pixelSnap: s.snapToPixels });
  }
}
