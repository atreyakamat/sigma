import { describe, expect, it } from 'vitest';
import { Viewport, MIN_ZOOM, MAX_ZOOM } from '../viewport';
import { layoutText } from '../text';
import { createNodeProps } from '@sigma/document';

describe('Viewport', () => {
  it('converts between world and screen', () => {
    const v = new Viewport();
    v.setSize(800, 600);
    v.setState({ zoom: 2, offsetX: 100, offsetY: 50 });
    expect(v.worldToScreen({ x: 10, y: 10 })).toEqual({ x: 120, y: 70 });
    expect(v.screenToWorld({ x: 120, y: 70 })).toEqual({ x: 10, y: 10 });
    expect(v.getVisibleWorldRect()).toEqual({ x: -50, y: -25, width: 400, height: 300 });
  });

  it('zooms around an anchor without moving the world point under it', () => {
    const v = new Viewport();
    v.setSize(800, 600);
    const anchor = { x: 200, y: 150 };
    const before = v.screenToWorld(anchor);
    v.zoomBy(3, anchor);
    const after = v.screenToWorld(anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(v.zoom).toBe(3);
  });

  it('clamps zoom', () => {
    const v = new Viewport();
    v.setSize(100, 100);
    v.zoomTo(1e9);
    expect(v.zoom).toBe(MAX_ZOOM);
    v.zoomTo(0);
    expect(v.zoom).toBe(MIN_ZOOM);
  });

  it('fits a rect', () => {
    const v = new Viewport();
    v.setSize(1000, 500);
    v.fitRect({ x: 0, y: 0, width: 2000, height: 500 }, 0, 10);
    expect(v.zoom).toBeCloseTo(0.5);
    expect(v.worldToScreen({ x: 1000, y: 250 })).toEqual({ x: 500, y: 250 });
  });

  it('emits change only when state differs', () => {
    const v = new Viewport();
    let n = 0;
    v.events.on('change', () => n++);
    v.panBy(0, 0);
    v.panBy(1, 0);
    v.panBy(1, 0);
    expect(n).toBe(2);
  });
});

describe('layoutText (node fallback measurement)', () => {
  it('splits on newlines without wrapping in auto-width mode', () => {
    const node = createNodeProps('TEXT', {
      characters: 'Hello\nWorld',
      size: { width: 10, height: 10 },
    });
    const layout = layoutText(node);
    expect(layout.lines.map((l) => l.text)).toEqual(['Hello', 'World']);
    expect(layout.height).toBeCloseTo(16 * 1.2 * 2);
  });
  it('wraps words in fixed-width mode', () => {
    const node = createNodeProps('TEXT', {
      characters: 'one two three four',
      autoResize: 'HEIGHT',
      size: { width: 60, height: 10 },
    });
    const layout = layoutText(node);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.every((l) => l.width <= 60 || !l.text.includes(' '))).toBe(true);
  });
});
