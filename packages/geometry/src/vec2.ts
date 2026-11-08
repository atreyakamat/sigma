export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = {
  of(x: number, y: number): Vec2 {
    return { x, y };
  },
  zero(): Vec2 {
    return { x: 0, y: 0 };
  },
  add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },
  sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
  },
  scale(a: Vec2, s: number): Vec2 {
    return { x: a.x * s, y: a.y * s };
  },
  mul(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x * b.x, y: a.y * b.y };
  },
  neg(a: Vec2): Vec2 {
    return { x: -a.x, y: -a.y };
  },
  dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
  },
  cross(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x;
  },
  length(a: Vec2): number {
    return Math.hypot(a.x, a.y);
  },
  lengthSq(a: Vec2): number {
    return a.x * a.x + a.y * a.y;
  },
  distance(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  },
  normalize(a: Vec2): Vec2 {
    const len = Math.hypot(a.x, a.y);
    return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
  },
  lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  },
  /** Rotates a point around an origin by `radians`. */
  rotate(a: Vec2, radians: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = a.x - origin.x;
    const dy = a.y - origin.y;
    return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos };
  },
  perpendicular(a: Vec2): Vec2 {
    return { x: -a.y, y: a.x };
  },
  angle(a: Vec2): number {
    return Math.atan2(a.y, a.x);
  },
  equals(a: Vec2, b: Vec2, epsilon = 1e-9): boolean {
    return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
  },
  round(a: Vec2, precision = 1): Vec2 {
    return {
      x: Math.round(a.x / precision) * precision,
      y: Math.round(a.y / precision) * precision,
    };
  },
  min(a: Vec2, b: Vec2): Vec2 {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  },
  max(a: Vec2, b: Vec2): Vec2 {
    return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  },
};
