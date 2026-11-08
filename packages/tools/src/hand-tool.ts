import type { EditorPointerEvent } from '@sigma/engine';
import type { Vec2 } from '@sigma/geometry';
import { BaseTool } from './base-tool';

export class HandTool extends BaseTool {
  readonly id = 'hand';
  readonly name = 'Hand';
  override readonly shortcut = 'h';
  override readonly cursor = 'grab';
  private last: Vec2 | null = null;

  override deactivate(): void {
    this.last = null;
  }

  override onPointerDown(e: EditorPointerEvent): void {
    this.last = e.screen;
    this.editor.setCursor('grabbing');
  }

  override onPointerMove(e: EditorPointerEvent): void {
    if (!this.last) return;
    this.editor.viewport.panBy(e.screen.x - this.last.x, e.screen.y - this.last.y);
    this.last = e.screen;
  }

  override onPointerUp(): void {
    this.last = null;
    this.editor.setCursor('grab');
  }
}
