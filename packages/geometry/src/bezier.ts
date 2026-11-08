import type { Rect } from './rect';
import { rect } from './rect';
import type { Vec2 } from './vec2';

/** Point on a cubic Bézier at parameter t. */
export function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Point on a quadratic Bézier at parameter t. */
export function quadraticPoint(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/** Splits a cubic Bézier at t using de Casteljau's algorithm. */
export function cubicSplit(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  t: number,
): [[Vec2, Vec2, Vec2, Vec2], [Vec2, Vec2, Vec2, Vec2]] {
  const lerp = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p01 = lerp(p0, p1);
  const p12 = lerp(p1, p2);
  const p23 = lerp(p2, p3);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const mid = lerp(p012, p123);
  return [
    [p0, p01, p012, mid],
    [mid, p123, p23, p3],
  ];
}

/** Flattens a cubic Bézier into a polyline with `segments` steps (including both endpoints). */
export function cubicFlatten(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, segments = 16): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= segments; i++) pts.push(cubicPoint(p0, p1, p2, p3, i / segments));
  return pts;
}

/** Tight axis-aligned bounds of a cubic Bézier (solves the derivative roots). */
export function cubicBounds(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Rect {
  const ts: number[] = [0, 1];
  for (const axis of ['x', 'y'] as const) {
    const a = -p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis];
    const b = 2 * (p0[axis] - 2 * p1[axis] + p2[axis]);
    const c = -p0[axis] + p1[axis];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) > 1e-12) ts.push(-c / b);
      continue;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
  }
  const pts = ts.filter((t) => t >= 0 && t <= 1).map((t) => cubicPoint(p0, p1, p2, p3, t));
  return rect.boundsOfPoints(pts);
}

/** Approximate arc length of a cubic Bézier via flattening. */
export function cubicLength(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, segments = 32): number {
  const pts = cubicFlatten(p0, p1, p2, p3, segments);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Vec2;
    const b = pts[i] as Vec2;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}
