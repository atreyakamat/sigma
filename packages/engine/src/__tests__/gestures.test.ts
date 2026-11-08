import { describe, expect, it } from 'vitest';
import { Viewport } from '@sigma/renderer';
import { pinchDelta, pinchState } from '../gestures';

describe('pinch gestures', () => {
  it('computes zoom around the midpoint and pans with the midpoint', () => {
    const prev = pinchState({ x: 100, y: 100 }, { x: 200, y: 100 });
    const next = pinchState({ x: 80, y: 120 }, { x: 240, y: 120 });
    const d = pinchDelta(prev, next);
    expect(d.scale).toBeCloseTo(1.6);
    expect(d.pan).toEqual({ x: 10, y: 20 });
    expect(d.anchor).toEqual({ x: 160, y: 120 });
    const vp = new Viewport();
    vp.setSize(800, 600);
    const before = vp.screenToWorld(prev.center);
    vp.panBy(d.pan.x, d.pan.y);
    vp.zoomBy(d.scale, d.anchor);
    expect(vp.zoom).toBeCloseTo(1.6);
    // The world point that was under the old midpoint is now under the new midpoint.
    const after = vp.screenToWorld(next.center);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it('clamps extreme scale jumps', () => {
    expect(
      pinchDelta(
        pinchState({ x: 0, y: 0 }, { x: 1, y: 0 }),
        pinchState({ x: 0, y: 0 }, { x: 100, y: 0 }),
      ).scale,
    ).toBe(4);
    expect(
      pinchDelta(
        pinchState({ x: 0, y: 0 }, { x: 0, y: 0 }),
        pinchState({ x: 0, y: 0 }, { x: 10, y: 0 }),
      ).scale,
    ).toBe(1);
  });
});
