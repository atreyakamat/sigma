import type { Vec2 } from './vec2';

/**
 * 2D affine matrix in column-major order, matching CanvasRenderingContext2D.setTransform(a, b, c, d, e, f):
 *
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 */
export interface Mat2d {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export interface TransformProps {
  x: number;
  y: number;
  /** Rotation in degrees, clockwise in screen space (y-down). */
  rotation: number;
  scaleX: number;
  scaleY: number;
}

const DEG = Math.PI / 180;

export const mat2d = {
  identity(): Mat2d {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  },
  of(a: number, b: number, c: number, d: number, e: number, f: number): Mat2d {
    return { a, b, c, d, e, f };
  },
  translation(x: number, y: number): Mat2d {
    return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
  },
  scaling(sx: number, sy: number = sx): Mat2d {
    return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
  },
  rotation(radians: number): Mat2d {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  },
  /** Returns m1 × m2 (apply m2 first, then m1). */
  multiply(m1: Mat2d, m2: Mat2d): Mat2d {
    return {
      a: m1.a * m2.a + m1.c * m2.b,
      b: m1.b * m2.a + m1.d * m2.b,
      c: m1.a * m2.c + m1.c * m2.d,
      d: m1.b * m2.c + m1.d * m2.d,
      e: m1.a * m2.e + m1.c * m2.f + m1.e,
      f: m1.b * m2.e + m1.d * m2.f + m1.f,
    };
  },
  compose(...matrices: Mat2d[]): Mat2d {
    return matrices.reduce((acc, m) => mat2d.multiply(acc, m), mat2d.identity());
  },
  determinant(m: Mat2d): number {
    return m.a * m.d - m.b * m.c;
  },
  invert(m: Mat2d): Mat2d {
    const det = m.a * m.d - m.b * m.c;
    if (det === 0) throw new Error('Matrix is not invertible');
    const inv = 1 / det;
    return {
      a: m.d * inv,
      b: -m.b * inv,
      c: -m.c * inv,
      d: m.a * inv,
      e: (m.c * m.f - m.d * m.e) * inv,
      f: (m.b * m.e - m.a * m.f) * inv,
    };
  },
  apply(m: Mat2d, p: Vec2): Vec2 {
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  },
  /** Applies only the linear part (no translation) — for directions and deltas. */
  applyVector(m: Mat2d, v: Vec2): Vec2 {
    return { x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y };
  },
  /** Builds a node-local matrix: translate(x, y) · rotate(rotation) · scale(sx, sy). */
  fromTransform(t: TransformProps): Mat2d {
    const r = t.rotation * DEG;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return {
      a: cos * t.scaleX,
      b: sin * t.scaleX,
      c: -sin * t.scaleY,
      d: cos * t.scaleY,
      e: t.x,
      f: t.y,
    };
  },
  /** Decomposes a matrix back into translate/rotate/scale (assumes no skew). */
  toTransform(m: Mat2d): TransformProps {
    const scaleX = Math.hypot(m.a, m.b);
    const scaleY = (m.a * m.d - m.b * m.c) / (scaleX || 1);
    const rotation = Math.atan2(m.b, m.a) / DEG;
    return { x: m.e, y: m.f, rotation, scaleX, scaleY };
  },
  equals(m1: Mat2d, m2: Mat2d, epsilon = 1e-9): boolean {
    return (
      Math.abs(m1.a - m2.a) <= epsilon &&
      Math.abs(m1.b - m2.b) <= epsilon &&
      Math.abs(m1.c - m2.c) <= epsilon &&
      Math.abs(m1.d - m2.d) <= epsilon &&
      Math.abs(m1.e - m2.e) <= epsilon &&
      Math.abs(m1.f - m2.f) <= epsilon
    );
  },
  isIdentity(m: Mat2d): boolean {
    return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
  },
  /** Uniform scale factor (geometric mean of axis scales). Useful for stroke widths under a view transform. */
  scaleFactor(m: Mat2d): number {
    return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  },
};
