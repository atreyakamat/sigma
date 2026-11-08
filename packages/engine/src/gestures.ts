import type { Vec2 } from '@sigma/geometry';

export interface PinchState {
  /** Midpoint of the two pointers in screen space. */
  center: Vec2;
  /** Distance between the two pointers. */
  distance: number;
}

export function pinchState(a: Vec2, b: Vec2): PinchState {
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(a.x - b.x, a.y - b.y),
  };
}

/**
 * Given the previous and current two-finger state, returns how the viewport should change: a zoom
 * factor applied around the current midpoint and a pan delta (midpoint movement).
 */
export function pinchDelta(
  prev: PinchState,
  next: PinchState,
): { scale: number; pan: Vec2; anchor: Vec2 } {
  const scale = prev.distance > 0 ? next.distance / prev.distance : 1;
  return {
    scale: Math.min(4, Math.max(0.25, scale)),
    pan: { x: next.center.x - prev.center.x, y: next.center.y - prev.center.y },
    anchor: next.center,
  };
}
