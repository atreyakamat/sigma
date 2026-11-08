import type { PathCommand } from '@sigma/geometry';
import { regularPolygonPoints, starPoints } from '@sigma/geometry';
import type { SceneNode } from './nodes';

const KAPPA = 0.5522847498;

/** The outline of a shape node as path commands in its local space (origin top-left). */
export function nodeLocalPath(node: SceneNode): PathCommand[] {
  const w = node.size.width;
  const h = node.size.height;
  switch (node.type) {
    case 'VECTOR':
      return node.path as PathCommand[];
    case 'LINE':
      return [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: w, y: 0 },
      ];
    case 'ELLIPSE': {
      const rx = w / 2;
      const ry = h / 2;
      const cx = rx;
      const cy = ry;
      const ox = rx * KAPPA;
      const oy = ry * KAPPA;
      return [
        { type: 'M', x: cx + rx, y: cy },
        { type: 'C', x1: cx + rx, y1: cy + oy, x2: cx + ox, y2: cy + ry, x: cx, y: cy + ry },
        { type: 'C', x1: cx - ox, y1: cy + ry, x2: cx - rx, y2: cy + oy, x: cx - rx, y: cy },
        { type: 'C', x1: cx - rx, y1: cy - oy, x2: cx - ox, y2: cy - ry, x: cx, y: cy - ry },
        { type: 'C', x1: cx + ox, y1: cy - ry, x2: cx + rx, y2: cy - oy, x: cx + rx, y: cy },
        { type: 'Z' },
      ];
    }
    case 'POLYGON':
    case 'STAR': {
      const pts =
        node.type === 'POLYGON'
          ? regularPolygonPoints({ x: 0, y: 0, width: w, height: h }, node.pointCount)
          : starPoints({ x: 0, y: 0, width: w, height: h }, node.pointCount, node.innerRadius);
      return [
        ...pts.map((p, i) =>
          i === 0 ? { type: 'M' as const, x: p.x, y: p.y } : { type: 'L' as const, x: p.x, y: p.y },
        ),
        { type: 'Z' },
      ];
    }
    default: {
      const r = node.style.cornerRadius;
      const radii = (typeof r === 'number' ? [r, r, r, r] : r).map((v) =>
        Math.min(v, w / 2, h / 2),
      ) as [number, number, number, number];
      const [tl, tr, br, bl] = radii;
      if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
        return [
          { type: 'M', x: 0, y: 0 },
          { type: 'L', x: w, y: 0 },
          { type: 'L', x: w, y: h },
          { type: 'L', x: 0, y: h },
          { type: 'Z' },
        ];
      }
      const k = KAPPA;
      return [
        { type: 'M', x: tl, y: 0 },
        { type: 'L', x: w - tr, y: 0 },
        { type: 'C', x1: w - tr + tr * k, y1: 0, x2: w, y2: tr - tr * k, x: w, y: tr },
        { type: 'L', x: w, y: h - br },
        { type: 'C', x1: w, y1: h - br + br * k, x2: w - br + br * k, y2: h, x: w - br, y: h },
        { type: 'L', x: bl, y: h },
        { type: 'C', x1: bl - bl * k, y1: h, x2: 0, y2: h - bl + bl * k, x: 0, y: h - bl },
        { type: 'L', x: 0, y: tl },
        { type: 'C', x1: 0, y1: tl - tl * k, x2: tl - tl * k, y2: 0, x: tl, y: 0 },
        { type: 'Z' },
      ];
    }
  }
}
