import type {
  Editor,
  EditorKeyEvent,
  EditorPointerEvent,
  EditorTool,
  OverlayContext,
} from '@sigma/engine';

/** Convenience base with no-op handlers so tools override only what they need. */
export abstract class BaseTool implements EditorTool {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly shortcut?: string;
  readonly cursor?: string;

  constructor(protected readonly editor: Editor) {}

  activate(): void {}
  deactivate(): void {}
  onPointerDown(_event: EditorPointerEvent): void {}
  onPointerMove(_event: EditorPointerEvent): void {}
  onPointerUp(_event: EditorPointerEvent): void {}
  onKeyDown(_event: EditorKeyEvent): boolean | void {}
  onKeyUp(_event: EditorKeyEvent): boolean | void {}
  onDoubleClick?(event: EditorPointerEvent): void;
  renderOverlay(_context: OverlayContext): void {}
}
