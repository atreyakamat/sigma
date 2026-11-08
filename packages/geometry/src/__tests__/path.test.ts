import { describe, expect, it } from 'vitest';
import {
  parseSvgPath,
  pathBounds,
  pathToPolygons,
  pathToSvgD,
  polygonsToPath,
  booleanPaths,
  normalizePath,
  simplifyPoints,
  smoothPolyline,
} from '../path';

describe('parseSvgPath', () => {
  it('parses absolute and relative commands including H, V, S, Q, T and Z', () => {
    const cmds = parseSvgPath('M10 10 h 20 V 30 L 10 30 z');
    expect(cmds).toEqual([
      { type: 'M', x: 10, y: 10 },
      { type: 'L', x: 30, y: 10 },
      { type: 'L', x: 30, y: 30 },
      { type: 'L', x: 10, y: 30 },
      { type: 'Z' },
    ]);
    const curves = parseSvgPath('M0 0 C 10 0 10 10 0 10 S -10 20 0 20 Q 5 25 10 20 T 20 20');
    expect(curves.filter((c) => c.type === 'C')).toHaveLength(4); // S, Q and T are converted to cubics
    expect(curves[curves.length - 1]).toMatchObject({ type: 'C', x: 20, y: 20 });
  });
  it('approximates arcs with cubics and handles implicit lineto after moveto', () => {
    const arc = parseSvgPath('M0 0 A 10 10 0 0 1 20 0');
    expect(arc[0]).toEqual({ type: 'M', x: 0, y: 0 });
    expect(arc.length).toBeGreaterThan(1);
    expect(arc[arc.length - 1]).toMatchObject({ type: 'C', x: 20, y: 0 });
    expect(parseSvgPath('M1 2 3 4 5 6')).toEqual([
      { type: 'M', x: 1, y: 2 },
      { type: 'L', x: 3, y: 4 },
      { type: 'L', x: 5, y: 6 },
    ]);
    expect(parseSvgPath('M1,2L3,-4.5e1')).toEqual([
      { type: 'M', x: 1, y: 2 },
      { type: 'L', x: 3, y: -45 },
    ]);
  });
  it('round-trips through pathToSvgD', () => {
    const d = 'M0 0L10 0C10 5 5 10 0 10Z';
    expect(pathToSvgD(parseSvgPath(d))).toBe(d);
  });
});

describe('path geometry', () => {
  it('computes tight bounds and normalizes to the origin', () => {
    const cmds = parseSvgPath('M10 20 L 30 20 L 30 50 Z');
    expect(pathBounds(cmds)).toEqual({ x: 10, y: 20, width: 20, height: 30 });
    const { commands, offset } = normalizePath(cmds);
    expect(offset).toEqual({ x: 10, y: 20 });
    expect(pathBounds(commands)).toEqual({ x: 0, y: 0, width: 20, height: 30 });
  });
  it('flattens to polygons per subpath', () => {
    const polys = pathToPolygons(parseSvgPath('M0 0 L10 0 L10 10 Z M20 20 L30 20 L30 30 Z'));
    expect(polys).toHaveLength(2);
    expect(polys[0]).toHaveLength(3);
  });
});

describe('boolean operations', () => {
  const a = parseSvgPath('M0 0 L10 0 L10 10 L0 10 Z');
  const b = parseSvgPath('M5 5 L15 5 L15 15 L5 15 Z');
  const area = (polys: { x: number; y: number }[][]) =>
    polys.reduce(
      (sum, p) =>
        sum +
        Math.abs(
          p.reduce((s, q, i) => {
            const r = p[(i + 1) % p.length]!;
            return s + q.x * r.y - r.x * q.y;
          }, 0) / 2,
        ),
      0,
    );
  it('union, subtract, intersect and exclude produce the expected areas', () => {
    expect(area(pathToPolygons(booleanPaths('union', [a, b])))).toBeCloseTo(175);
    expect(area(pathToPolygons(booleanPaths('subtract', [a, b])))).toBeCloseTo(75);
    expect(area(pathToPolygons(booleanPaths('intersect', [a, b])))).toBeCloseTo(25);
    expect(area(pathToPolygons(booleanPaths('exclude', [a, b])))).toBeCloseTo(150);
  });
  it('returns closed paths and keeps holes as separate rings', () => {
    const outer = parseSvgPath('M0 0 L30 0 L30 30 L0 30 Z');
    const inner = parseSvgPath('M10 10 L20 10 L20 20 L10 20 Z');
    const ring = booleanPaths('subtract', [outer, inner]);
    expect(ring.filter((c) => c.type === 'Z')).toHaveLength(2);
    expect(area(pathToPolygons(ring))).toBeCloseTo(900 + 100); // two rings, absolute areas
    expect(
      polygonsToPath([
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      ]),
    ).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 1, y: 0 },
      { type: 'L', x: 1, y: 1 },
      { type: 'Z' },
    ]);
  });
});

describe('freehand helpers', () => {
  it('simplifies a polyline (Ramer–Douglas–Peucker) and smooths it into cubics', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i % 2 === 0 ? 0 : 0.2 }));
    const simple = simplifyPoints(pts, 0.5);
    expect(simple.length).toBeLessThan(5);
    expect(simple[0]).toEqual(pts[0]);
    expect(simple[simple.length - 1]).toEqual(pts[pts.length - 1]);
    const smooth = smoothPolyline([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(smooth[0]).toEqual({ type: 'M', x: 0, y: 0 });
    expect(smooth.slice(1).every((c) => c.type === 'C')).toBe(true);
    expect(smooth[smooth.length - 1]).toMatchObject({ x: 20, y: 0 });
  });
});
