import { describe, expect, it } from 'vitest';
import {
  cubicBounds,
  cubicPoint,
  distanceToSegment,
  lineIntersection,
  mat2d,
  pointInEllipse,
  pointInPolygon,
  pointInRect,
  rect,
  regularPolygonPoints,
  segmentIntersection,
  SpatialIndex,
  vec2,
} from '../index';

describe('vec2', () => {
  it('performs basic arithmetic', () => {
    expect(vec2.add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(vec2.sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
    expect(vec2.scale({ x: 1, y: 2 }, 3)).toEqual({ x: 3, y: 6 });
    expect(vec2.dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    expect(vec2.length({ x: 3, y: 4 })).toBe(5);
    expect(vec2.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('rotates around an origin', () => {
    const p = vec2.rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
    const q = vec2.rotate({ x: 2, y: 1 }, Math.PI, { x: 1, y: 1 });
    expect(q.x).toBeCloseTo(0);
    expect(q.y).toBeCloseTo(1);
  });
  it('normalizes and handles zero vectors', () => {
    expect(vec2.normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(vec2.length(vec2.normalize({ x: 3, y: 4 }))).toBeCloseTo(1);
  });
});

describe('mat2d', () => {
  it('multiplies in the right order (translate then scale)', () => {
    const m = mat2d.multiply(mat2d.scaling(2), mat2d.translation(10, 0));
    expect(mat2d.apply(m, { x: 1, y: 1 })).toEqual({ x: 22, y: 2 });
  });
  it('inverts', () => {
    const m = mat2d.fromTransform({ x: 10, y: 20, rotation: 30, scaleX: 2, scaleY: 0.5 });
    const inv = mat2d.invert(m);
    const p = { x: 7, y: -3 };
    const back = mat2d.apply(inv, mat2d.apply(m, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
    expect(mat2d.equals(mat2d.multiply(m, inv), mat2d.identity(), 1e-9)).toBe(true);
  });
  it('throws on a singular matrix', () => {
    expect(() => mat2d.invert(mat2d.scaling(0, 1))).toThrow();
  });
  it('round-trips transform decomposition', () => {
    const t = { x: 5, y: 6, rotation: 45, scaleX: 1.5, scaleY: 2 };
    const d = mat2d.toTransform(mat2d.fromTransform(t));
    expect(d.x).toBeCloseTo(5);
    expect(d.y).toBeCloseTo(6);
    expect(d.rotation).toBeCloseTo(45);
    expect(d.scaleX).toBeCloseTo(1.5);
    expect(d.scaleY).toBeCloseTo(2);
  });
  it('rotation is clockwise in y-down space', () => {
    const m = mat2d.fromTransform({ x: 0, y: 0, rotation: 90, scaleX: 1, scaleY: 1 });
    const p = mat2d.apply(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
});

describe('rect', () => {
  it('normalizes from points', () => {
    expect(rect.fromPoints({ x: 10, y: 10 }, { x: 0, y: 5 })).toEqual({
      x: 0,
      y: 5,
      width: 10,
      height: 5,
    });
  });
  it('computes union, intersection and containment', () => {
    const a = rect.of(0, 0, 10, 10);
    const b = rect.of(5, 5, 10, 10);
    expect(rect.union(a, b)).toEqual({ x: 0, y: 0, width: 15, height: 15 });
    expect(rect.intersection(a, b)).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(rect.intersection(a, rect.of(20, 20, 1, 1))).toBeNull();
    expect(rect.intersects(a, b)).toBe(true);
    expect(rect.containsRect(rect.of(0, 0, 100, 100), a)).toBe(true);
    expect(rect.containsRect(a, b)).toBe(false);
  });
  it('transforms bounds through rotation', () => {
    const r = rect.of(0, 0, 10, 10);
    const b = rect.transformBounds(r, mat2d.rotation(Math.PI / 4));
    const diag = 10 * Math.SQRT2;
    expect(b.width).toBeCloseTo(diag);
    expect(b.height).toBeCloseTo(diag);
  });
});

describe('hit tests', () => {
  it('point in rect with tolerance', () => {
    const r = rect.of(0, 0, 10, 10);
    expect(pointInRect({ x: 5, y: 5 }, r)).toBe(true);
    expect(pointInRect({ x: 11, y: 5 }, r)).toBe(false);
    expect(pointInRect({ x: 11, y: 5 }, r, 2)).toBe(true);
  });
  it('point in ellipse', () => {
    const r = rect.of(0, 0, 20, 10);
    expect(pointInEllipse({ x: 10, y: 5 }, r)).toBe(true);
    expect(pointInEllipse({ x: 0.5, y: 0.5 }, r)).toBe(false);
    expect(pointInEllipse({ x: 20, y: 5 }, r)).toBe(true);
  });
  it('point in polygon', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 2, y: 2 }, tri)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 8 }, tri)).toBe(false);
    const hex = regularPolygonPoints(rect.of(0, 0, 10, 10), 6);
    expect(hex).toHaveLength(6);
    expect(pointInPolygon({ x: 5, y: 5 }, hex)).toBe(true);
  });
  it('distance to segment and intersections', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toEqual({ x: 5, y: 5 });
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 2 }),
    ).toBeNull();
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBeNull();
  });
});

describe('bezier', () => {
  it('evaluates endpoints', () => {
    const p0 = { x: 0, y: 0 };
    const p3 = { x: 10, y: 0 };
    expect(cubicPoint(p0, { x: 0, y: 5 }, { x: 10, y: 5 }, p3, 0)).toEqual(p0);
    expect(cubicPoint(p0, { x: 0, y: 5 }, { x: 10, y: 5 }, p3, 1)).toEqual(p3);
  });
  it('computes tight bounds', () => {
    const b = cubicBounds({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 });
    expect(b.x).toBeCloseTo(0);
    expect(b.width).toBeCloseTo(10);
    expect(b.y).toBeCloseTo(0);
    expect(b.height).toBeCloseTo(7.5);
  });
});

describe('SpatialIndex', () => {
  it('inserts, searches, updates and removes', () => {
    const idx = new SpatialIndex<string>(100);
    idx.insert('a', rect.of(0, 0, 50, 50));
    idx.insert('b', rect.of(500, 500, 50, 50));
    idx.insert('c', rect.of(90, 90, 20, 20)); // straddles cells
    expect(idx.search(rect.of(0, 0, 10, 10))).toEqual(['a']);
    expect(idx.searchPoint(95, 95)).toEqual(['c']);
    expect(idx.search(rect.of(0, 0, 1000, 1000)).sort()).toEqual(['a', 'b', 'c']);
    idx.update('a', rect.of(600, 600, 10, 10));
    expect(idx.search(rect.of(0, 0, 10, 10))).toEqual([]);
    expect(idx.searchPoint(605, 605)).toEqual(['a']);
    idx.remove('a');
    expect(idx.has('a')).toBe(false);
    expect(idx.size).toBe(2);
  });
  it('handles zero-size rects (lines)', () => {
    const idx = new SpatialIndex<string>(100);
    idx.insert('line', rect.of(10, 10, 100, 0));
    expect(idx.searchPoint(50, 10, 2)).toEqual(['line']);
  });
});
