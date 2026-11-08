import polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Ring } from 'polygon-clipping';
import { cubicBounds, cubicFlatten } from './bezier';
import type { Rect } from './rect';
import { rect as R } from './rect';
import type { Vec2 } from './vec2';
import { vec2 } from './vec2';

export type PathCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };

/* ---------------------------------------------------------------- SVG path data */

/**
 * Parses SVG path data into absolute M/L/C/Z commands. H, V, S, Q, T and A are converted
 * (quadratics to cubics, arcs to cubic approximations).
 */
export function parseSvgPath(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let cur: Vec2 = { x: 0, y: 0 };
  let start: Vec2 = { x: 0, y: 0 };
  let lastCtrl: Vec2 | null = null;
  let lastQuad: Vec2 | null = null;
  const num = (): number => Number(tokens[i++]);
  const hasNum = (): boolean => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i] as string);

  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        out.push({ type: 'Z' });
        cur = start;
        lastCtrl = lastQuad = null;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const abs = (x: number, y: number): Vec2 => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    switch (cmd.toUpperCase()) {
      case 'M': {
        const p = abs(num(), num());
        out.push({ type: 'M', ...p });
        cur = start = p;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const p = abs(num(), num());
        out.push({ type: 'L', ...p });
        cur = p;
        break;
      }
      case 'H': {
        const x = num();
        const p = { x: rel ? cur.x + x : x, y: cur.y };
        out.push({ type: 'L', ...p });
        cur = p;
        break;
      }
      case 'V': {
        const y = num();
        const p = { x: cur.x, y: rel ? cur.y + y : y };
        out.push({ type: 'L', ...p });
        cur = p;
        break;
      }
      case 'C': {
        const c1 = abs(num(), num());
        const c2 = abs(num(), num());
        const p = abs(num(), num());
        out.push({ type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y });
        lastCtrl = c2;
        cur = p;
        break;
      }
      case 'S': {
        const c1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        const c2 = abs(num(), num());
        const p = abs(num(), num());
        out.push({ type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y });
        lastCtrl = c2;
        cur = p;
        break;
      }
      case 'Q': {
        const q: Vec2 = abs(num(), num());
        const p = abs(num(), num());
        out.push(quadToCubic(cur, q, p));
        lastQuad = q;
        cur = p;
        break;
      }
      case 'T': {
        const q: Vec2 = lastQuad ? { x: 2 * cur.x - lastQuad.x, y: 2 * cur.y - lastQuad.y } : cur;
        const p = abs(num(), num());
        out.push(quadToCubic(cur, q, p));
        lastQuad = q;
        cur = p;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num() !== 0;
        const sweep = num() !== 0;
        const p = abs(num(), num());
        out.push(...arcToCubics(cur, rx, ry, rot, large, sweep, p));
        cur = p;
        break;
      }
      default:
        i++;
    }
    if (cmd.toUpperCase() !== 'C' && cmd.toUpperCase() !== 'S') lastCtrl = null;
    if (cmd.toUpperCase() !== 'Q' && cmd.toUpperCase() !== 'T') lastQuad = null;
    if (!hasNum() && i < tokens.length && !/^[A-Za-z]$/.test(tokens[i] as string)) i++;
  }
  return out;
}

function quadToCubic(p0: Vec2, q: Vec2, p: Vec2): PathCommand {
  return {
    type: 'C',
    x1: p0.x + (2 / 3) * (q.x - p0.x),
    y1: p0.y + (2 / 3) * (q.y - p0.y),
    x2: p.x + (2 / 3) * (q.x - p.x),
    y2: p.y + (2 / 3) * (q.y - p.y),
    x: p.x,
    y: p.y,
  };
}

