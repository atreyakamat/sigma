import type { Color, NodeJSON, Paint, Stroke } from '@sigma/document';
import { hexToColor } from '@sigma/document';
import type { Mat2d, Vec2 } from '@sigma/geometry';
import { mat2d, normalizePath, parseSvgPath, pathBounds, transformPath } from '@sigma/geometry';
import { createId } from '@sigma/shared';
import { parseXml } from './xml';
import type { XmlElement } from './xml';

export interface SvgImportResult {
  width: number;
  height: number;
  nodes: NodeJSON[];
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  transparent: 'none',
};

export function parseCssColor(value: string | undefined): Color | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent' || v.startsWith('url(')) return null;
  const named = NAMED[v];
  if (named) return named === 'none' ? null : hexToColor(named);
  if (v.startsWith('#')) return hexToColor(v);
  const m =
    /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      v,
    );
  if (m) {
    const ch = (s: string): number =>
      s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s) / 255;
    const a = m[4] ? (m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    return { r: ch(m[1] as string), g: ch(m[2] as string), b: ch(m[3] as string), a };
  }
  return null;
}

interface Style {
  fill: string | undefined;
  fillOpacity: number;
  stroke: string | undefined;
  strokeOpacity: number;
  strokeWidth: number;
  opacity: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
}

const DEFAULT_STYLE: Style = {
  fill: '#000000',
  fillOpacity: 1,
  stroke: undefined,
  strokeOpacity: 1,
  strokeWidth: 1,
  opacity: 1,
  fontSize: 16,
  fontFamily: 'Inter',
  fontWeight: 400,
};

function styleOf(el: XmlElement, parent: Style): Style {
  const a = { ...el.attrs };
  for (const decl of (a.style ?? '').split(';')) {
    const [k, v] = decl.split(':').map((s) => s.trim());
    if (k && v) a[k] = v;
  }
  const num = (k: string, fallback: number): number =>
    a[k] !== undefined && !Number.isNaN(parseFloat(a[k] as string))
      ? parseFloat(a[k] as string)
      : fallback;
  return {
    fill: a.fill !== undefined ? a.fill : parent.fill,
    fillOpacity: num('fill-opacity', parent.fillOpacity),
    stroke: a.stroke !== undefined ? a.stroke : parent.stroke,
    strokeOpacity: num('stroke-opacity', parent.strokeOpacity),
    strokeWidth: num('stroke-width', parent.strokeWidth),
    opacity: num('opacity', 1) * (el.name === 'g' ? 1 : 1), // element opacity (groups carry their own)
    fontSize: num('font-size', parent.fontSize),
    fontFamily: (a['font-family'] ?? parent.fontFamily).split(',')[0]!.replace(/["']/g, '').trim(),
    fontWeight: a['font-weight'] === 'bold' ? 700 : num('font-weight', parent.fontWeight),
  };
}

/** Parses an SVG transform attribute into a matrix. */
export function parseSvgTransform(value: string | undefined): Mat2d {
  let m = mat2d.identity();
  if (!value) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(value))) {
    const args = (t[2] as string)
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let next = mat2d.identity();
    switch (t[1]) {
      case 'matrix':
        next = mat2d.of(
          args[0] ?? 1,
          args[1] ?? 0,
          args[2] ?? 0,
          args[3] ?? 1,
          args[4] ?? 0,
          args[5] ?? 0,
        );
        break;
      case 'translate':
        next = mat2d.translation(args[0] ?? 0, args[1] ?? 0);
        break;
      case 'scale':
        next = mat2d.scaling(args[0] ?? 1, args[1] ?? args[0] ?? 1);
        break;
      case 'rotate': {
        const r = mat2d.rotation(((args[0] ?? 0) * Math.PI) / 180);
        next =
          args.length >= 3
            ? mat2d.compose(
                mat2d.translation(args[1] as number, args[2] as number),
                r,
                mat2d.translation(-(args[1] as number), -(args[2] as number)),
              )
            : r;
        break;
      }
      case 'skewX':
        next = mat2d.of(1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0);
        break;
      case 'skewY':
        next = mat2d.of(1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0);
        break;
    }
    m = mat2d.multiply(m, next);
  }
  return m;
}

