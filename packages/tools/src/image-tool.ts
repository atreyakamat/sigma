import type { EditorPointerEvent, OverlayContext } from '@sigma/engine';
import { drawMarquee, snapPoint } from '@sigma/engine';
import type { Vec2 } from '@sigma/geometry';
import { rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { BaseTool } from './base-tool';

export interface PendingImage {
  src: string;
  width: number;
  height: number;
  name?: string;
  assetId?: string | null;
}

/**
 * Places an image chosen by the host UI (file picker / drop). Click places at natural size (capped
 * to a sensible maximum); drag defines the box. The host calls `setPending` then activates the tool.
 */
export class ImageTool extends BaseTool {
  readonly id = 'image';
  readonly name = 'Image';
  override readonly cursor = 'copy';
  private pending: PendingImage | null = null;
  private start: Vec2 | null = null;
  private current: Vec2 | null = null;
  /** Host hook: called when the tool is activated with nothing pending (open a file picker). */
  onRequestImage: (() => void) | null = null;

  setPending(image: PendingImage | null): void {
    this.pending = image;
  }

  override activate(): void {
    if (!this.pending) this.onRequestImage?.();
  }

  override deactivate(): void {
    this.start = this.current = null;
    this.editor.hideHandles = false;
  }

  /** Places the pending image immediately at a world point (used by drag-and-drop). */
  placeAt(world: Vec2, image: PendingImage = this.pending as PendingImage): NodeId | null {
    if (!image) return null;
    const { width, height } = this.fitSize(image);
    return this.create(R.of(world.x - width / 2, world.y - height / 2, width, height), image);
  }

  override onPointerDown(e: EditorPointerEvent): void {
    if (e.button !== 0 || !this.pending || this.editor.isOnRulers(e.screen)) return;
    this.start = this.snap(e.world);
    this.current = this.start;
    this.editor.hideHandles = true;
  }

  override onPointerMove(e: EditorPointerEvent): void {
    if (!this.start) return;
    this.current = this.snap(e.world);
    this.editor.requestOverlay();
  }

  override onPointerUp(e: EditorPointerEvent): void {
    if (!this.start || !this.pending) return;
    const end = this.snap(e.world);
    const dragRect = R.fromPoints(this.start, end);
    const image = this.pending;
    let rect = dragRect;
    if (dragRect.width < 4 || dragRect.height < 4) {
      const { width, height } = this.fitSize(image);
      rect = R.of(this.start.x, this.start.y, width, height);
    } else if (e.modifiers.shift) {
      const ratio = image.width / image.height;
      rect = R.of(dragRect.x, dragRect.y, dragRect.width, dragRect.width / ratio);
    }
    this.start = this.current = null;
    this.editor.hideHandles = false;
    this.create(rect, image);
    this.pending = null;
    this.editor.tools.activate('select');
  }

  override renderOverlay({ ctx, editor }: OverlayContext): void {
    if (!this.start || !this.current) return;
    drawMarquee(ctx, editor.viewport.worldRectToScreen(R.fromPoints(this.start, this.current)));
  }

  private fitSize(image: PendingImage): { width: number; height: number } {
    const max = 1024;
    const scale = Math.min(1, max / Math.max(image.width, image.height));
    return {
      width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)),
    };
  }

  private create(worldRect: ReturnType<typeof R.of>, image: PendingImage): NodeId {
    const parentId = this.editor.ops.findContainerAt(R.center(worldRect)) as NodeId;
    const local = this.editor.ops.worldRectToParent(parentId, worldRect);
    return this.editor.ops.createNode(
      'IMAGE',
      {
        name: image.name ?? 'Image',
        transform: { x: local.x, y: local.y, rotation: 0, scaleX: 1, scaleY: 1 },
        size: { width: Math.max(1, local.width), height: Math.max(1, local.height) },
        image: {
          type: 'IMAGE',
          src: image.src,
          assetId: image.assetId ?? null,
          scaleMode: 'FILL',
          opacity: 1,
          visible: true,
        },
      },
      parentId,
    );
  }

  private snap(p: Vec2): Vec2 {
    const s = this.editor.settings;
    return snapPoint(p, { gridSize: s.snapToGrid ? s.gridSize : null, pixelSnap: s.snapToPixels });
  }
}
