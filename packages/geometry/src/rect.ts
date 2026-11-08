import type { Mat2d } from './mat2d';
import { mat2d } from './mat2d';
import type { Vec2 } from './vec2';

/** Axis-aligned rectangle. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const rect = {
  of(x: number, y: number, width: number, height: number): Rect {
    return { x, y, width, height };
  },
  empty(): Rect {
    return { x: 0, y: 0, width: 0, height: 0 };
  },
  /** Builds a normalized rect from two corner points (handles negative drags). */
  fromPoints(a: Vec2, b: Vec2): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  },
  fromBounds(minX: number, minY: number, maxX: number, maxY: number): Rect {
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  },
  right(r: Rect): number {
    return r.x + r.width;
  },
  bottom(r: Rect): number {
    return r.y + r.height;
  },
  center(r: Rect): Vec2 {
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  },
  corners(r: Rect): [Vec2, Vec2, Vec2, Vec2] {
    return [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ];
  },
  isEmpty(r: Rect): boolean {
    return r.width <= 0 || r.height <= 0;
  },
  containsPoint(r: Rect, p: Vec2): boolean {
    return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
  },
  containsRect(outer: Rect, inner: Rect): boolean {
    return (
      inner.x >= outer.x &&
      inner.y >= outer.y &&
      inner.x + inner.width <= outer.x + outer.width &&
      inner.y + inner.height <= outer.y + outer.height
    );
  },
  intersects(a: Rect, b: Rect): boolean {
    return (
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
  },
  intersection(a: Rect, b: Rect): Rect | null {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  },
  union(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    return { x, y, width: right - x, height: bottom - y };
  },
  unionAll(rects: readonly Rect[]): Rect | null {
    if (rects.length === 0) return null;
    let acc = rects[0] as Rect;
    for (let i = 1; i < rects.length; i++) acc = rect.union(acc, rects[i] as Rect);
    return acc;
  },
  /** Grows (or shrinks with negative amount) a rect on every side. */
  inflate(r: Rect, amount: number): Rect {
    return {
      x: r.x - amount,
      y: r.y - amount,
      width: r.width + amount * 2,
      height: r.height + amount * 2,
    };
  },
  translate(r: Rect, d: Vec2): Rect {
    return { x: r.x + d.x, y: r.y + d.y, width: r.width, height: r.height };
  },
  /** Axis-aligned bounding box of a rect after an affine transform. */
  transformBounds(r: Rect, m: Mat2d): Rect {
    const pts = rect.corners(r).map((p) => mat2d.apply(m, p));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  },
  /** Bounding box of a list of points. */
  boundsOfPoints(points: readonly Vec2[]): Rect {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  },
  equals(a: Rect, b: Rect, epsilon = 1e-9): boolean {
    return (
      Math.abs(a.x - b.x) <= epsilon &&
      Math.abs(a.y - b.y) <= epsilon &&
      Math.abs(a.width - b.width) <= epsilon &&
      Math.abs(a.height - b.height) <= epsilon
    );
  },
  round(r: Rect): Rect {
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  },
};