function paintsFor(s: Style, opacityMul = 1): { fills: Paint[]; strokes: Stroke[] } {
  const fills: Paint[] = [];
  const strokes: Stroke[] = [];
  const f = parseCssColor(s.fill);
  if (f)
    fills.push({
      type: 'SOLID',
      color: f,
      opacity: Math.min(1, s.fillOpacity * opacityMul),
      visible: true,
    });
  const st = parseCssColor(s.stroke);
  if (st && s.strokeWidth > 0)
    strokes.push({
      paint: { type: 'SOLID', color: st, opacity: s.strokeOpacity, visible: true },
      width: s.strokeWidth,
      align: 'CENTER',
      cap: 'BUTT',
      join: 'MITER',
      dashPattern: [],
      visible: true,
    });
  return { fills, strokes };
}

/**
 * Converts SVG markup into SIGMA nodes. Shapes keep their geometry; transforms are baked into
 * node positions (uniformly scaled shapes keep their type, anything else becomes a VECTOR).
 */
export function importSvg(markup: string): SvgImportResult {
  const root = parseXml(markup);
  const svg = root.children.find((c) => c.name === 'svg');
  if (!svg) throw new Error('The file is not an SVG document');
  const viewBox = (svg.attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  const width = parseFloat(svg.attrs.width ?? '') || viewBox[2] || 100;
  const height = parseFloat(svg.attrs.height ?? '') || viewBox[3] || 100;
  let base = mat2d.identity();
  if (viewBox.length === 4 && viewBox[2] && viewBox[3]) {
    base = mat2d.compose(
      mat2d.scaling(width / viewBox[2], height / viewBox[3]),
      mat2d.translation(-(viewBox[0] ?? 0), -(viewBox[1] ?? 0)),
    );
  }
  const nodes = svg.children
    .flatMap((el) => convert(el, base, DEFAULT_STYLE))
    .filter((n): n is NodeJSON => !!n);
  return { width, height, nodes };
}

function convert(el: XmlElement, parentMatrix: Mat2d, parentStyle: Style): NodeJSON[] {
  if (
    [
      'defs',
      'style',
      'title',
      'desc',
      'metadata',
      'clipPath',
      'mask',
      'symbol',
      'linearGradient',
      'radialGradient',
      'pattern',
      'filter',
    ].includes(el.name)
  )
    return [];
  const style = styleOf(el, parentStyle);
  const matrix = mat2d.multiply(parentMatrix, parseSvgTransform(el.attrs.transform));
  const n = (k: string, d = 0): number =>
    el.attrs[k] !== undefined ? parseFloat(el.attrs[k] as string) : d;
  const id = createId();
  const opacity = Math.min(1, style.opacity);

  if (el.name === 'g' || el.name === 'svg' || el.name === 'a') {
    const children = el.children.flatMap((c) => convert(c, matrix, { ...style, opacity: 1 }));
    if (children.length === 0) return [];
    return [
      { id, type: 'GROUP', name: el.attrs.id ?? 'Group', style: { opacity }, children } as NodeJSON,
    ];
  }

  const placed = (
    type: NodeJSON['type'],
    local: { x: number; y: number; width: number; height: number },
    extra: Record<string, unknown> = {},
  ): NodeJSON[] => {
    // Bake the matrix: if it is a similarity transform, keep the shape type; otherwise fall back to a vector.
    const t = mat2d.toTransform(matrix);
    const uniform =
      Math.abs(Math.abs(t.scaleX) - Math.abs(t.scaleY)) < 1e-6 &&
      Math.abs(matrix.a * matrix.c + matrix.b * matrix.d) < 1e-6;
    const { fills, strokes } = paintsFor(style);
    const scale = Math.abs(t.scaleX);
    if (!uniform) return [vectorFromRect(local, matrix, style, opacity, id, el.attrs.id)];
    const origin = mat2d.apply(matrix, { x: local.x, y: local.y });
    return [
      {
        id,
        type,
        name: el.attrs.id ?? type.charAt(0) + type.slice(1).toLowerCase(),
        transform: { x: origin.x, y: origin.y, rotation: t.rotation, scaleX: 1, scaleY: 1 },
        size: { width: local.width * scale, height: local.height * scale },
        style: {
          fills,
          strokes: strokes.map((s) => ({ ...s, width: s.width * scale })),
          opacity,
          ...(extra.cornerRadius !== undefined
            ? { cornerRadius: (extra.cornerRadius as number) * scale }
            : {}),
        },
        ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'cornerRadius')),
      } as NodeJSON,
    ];
  };

  switch (el.name) {
    case 'rect':
      return placed(
        'RECTANGLE',
        { x: n('x'), y: n('y'), width: n('width'), height: n('height') },
        { cornerRadius: n('rx', n('ry')) },
      );
    case 'circle': {
      const r = n('r');
      return placed('ELLIPSE', { x: n('cx') - r, y: n('cy') - r, width: r * 2, height: r * 2 });
    }
    case 'ellipse': {
      const rx = n('rx');
      const ry = n('ry');
      return placed('ELLIPSE', { x: n('cx') - rx, y: n('cy') - ry, width: rx * 2, height: ry * 2 });
    }
    case 'line': {
      const a = mat2d.apply(matrix, { x: n('x1'), y: n('y1') });
      const b = mat2d.apply(matrix, { x: n('x2'), y: n('y2') });
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const { strokes } = paintsFor({ ...style, stroke: style.stroke ?? '#000000' });
      return [
        {
          id,
          type: 'LINE',
          name: el.attrs.id ?? 'Line',
          transform: {
            x: a.x,
            y: a.y,
            rotation: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
            scaleX: 1,
            scaleY: 1,
          },
          size: { width: len, height: 0 },
          style: { fills: [], strokes, opacity },
        } as unknown as NodeJSON,
      ];
    }
    case 'polygon':
    case 'polyline': {
      const pts = (el.attrs.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      const d =
        pts.reduce(
          (acc, v, i) => (i % 2 === 0 ? `${acc}${i === 0 ? 'M' : 'L'}${v} ` : `${acc}${v} `),
          '',
        ) + (el.name === 'polygon' ? 'Z' : '');
      return [vectorFromPath(parseSvgPath(d), matrix, style, opacity, id, el.attrs.id)];
    }
    case 'path':
      return [
        vectorFromPath(parseSvgPath(el.attrs.d ?? ''), matrix, style, opacity, id, el.attrs.id),
      ];
    case 'text': {
      const text = (el.text + el.children.map((c) => c.text).join('')).replace(/\s+/g, ' ').trim();
      if (!text) return [];
      const t = mat2d.toTransform(matrix);
      const scale = Math.abs(t.scaleX) || 1;
      const fontSize = style.fontSize * scale;
      const origin = mat2d.apply(matrix, { x: n('x'), y: n('y') - style.fontSize * 0.8 });
      const { fills } = paintsFor(style);
      return [
        {
          id,
          type: 'TEXT',
          name: text.slice(0, 40),
          characters: text,
          transform: { x: origin.x, y: origin.y, rotation: t.rotation, scaleX: 1, scaleY: 1 },
          size: { width: Math.max(1, text.length * fontSize * 0.55), height: fontSize * 1.2 },
          autoResize: 'WIDTH_AND_HEIGHT',
          textStyle: { fontFamily: style.fontFamily, fontSize, fontWeight: style.fontWeight },
          style: { fills, opacity },
        } as NodeJSON,
      ];
    }
    case 'image':
    case 'use':
    default:
      return [];
  }
}

