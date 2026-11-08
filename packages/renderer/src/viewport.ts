import type { Mat2d, Rect, Vec2 } from '@sigma/geometry';
import { mat2d } from '@sigma/geometry';
import { Emitter, clamp } from '@sigma/shared';

export interface ViewportState {
  zoom: number;
  /** Screen-space translation: screen = world * zoom + offset. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface ViewportEvents extends Record<string, unknown> {
  change: ViewportState;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 256;

/**
 * Camera over the world coordinate system. World geometry never changes when zooming; only this
 * transform does: screenPoint = viewportMatrix × worldPoint.
 */
export class Viewport {
  readonly events = new Emitter<ViewportEvents>();
  private state: ViewportState = {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    width: 0,
    height: 0,
    devicePixelRatio: 1,
  };

  get zoom(): number {
    return this.state.zoom;
  }
  get offsetX(): number {
    return this.state.offsetX;
  }
  get offsetY(): number {
    return this.state.offsetY;
  }
  get width(): number {
    return this.state.width;
  }
  get height(): number {
    return this.state.height;
  }
  get devicePixelRatio(): number {
    return this.state.devicePixelRatio;
  }

  getState(): ViewportState {
    return { ...this.state };
  }

  setState(partial: Partial<ViewportState>): void {
    const next = { ...this.state, ...partial };
    next.zoom = clamp(next.zoom, MIN_ZOOM, MAX_ZOOM);
    if (
      next.zoom === this.state.zoom &&
      next.offsetX === this.state.offsetX &&
      next.offsetY === this.state.offsetY &&
      next.width === this.state.width &&
      next.height === this.state.height &&
      next.devicePixelRatio === this.state.devicePixelRatio
    ) {
      return;
    }
    this.state = next;
    this.events.emit('change', this.getState());
  }

  setSize(width: number, height: number, devicePixelRatio = this.state.devicePixelRatio): void {
    this.setState({ width, height, devicePixelRatio });
  }

  /** World → screen matrix (CSS pixels). */
  getMatrix(): Mat2d {
    const { zoom, offsetX, offsetY } = this.state;
    return mat2d.of(zoom, 0, 0, zoom, offsetX, offsetY);
  }

  getInverseMatrix(): Mat2d {
    const { zoom, offsetX, offsetY } = this.state;
    return mat2d.of(1 / zoom, 0, 0, 1 / zoom, -offsetX / zoom, -offsetY / zoom);
  }

  worldToScreen(p: Vec2): Vec2 {
    const { zoom, offsetX, offsetY } = this.state;
    return { x: p.x * zoom + offsetX, y: p.y * zoom + offsetY };
  }

  screenToWorld(p: Vec2): Vec2 {
    const { zoom, offsetX, offsetY } = this.state;
    return { x: (p.x - offsetX) / zoom, y: (p.y - offsetY) / zoom };
  }

  worldRectToScreen(r: Rect): Rect {
    const { zoom, offsetX, offsetY } = this.state;
    return {
      x: r.x * zoom + offsetX,
      y: r.y * zoom + offsetY,
      width: r.width * zoom,
      height: r.height * zoom,
    };
  }

  screenRectToWorld(r: Rect): Rect {
    const { zoom, offsetX, offsetY } = this.state;
    return {
      x: (r.x - offsetX) / zoom,
      y: (r.y - offsetY) / zoom,
      width: r.width / zoom,
      height: r.height / zoom,
    };
  }

  /** The world-space rectangle currently visible. */
  getVisibleWorldRect(): Rect {
    return this.screenRectToWorld({
      x: 0,
      y: 0,
      width: this.state.width,
      height: this.state.height,
    });
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.setState({
      offsetX: this.state.offsetX + dxScreen,
      offsetY: this.state.offsetY + dyScreen,
    });
  }

  /** Sets zoom while keeping the world point under `anchorScreen` fixed. */
  zoomTo(
    zoom: number,
    anchorScreen: Vec2 = { x: this.state.width / 2, y: this.state.height / 2 },
  ): void {
    const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const worldAtAnchor = this.screenToWorld(anchorScreen);
    this.setState({
      zoom: next,
      offsetX: anchorScreen.x - worldAtAnchor.x * next,
      offsetY: anchorScreen.y - worldAtAnchor.y * next,
    });
  }

  zoomBy(factor: number, anchorScreen?: Vec2): void {
    this.zoomTo(this.state.zoom * factor, anchorScreen);
  }

  /** Centers a world point on screen. */
  centerOn(world: Vec2): void {
    this.setState({
      offsetX: this.state.width / 2 - world.x * this.state.zoom,
      offsetY: this.state.height / 2 - world.y * this.state.zoom,
    });
  }

  /** Fits a world rect into the viewport with padding (CSS px). */
  fitRect(r: Rect, padding = 48, maxZoom = 1): void {
    if (this.state.width === 0 || this.state.height === 0) return;
    const availW = Math.max(1, this.state.width - padding * 2);
    const availH = Math.max(1, this.state.height - padding * 2);
    const zoom =
      r.width <= 0 || r.height <= 0 ? 1 : Math.min(availW / r.width, availH / r.height, maxZoom);
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.setState({
      zoom: z,
      offsetX: this.state.width / 2 - (r.x + r.width / 2) * z,
      offsetY: this.state.height / 2 - (r.y + r.height / 2) * z,
    });
  }

  reset(): void {
    this.setState({ zoom: 1, offsetX: 0, offsetY: 0 });
  }
}
