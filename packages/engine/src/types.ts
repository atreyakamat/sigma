import type { Vec2 } from '@sigma/geometry';
import type { Editor } from './editor';

export interface Modifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  /** Platform primary modifier: ⌘ on macOS, Ctrl elsewhere. */
  mod: boolean;
}

export type PointerEventType = 'down' | 'move' | 'up' | 'cancel';

export interface EditorPointerEvent {
  type: PointerEventType;
  /** Position in world (document) coordinates. */
  world: Vec2;
  /** Position in CSS pixels relative to the canvas. */
  screen: Vec2;
  button: number;
  buttons: number;
  modifiers: Modifiers;
  pointerType: 'mouse' | 'pen' | 'touch';
  pointerId: number;
  timestamp: number;
  /** Click count for `down` events (2 = double click). */
  detail: number;
  native?: PointerEvent;
}

export interface EditorKeyEvent {
  key: string;
  code: string;
  modifiers: Modifiers;
  repeat: boolean;
  native?: KeyboardEvent;
  preventDefault(): void;
}

export interface OverlayContext {
  ctx: CanvasRenderingContext2D;
  editor: Editor;
  /** Width/height in CSS pixels. */
  width: number;
  height: number;
}

/**
 * Common interface every tool implements. The tool manager routes events to the active tool; tools
 * mutate the document only through editor operations/commands.
 */
export interface EditorTool {
  readonly id: string;
  readonly name: string;
  /** Keyboard shortcut (e.g. "v"). Registered by the tool manager. */
  readonly shortcut?: string;
  /** CSS cursor while this tool is active (tools may override dynamically via editor.setCursor). */
  readonly cursor?: string;

  activate(): void;
  deactivate(): void;

  onPointerDown(event: EditorPointerEvent): void;
  onPointerMove(event: EditorPointerEvent): void;
  onPointerUp(event: EditorPointerEvent): void;
  onDoubleClick?(event: EditorPointerEvent): void;

  /** Return true when the key was consumed (prevents global shortcuts). */
  onKeyDown(event: EditorKeyEvent): boolean | void;
  onKeyUp(event: EditorKeyEvent): boolean | void;

  /** Draws transient tool feedback (previews, marquees) on the overlay canvas in screen space. */
  renderOverlay(context: OverlayContext): void;
}

export interface EditorSettings {
  showGrid: boolean;
  gridSize: number;
  showPixelGrid: boolean;
  showRulers: boolean;
  snapToObjects: boolean;
  snapToGrid: boolean;
  snapToPixels: boolean;
}

export const NO_MODIFIERS: Modifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  mod: false,
};