function vectorFromRect(
  local: { x: number; y: number; width: number; height: number },
  matrix: Mat2d,
  style: Style,
  opacity: number,
  id: string,
  name?: string,
): NodeJSON {
  const d = `M${local.x} ${local.y}L${local.x + local.width} ${local.y}L${local.x + local.width} ${local.y + local.height}L${local.x} ${local.y + local.height}Z`;
  return vectorFromPath(parseSvgPath(d), matrix, style, opacity, id, name);
}

function vectorFromPath(
  commands: ReturnType<typeof parseSvgPath>,
  matrix: Mat2d,
  style: Style,
  opacity: number,
  id: string,
  name?: string,
): NodeJSON {
  const world = transformPath(commands, (p: Vec2) => mat2d.apply(matrix, p));
  const { commands: path, offset } = normalizePath(world);
  const b = pathBounds(path);
  const { fills, strokes } = paintsFor(style);
  const closed = path.some((c) => c.type === 'Z');
  return {
    id,
    type: 'VECTOR',
    name: name ?? 'Vector',
    transform: { x: offset.x, y: offset.y, rotation: 0, scaleX: 1, scaleY: 1 },
    size: { width: b.width, height: b.height },
    path,
    style: { fills: closed ? fills : [], strokes, opacity },
  } as NodeJSON;
}