/** SVG elliptical arc → cubic Béziers (standard endpoint-to-center conversion). */
function arcToCubics(
  from: Vec2,
  rx: number,
  ry: number,
  rotDeg: number,
  large: boolean,
  sweep: boolean,
  to: Vec2,
): PathCommand[] {
  if (rx === 0 || ry === 0) return [{ type: 'L', ...to }];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (from.x + to.x) / 2;
  const cy = sin * cxp + cos * cyp + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dtheta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)));
  const delta = dtheta / segments;
  const t = (4 / 3) * Math.tan(delta / 4);
  const out: PathCommand[] = [];
  let th = theta1;
  let prev = from;
  for (let s = 0; s < segments; s++) {
    const th2 = th + delta;
    const e2 = {
      x: cos * rx * Math.cos(th2) - sin * ry * Math.sin(th2) + cx,
      y: sin * rx * Math.cos(th2) + cos * ry * Math.sin(th2) + cy,
    };
    const d1 = {
      x: -cos * rx * Math.sin(th) - sin * ry * Math.cos(th),
      y: -sin * rx * Math.sin(th) + cos * ry * Math.cos(th),
    };
    const d2 = {
      x: -cos * rx * Math.sin(th2) - sin * ry * Math.cos(th2),
      y: -sin * rx * Math.sin(th2) + cos * ry * Math.cos(th2),
    };
    const end = s === segments - 1 ? to : e2;
    out.push({
      type: 'C',
      x1: prev.x + t * d1.x,
      y1: prev.y + t * d1.y,
      x2: end.x - t * d2.x,
      y2: end.y - t * d2.y,
      x: end.x,
      y: end.y,
    });
    prev = end;
    th = th2;
  }
  return out;
}

const fmt = (n: number): string => String(Number(n.toFixed(3)));

