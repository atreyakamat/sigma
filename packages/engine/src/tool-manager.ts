import { Emitter } from '@sigma/shared';
import type { EditorKeyEvent, EditorPointerEvent, EditorTool, OverlayContext } from './types';

export interface ToolManagerEvents extends Record<string, unknown> {
  change: { id: string | null; previous: string | null };
  register: { id: string };
}

/**
 * Registry and dispatcher for tools. Exactly one tool is active; a temporary tool (e.g. hand while
 * space is held) can be pushed on top and popped to restore the previous one.
 */
export class ToolManager {
  readonly events = new Emitter<ToolManagerEvents>();
  private tools = new Map<string, EditorTool>();
  private active: EditorTool | null = null;
  private stack: EditorTool[] = [];

  register(tool: EditorTool): void {
    if (this.tools.has(tool.id)) throw new Error(`Tool "${tool.id}" is already registered`);
    this.tools.set(tool.id, tool);
    this.events.emit('register', { id: tool.id });
  }

  get(id: string): EditorTool | undefined {
    return this.tools.get(id);
  }

  list(): EditorTool[] {
    return [...this.tools.values()];
  }

  get activeTool(): EditorTool | null {
    return this.active;
  }

  get activeId(): string | null {
    return this.active?.id ?? null;
  }

  activate(id: string): void {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Unknown tool "${id}"`);
    if (this.active === tool) return;
    const previous = this.active?.id ?? null;
    this.active?.deactivate();
    this.stack = [];
    this.active = tool;
    tool.activate();
    this.events.emit('change', { id, previous });
  }

  /** Temporarily switches to a tool; `popTemporary` restores the previous one. */
  pushTemporary(id: string): void {
    const tool = this.tools.get(id);
    if (!tool || this.active === tool) return;
    const previous = this.active;
    previous?.deactivate();
    if (previous) this.stack.push(previous);
    this.active = tool;
    tool.activate();
    this.events.emit('change', { id, previous: previous?.id ?? null });
  }

  popTemporary(): void {
    const previous = this.stack.pop();
    if (!previous) return;
    const current = this.active?.id ?? null;
    this.active?.deactivate();
    this.active = previous;
    previous.activate();
    this.events.emit('change', { id: previous.id, previous: current });
  }

  get isTemporary(): boolean {
    return this.stack.length > 0;
  }

  pointerDown(e: EditorPointerEvent): void {
    this.active?.onPointerDown(e);
  }
  pointerMove(e: EditorPointerEvent): void {
    this.active?.onPointerMove(e);
  }
  pointerUp(e: EditorPointerEvent): void {
    this.active?.onPointerUp(e);
  }
  doubleClick(e: EditorPointerEvent): void {
    this.active?.onDoubleClick?.(e);
  }
  keyDown(e: EditorKeyEvent): boolean {
    return this.active?.onKeyDown(e) === true;
  }
  keyUp(e: EditorKeyEvent): boolean {
    return this.active?.onKeyUp(e) === true;
  }
  renderOverlay(ctx: OverlayContext): void {
    this.active?.renderOverlay(ctx);
  }
}
