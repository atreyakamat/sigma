import type { Rect } from './rect';
import type { Vec2 } from './vec2';
import { vec2 } from './vec2';

/** Point inside axis-aligned rect, with optional tolerance (in the same units as the point). */
export function pointInRect(p: Vec2, r: Rect, tolerance = 0): boolean {
  return (
    p.x >= r.x - tolerance &&
    p.x <= r.x + r.width + tolerance &&
    p.y >= r.y - tolerance &&
    p.y <= r.y + r.height + tolerance
  );
}

/** Point inside an ellipse inscribed in `r`. */
export function pointInEllipse(p: Vec2, r: Rect, tolerance = 0): boolean {
  const rx = r.width / 2 + tolerance;
  const ry = r.height / 2 + tolerance;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (p.x - (r.x + r.width / 2)) / rx;
  const dy = (p.y - (r.y + r.height / 2)) / ry;
  return dx * dx + dy * dy <= 1;
}

/** Point inside a simple polygon (even-odd rule). */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i] as Vec2;
    const b = polygon[j] as Vec2;
    const intersect =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Shortest distance from a point to a line segment. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = vec2.sub(b, a);
  const lenSq = vec2.lengthSq(ab);
  if (lenSq === 0) return vec2.distance(p, a);
  let t = vec2.dot(vec2.sub(p, a), ab) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return vec2.distance(p, vec2.add(a, vec2.scale(ab, t)));
}

/** Point within `tolerance` of a polyline. */
export function pointNearPolyline(
  p: Vec2,
  points: readonly Vec2[],
  tolerance: number,
  closed = false,
): boolean {
  const n = points.length;
  if (n === 0) return false;
  if (n === 1) return vec2.distance(p, points[0] as Vec2) <= tolerance;
  const limit = closed ? n : n - 1;
  for (let i = 0; i < limit; i++) {
    if (distanceToSegment(p, points[i] as Vec2, points[(i + 1) % n] as Vec2) <= tolerance)
      return true;
  }
  return false;
}

/** Intersection point of two infinite lines (p1→p2, p3→p4), or null if parallel. */
export function lineIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

/** Intersection point of two segments, or null if they do not cross. */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

/** Signed area of a polygon (positive = counter-clockwise in y-up, clockwise in y-down screen space). */
export function polygonArea(polygon: readonly Vec2[]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[j] as Vec2;
    const b = polygon[i] as Vec2;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Regular polygon vertices inscribed in a rect, starting at the top. */
export function regularPolygonPoints(r: Rect, sides: number): Vec2[] {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const rx = r.width / 2;
  const ry = r.height / 2;
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return pts;
}

/** Star vertices inscribed in a rect. `innerRatio` is inner radius / outer radius. */
export function starPoints(r: Rect, points: number, innerRatio: number): Vec2[] {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const rx = r.width / 2;
  const ry = r.height / 2;
  const pts: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const k = i % 2 === 0 ? 1 : innerRatio;
    pts.push({ x: cx + rx * k * Math.cos(angle), y: cy + ry * k * Math.sin(angle) });
  }
  return pts;
}