export function pathToSvgD(commands: readonly PathCommand[]): string {
  return commands
    .map((c) => {
      if (c.type === 'M') return `M${fmt(c.x)} ${fmt(c.y)}`;
      if (c.type === 'L') return `L${fmt(c.x)} ${fmt(c.y)}`;
      if (c.type === 'C')
        return `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
      return 'Z';
    })
    .join('');
}

/* ---------------------------------------------------------------- geometry */

export function pathBounds(commands: readonly PathCommand[]): Rect {
  const rects: Rect[] = [];
  let cur: Vec2 = { x: 0, y: 0 };
  for (const c of commands) {
    if (c.type === 'M' || c.type === 'L') {
      rects.push(R.of(c.x, c.y, 0, 0));
      cur = { x: c.x, y: c.y };
    } else if (c.type === 'C') {
      rects.push(cubicBounds(cur, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }));
      cur = { x: c.x, y: c.y };
    }
  }
  return R.unionAll(rects) ?? R.empty();
}

/** Translates a path so its bounds start at (0, 0); returns the offset that was removed. */
export function normalizePath(commands: readonly PathCommand[]): {
  commands: PathCommand[];
  offset: Vec2;
} {
  const b = pathBounds(commands);
  const offset = { x: b.x, y: b.y };
  return { commands: translatePath(commands, { x: -b.x, y: -b.y }), offset };
}

export function translatePath(commands: readonly PathCommand[], d: Vec2): PathCommand[] {
  return commands.map((c) => {
    if (c.type === 'Z') return c;
    if (c.type === 'C')
      return {
        ...c,
        x1: c.x1 + d.x,
        y1: c.y1 + d.y,
        x2: c.x2 + d.x,
        y2: c.y2 + d.y,
        x: c.x + d.x,
        y: c.y + d.y,
      };
    return { ...c, x: c.x + d.x, y: c.y + d.y };
  });
}

export function transformPath(
  commands: readonly PathCommand[],
  apply: (p: Vec2) => Vec2,
): PathCommand[] {
  return commands.map((c) => {
    if (c.type === 'Z') return c;
    if (c.type === 'C') {
      const a = apply({ x: c.x1, y: c.y1 });
      const b = apply({ x: c.x2, y: c.y2 });
      const p = apply({ x: c.x, y: c.y });
      return { type: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: p.x, y: p.y };
    }
    const p = apply({ x: c.x, y: c.y });
    return { ...c, x: p.x, y: p.y };
  });
}

/** Flattens each subpath into a polyline (curves sampled). */
export function pathToPolygons(commands: readonly PathCommand[], segments = 12): Vec2[][] {
  const polys: Vec2[][] = [];
  let current: Vec2[] = [];
  let cur: Vec2 = { x: 0, y: 0 };
  for (const c of commands) {
    if (c.type === 'M') {
      if (current.length > 1) polys.push(current);
      current = [{ x: c.x, y: c.y }];
      cur = { x: c.x, y: c.y };
    } else if (c.type === 'L') {
      cur = { x: c.x, y: c.y };
      current.push(cur);
    } else if (c.type === 'C') {
      const end = { x: c.x, y: c.y };
      current.push(
        ...cubicFlatten(cur, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, end, segments).slice(1),
      );
      cur = end;
    } else if (current.length > 1) {
      polys.push(current);
      current = [cur];
    }
  }
  if (current.length > 1) polys.push(current);
  return polys.map((p) =>
    p.length > 1 && vec2.equals(p[0] as Vec2, p[p.length - 1] as Vec2) ? p.slice(0, -1) : p,
  );
}

export function polygonsToPath(polygons: readonly (readonly Vec2[])[]): PathCommand[] {
  const out: PathCommand[] = [];
  for (const poly of polygons) {
    if (poly.length < 2) continue;
    poly.forEach((p, i) =>
      out.push(i === 0 ? { type: 'M', x: p.x, y: p.y } : { type: 'L', x: p.x, y: p.y }),
    );
    out.push({ type: 'Z' });
  }
  return out;
}

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';

/**
 * Boolean operation over paths (curves are flattened first). The result is a polygonal path with
 * one closed subpath per ring (holes included), suitable for a VECTOR node.
 */
export function booleanPaths(
  op: BooleanOperation,
  paths: readonly (readonly PathCommand[])[],
  segments = 16,
): PathCommand[] {
  const geoms: MultiPolygon[] = paths.map((p) =>
    pathToPolygons(p, segments)
      .filter((poly) => poly.length >= 3)
      .map((poly) => [poly.map((v) => [v.x, v.y] as [number, number])]),
  );
  const [first, ...rest] = geoms;
  if (!first) return [];
  let result: MultiPolygon;
  switch (op) {
    case 'union':
      result = polygonClipping.union(first, ...rest);
      break;
    case 'subtract':
      result = polygonClipping.difference(first, ...rest);
      break;
    case 'intersect':
      result = polygonClipping.intersection(first, ...rest);
      break;
    case 'exclude':
      result = polygonClipping.xor(first, ...rest);
      break;
  }
  const rings: Vec2[][] = [];
  for (const polygon of result)
    for (const ring of polygon as Ring[]) rings.push(ring.map(([x, y]) => ({ x, y })));
  return polygonsToPath(
    rings.map((r) =>
      r.length > 1 && vec2.equals(r[0] as Vec2, r[r.length - 1] as Vec2) ? r.slice(0, -1) : r,
    ),
  );
}

/* ---------------------------------------------------------------- freehand */

/** Ramer–Douglas–Peucker simplification. */
export function simplifyPoints(points: readonly Vec2[], epsilon: number): Vec2[] {
  if (points.length < 3) return [...points];
  const first = points[0] as Vec2;
  const last = points[points.length - 1] as Vec2;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i] as Vec2, first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, index + 1), epsilon);
    const right = simplifyPoints(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpendicularDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return vec2.distance(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Catmull-Rom spline through the points converted to cubic Béziers. */
export function smoothPolyline(points: readonly Vec2[], tension = 0.5): PathCommand[] {
  if (points.length === 0) return [];
  const out: PathCommand[] = [{ type: 'M', x: (points[0] as Vec2).x, y: (points[0] as Vec2).y }];
  if (points.length === 1) return out;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as Vec2;
    const p1 = points[i] as Vec2;
    const p2 = points[i + 1] as Vec2;
    const p3 = points[Math.min(points.length - 1, i + 2)] as Vec2;
    const k = tension / 3;
    out.push({
      type: 'C',
      x1: p1.x + (p2.x - p0.x) * k,
      y1: p1.y + (p2.y - p0.y) * k,
      x2: p2.x - (p3.x - p1.x) * k,
      y2: p2.y - (p3.y - p1.y) * k,
      x: p2.x,
      y: p2.y,
    });
  }
  return out;
}
