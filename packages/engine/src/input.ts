import type { Vec2 } from '@sigma/geometry';
import { pinchDelta, pinchState } from './gestures';
import type { PinchState } from './gestures';
import type { Editor } from './editor';
import type { EditorKeyEvent, EditorPointerEvent, Modifiers, PointerEventType } from './types';

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function modifiersFrom(e: {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): Modifiers {
  return {
    shift: e.shiftKey,
    alt: e.altKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    mod: IS_MAC ? e.metaKey : e.ctrlKey,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Binds DOM pointer/wheel/keyboard events on the overlay canvas to the editor. Converts screen
 * coordinates to world coordinates before anything reaches a tool. Handles pointer capture,
 * space-to-pan, wheel pan/zoom and trackpad pinch (delivered by browsers as ctrl+wheel).
 */
export class InputSystem {
  private disposers: (() => void)[] = [];
  private spaceHeld = false;
  private activePointerId: number | null = null;
  private lastDown: { time: number; x: number; y: number } | null = null;
  /** Active touch points for pinch/pan. */
  private touches = new Map<number, Vec2>();
  private pinch: PinchState | null = null;
  private clickCount = 0;

  constructor(
    private readonly editor: Editor,
    private readonly element: HTMLElement,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K | string,
      handler: (e: never) => void,
      options?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type as string, handler as EventListener, options);
      this.disposers.push(() =>
        target.removeEventListener(type as string, handler as EventListener, options),
      );
    };

    on(element, 'pointerdown', (e: PointerEvent) => this.onPointerDown(e));
    on(element, 'pointermove', (e: PointerEvent) => this.onPointerMove(e));
    on(element, 'pointerup', (e: PointerEvent) => this.onPointerUp(e, 'up'));
    on(element, 'pointercancel', (e: PointerEvent) => this.onPointerUp(e, 'cancel'));
    on(element, 'pointerleave', () => editor.selection.setHover(null));
    on(element, 'wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(element, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(element, 'dragstart', (e: DragEvent) => e.preventDefault());
    on(window, 'keydown', (e: KeyboardEvent) => this.onKeyDown(e));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKeyUp(e));
    on(window, 'blur', () => this.releaseSpace());
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  private toScreen(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.element.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private buildPointer(e: PointerEvent, type: PointerEventType, detail = 1): EditorPointerEvent {
    const screen = this.toScreen(e);
    return {
      type,
      screen,
      world: this.editor.viewport.screenToWorld(screen),
      button: e.button,
      buttons: e.buttons,
      modifiers: modifiersFrom(e),
      pointerType: (e.pointerType as EditorPointerEvent['pointerType']) || 'mouse',
      pointerId: e.pointerId,
      timestamp: e.timeStamp,
      detail,
      native: e,
    };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, this.toScreen(e));
      if (this.touches.size === 2) {
        // Second finger: hand the gesture to pinch/pan and cancel whatever the tool started.
        const [a, b] = [...this.touches.values()] as [Vec2, Vec2];
        this.pinch = pinchState(a, b);
        if (this.activePointerId !== null) {
          this.editor.tools.pointerUp(this.buildPointer(e, 'cancel'));
          this.activePointerId = null;
        }
        return;
      }
    }
    if (this.activePointerId !== null) return; // ignore secondary mouse buttons while dragging
    this.element.focus?.();
    this.activePointerId = e.pointerId;
    this.element.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    const s = this.toScreen(e);
    if (
      this.lastDown &&
      now - this.lastDown.time < 400 &&
      Math.hypot(s.x - this.lastDown.x, s.y - this.lastDown.y) < 4
    ) {
      this.clickCount++;
    } else {
      this.clickCount = 1;
    }
    this.lastDown = { time: now, x: s.x, y: s.y };
    const ev = this.buildPointer(e, 'down', this.clickCount);
    // Middle button always pans.
    if (e.button === 1) {
      this.editor.tools.pushTemporary('hand');
    }
    if (this.clickCount === 2) this.editor.tools.doubleClick(ev);
    else this.editor.tools.pointerDown(ev);
    this.editor.requestOverlay();
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, this.toScreen(e));
      if (this.pinch && this.touches.size >= 2) {
        const [a, b] = [...this.touches.values()] as [Vec2, Vec2];
        const next = pinchState(a, b);
        const d = pinchDelta(this.pinch, next);
        this.editor.viewport.panBy(d.pan.x, d.pan.y);
        this.editor.viewport.zoomBy(d.scale, d.anchor);
        this.pinch = next;
        return;
      }
    }
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    const ev = this.buildPointer(e, 'move');
    this.editor.lastPointerWorld = ev.world;
    this.editor.lastPointerScreen = ev.screen;
    this.editor.tools.pointerMove(ev);
    this.editor.requestOverlay();
  }

  private onPointerUp(e: PointerEvent, type: 'up' | 'cancel'): void {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        if (this.touches.size < 2) this.pinch = null;
        return;
      }
    }
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.element.releasePointerCapture?.(e.pointerId);
    const ev = this.buildPointer(e, type);
    this.editor.tools.pointerUp(ev);
    if (e.button === 1 && this.editor.tools.isTemporary && !this.spaceHeld)
      this.editor.tools.popTemporary();
    this.editor.history.markBoundary();
    this.editor.requestOverlay();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const screen = this.toScreen(e);
    const vp = this.editor.viewport;
    const mods = modifiersFrom(e);
    if (mods.ctrl || mods.meta) {
      // Zoom (ctrl+wheel is also how browsers report trackpad pinch).
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      vp.zoomBy(factor, screen);
    } else {
      const scale = e.deltaMode === 1 ? 16 : 1;
      let dx = e.deltaX * scale;
      let dy = e.deltaY * scale;
      if (mods.shift && dx === 0) {
        dx = dy;
        dy = 0;
      }
      vp.panBy(-dx, -dy);
    }
    this.editor.lastPointerScreen = screen;
    this.editor.lastPointerWorld = vp.screenToWorld(screen);
  }

  private buildKey(e: KeyboardEvent): EditorKeyEvent {
    return {
      key: e.key,
      code: e.code,
      modifiers: modifiersFrom(e),
      repeat: e.repeat,
      native: e,
      preventDefault: () => e.preventDefault(),
    };
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (isEditableTarget(e.target)) return;
    if (e.code === 'Space' && !e.repeat) {
      if (!this.spaceHeld && this.activePointerId === null) {
        this.spaceHeld = true;
        this.editor.tools.pushTemporary('hand');
      }
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      return;
    }
    const ev = this.buildKey(e);
    if (this.editor.tools.keyDown(ev)) {
      e.preventDefault();
      return;
    }
    if (this.editor.keymap.handle(ev)) e.preventDefault();
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this.releaseSpace();
      return;
    }
    if (isEditableTarget(e.target)) return;
    this.editor.tools.keyUp(this.buildKey(e));
  }

  private releaseSpace(): void {
    if (!this.spaceHeld) return;
    this.spaceHeld = false;
    if (this.activePointerId === null) this.editor.tools.popTemporary();
    else this.pendingPop = true;
  }

  private pendingPop = false;
}
