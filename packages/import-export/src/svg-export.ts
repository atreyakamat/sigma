import type { Color, Paint, SceneGraph, SceneNode, Stroke } from '@sigma/document';
import { colorToHex } from '@sigma/document';
import { mat2d, rect as R, regularPolygonPoints, starPoints } from '@sigma/geometry';
import type { Rect } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { applyTextTransform, layoutText } from '@sigma/renderer';

export interface SvgExportOptions {
  /** Include an XML prolog (for files) — omit for inline SVG. */
  prolog?: boolean;
  /** Extra margin around the content in world units. */
  padding?: number;
  /** Round numbers to this many decimals. */
  precision?: number;
}

class SvgWriter {
  private defs: string[] = [];
  private defId = 0;
  constructor(private readonly precision: number) {}

  n(v: number): string {
    const r = Number(v.toFixed(this.precision));
    return Object.is(r, -0) ? '0' : String(r);
  }

  addDef(markup: string): string {
    const id = `s${++this.defId}`;
    this.defs.push(markup.replace('{id}', id));
    return id;
  }

  getDefs(): string {
    return this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '';
  }
}

export function escapeXml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string,
  );
}

function colorAttr(c: Color, opacity: number): { color: string; opacity: number } {
  return { color: colorToHex(c), opacity: c.a * opacity };
}

function paintAttrs(w: SvgWriter, paint: Paint, bounds: Rect, kind: 'fill' | 'stroke'): string {
  switch (paint.type) {
    case 'SOLID': {
      const { color, opacity } = colorAttr(paint.color, paint.opacity);
      return `${kind}="${color}"${opacity < 1 ? ` ${kind}-opacity="${w.n(opacity)}"` : ''}`;
    }
    case 'LINEAR_GRADIENT': {
      const stops = paint.stops
        .map(
          (s) =>
            `<stop offset="${w.n(s.position)}" stop-color="${colorToHex(s.color)}" stop-opacity="${w.n(s.color.a * paint.opacity)}"/>`,
        )
        .join('');
      const id = w.addDef(
        `<linearGradient id="{id}" x1="${w.n(paint.start.x)}" y1="${w.n(paint.start.y)}" x2="${w.n(paint.end.x)}" y2="${w.n(paint.end.y)}">${stops}</linearGradient>`,
      );
      return `${kind}="url(#${id})"`;
    }
    case 'RADIAL_GRADIENT': {
      const stops = paint.stops
        .map(
          (s) =>
            `<stop offset="${w.n(s.position)}" stop-color="${colorToHex(s.color)}" stop-opacity="${w.n(s.color.a * paint.opacity)}"/>`,
        )
        .join('');
      const id = w.addDef(
        `<radialGradient id="{id}" cx="${w.n(paint.center.x)}" cy="${w.n(paint.center.y)}" r="${w.n(paint.radius)}">${stops}</radialGradient>`,
      );
      return `${kind}="url(#${id})"`;
    }
    case 'IMAGE': {
      if (!paint.src) return `${kind}="none"`;
      const id = w.addDef(
        `<pattern id="{id}" patternUnits="userSpaceOnUse" x="${w.n(bounds.x)}" y="${w.n(bounds.y)}" width="${w.n(bounds.width)}" height="${w.n(bounds.height)}"><image href="${escapeXml(paint.src)}" width="${w.n(bounds.width)}" height="${w.n(bounds.height)}" preserveAspectRatio="${paint.scaleMode === 'FIT' ? 'xMidYMid meet' : paint.scaleMode === 'STRETCH' ? 'none' : 'xMidYMid slice'}"/></pattern>`,
      );
      return `${kind}="url(#${id})"`;
    }
  }
}

function strokeAttrs(w: SvgWriter, stroke: Stroke, bounds: Rect): string {
  const parts = [
    paintAttrs(w, stroke.paint, bounds, 'stroke'),
    `stroke-width="${w.n(stroke.width)}"`,
  ];
  if (stroke.cap !== 'BUTT') parts.push(`stroke-linecap="${stroke.cap.toLowerCase()}"`);
  if (stroke.join !== 'MITER') parts.push(`stroke-linejoin="${stroke.join.toLowerCase()}"`);
  if (stroke.dashPattern.length)
    parts.push(`stroke-dasharray="${stroke.dashPattern.map((d) => w.n(d)).join(' ')}"`);
  return parts.join(' ');
}

/** Geometry element (without fill/stroke attributes) for a node in its local space. */
function geometry(
  w: SvgWriter,
  node: SceneNode,
  bounds: Rect,
): { tag: string; attrs: string } | null {
  const { x, y, width, height } = bounds;
  switch (node.type) {
    case 'FRAME':
    case 'COMPONENT':
    case 'COMPONENT_SET':
    case 'INSTANCE':
    case 'RECTANGLE':
    case 'IMAGE': {
      const r = node.style.cornerRadius;
      const radius = typeof r === 'number' ? r : Math.max(...r);
      return {
        tag: 'rect',
        attrs: `x="${w.n(x)}" y="${w.n(y)}" width="${w.n(width)}" height="${w.n(height)}"${radius ? ` rx="${w.n(radius)}"` : ''}`,
      };
    }
    case 'ELLIPSE':
      return {
        tag: 'ellipse',
        attrs: `cx="${w.n(x + width / 2)}" cy="${w.n(y + height / 2)}" rx="${w.n(width / 2)}" ry="${w.n(height / 2)}"`,
      };
    case 'LINE':
      return {
        tag: 'line',
        attrs: `x1="${w.n(x)}" y1="${w.n(y)}" x2="${w.n(x + width)}" y2="${w.n(y)}"`,
      };
    case 'POLYGON':
    case 'STAR': {
      const pts =
        node.type === 'POLYGON'
          ? regularPolygonPoints(bounds, node.pointCount)
          : starPoints(bounds, node.pointCount, node.innerRadius);
      return {
        tag: 'polygon',
        attrs: `points="${pts.map((p) => `${w.n(p.x)},${w.n(p.y)}`).join(' ')}"`,
      };
    }
    case 'VECTOR': {
      const d = node.path
        .map((c) => {
          if (c.type === 'M') return `M${w.n(c.x)} ${w.n(c.y)}`;
          if (c.type === 'L') return `L${w.n(c.x)} ${w.n(c.y)}`;
          if (c.type === 'C')
            return `C${w.n(c.x1)} ${w.n(c.y1)} ${w.n(c.x2)} ${w.n(c.y2)} ${w.n(c.x)} ${w.n(c.y)}`;
          return 'Z';
        })
        .join('');
      return { tag: 'path', attrs: `d="${d}"` };
    }
    default:
      return null;
  }
}

function effectsFilter(w: SvgWriter, node: SceneNode): string {
  const parts: string[] = [];
  for (const e of node.style.effects) {
    if (!e.visible) continue;
    if (e.type === 'DROP_SHADOW') {
      parts.push(
        `<feDropShadow dx="${w.n(e.offset.x)}" dy="${w.n(e.offset.y)}" stdDeviation="${w.n(e.blur / 2)}" flood-color="${colorToHex(e.color)}" flood-opacity="${w.n(e.color.a)}"/>`,
      );
    } else if (e.radius > 0) {
      parts.push(`<feGaussianBlur stdDeviation="${w.n(e.radius / 2)}"/>`);
    }
  }
  if (parts.length === 0) return '';
  const id = w.addDef(
    `<filter id="{id}" x="-50%" y="-50%" width="200%" height="200%">${parts.join('')}</filter>`,
  );
  return ` filter="url(#${id})"`;
}

function nodeToSvg(w: SvgWriter, graph: SceneGraph, node: SceneNode): string {
  if (!node.visible) return '';
  const bounds = graph.getLocalBounds(node.id);
  const m = mat2d.fromTransform(node.transform);
  const transform = mat2d.isIdentity(m)
    ? ''
    : ` transform="matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => w.n(v)).join(' ')})"`;
  const opacity = node.style.opacity < 1 ? ` opacity="${w.n(node.style.opacity)}"` : '';
  const blend =
    node.style.blendMode !== 'NORMAL'
      ? ` style="mix-blend-mode:${node.style.blendMode.toLowerCase().replace('_', '-')}"`
      : '';
  const filter = effectsFilter(w, node);
  const name = ` data-name="${escapeXml(node.name)}"`;
  const children = node.childIds.map((cid) => nodeToSvg(w, graph, graph.requireNode(cid))).join('');

  if (node.type === 'GROUP')
    return `<g${transform}${opacity}${blend}${filter}${name}>${children}</g>`;

  if (node.type === 'TEXT') {
    const layout = layoutText(node);
    const s = node.textStyle;
    const fill = node.style.fills.find((f) => f.visible);
    const fillAttr = fill ? paintAttrs(w, fill, bounds, 'fill') : 'fill="none"';
    const anchor = s.textAlign === 'CENTER' ? 'middle' : s.textAlign === 'RIGHT' ? 'end' : 'start';
    const boxW = node.autoResize === 'WIDTH_AND_HEIGHT' ? layout.width : bounds.width;
    const ax = s.textAlign === 'CENTER' ? boxW / 2 : s.textAlign === 'RIGHT' ? boxW : 0;
    let yStart = 0;
    if (s.verticalAlign === 'MIDDLE') yStart = (bounds.height - layout.height) / 2;
    else if (s.verticalAlign === 'BOTTOM') yStart = bounds.height - layout.height;
    const leading = (layout.lineHeightPx - s.fontSize) / 2;
    const ascent = s.fontSize * 0.8;
    const deco =
      s.textDecoration === 'UNDERLINE'
        ? ' text-decoration="underline"'
        : s.textDecoration === 'STRIKETHROUGH'
          ? ' text-decoration="line-through"'
          : '';
    const tspans = layout.lines
      .map(
        (line, i) =>
          `<tspan x="${w.n(ax)}" y="${w.n(yStart + i * layout.lineHeightPx + leading + ascent)}">${escapeXml(applyTextTransform(line.text, 'NONE'))}</tspan>`,
      )
      .join('');
    return `<text${transform}${opacity}${blend}${filter}${name} font-family="${escapeXml(s.fontFamily)}" font-size="${w.n(s.fontSize)}" font-weight="${s.fontWeight}"${s.fontStyle === 'ITALIC' ? ' font-style="italic"' : ''}${s.letterSpacing ? ` letter-spacing="${w.n(s.letterSpacing)}"` : ''} text-anchor="${anchor}"${deco} ${fillAttr}>${tspans}</text>`;
  }

  const geo = geometry(w, node, bounds);
  if (!geo) return '';
  const fills = node.type === 'IMAGE' ? [node.image, ...node.style.fills] : node.style.fills;
  const visibleFills = fills.filter((f) => f.visible);
  const visibleStrokes = node.style.strokes.filter((s) => s.visible && s.width > 0);
  const elements: string[] = [];
  if (visibleFills.length === 0 && visibleStrokes.length === 0 && node.childIds.length === 0) {
    elements.push(`<${geo.tag} ${geo.attrs} fill="none"/>`);
  }
  for (const fill of visibleFills)
    elements.push(`<${geo.tag} ${geo.attrs} ${paintAttrs(w, fill, bounds, 'fill')}/>`);
  for (const stroke of visibleStrokes) {
    // SVG strokes are centered; emulate inside/outside with a clip or double width + mask-free approximation.
    if (stroke.align === 'CENTER' || node.type === 'LINE' || node.type === 'VECTOR') {
      elements.push(`<${geo.tag} ${geo.attrs} fill="none" ${strokeAttrs(w, stroke, bounds)}/>`);
    } else if (stroke.align === 'INSIDE') {
      const clipId = w.addDef(`<clipPath id="{id}"><${geo.tag} ${geo.attrs}/></clipPath>`);
      elements.push(
        `<${geo.tag} ${geo.attrs} fill="none" clip-path="url(#${clipId})" ${strokeAttrs(w, { ...stroke, width: stroke.width * 2 }, bounds)}/>`,
      );
    } else {
      const maskId = w.addDef(
        `<mask id="{id}"><rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/><${geo.tag} ${geo.attrs} fill="black"/></mask>`,
      );
      elements.push(
        `<${geo.tag} ${geo.attrs} fill="none" mask="url(#${maskId})" ${strokeAttrs(w, { ...stroke, width: stroke.width * 2 }, bounds)}/>`,
      );
    }
  }

  let childMarkup = children;
  if (
    (node.type === 'FRAME' ||
      node.type === 'COMPONENT' ||
      node.type === 'COMPONENT_SET' ||
      node.type === 'INSTANCE') &&
    node.clipsContent &&
    children
  ) {
    const clipId = w.addDef(`<clipPath id="{id}"><${geo.tag} ${geo.attrs}/></clipPath>`);
    childMarkup = `<g clip-path="url(#${clipId})">${children}</g>`;
  }
  // Order: fills, children, strokes (matches the canvas renderer).
  const fillPart = elements
    .slice(0, visibleFills.length || (elements.length && !visibleStrokes.length ? 1 : 0))
    .join('');
  const strokePart = elements.slice(fillPart ? visibleFills.length || 1 : 0).join('');
  return `<g${transform}${opacity}${blend}${filter}${name}>${fillPart}${childMarkup}${strokePart}</g>`;
}

/** Exports nodes (or a whole page) as an SVG document string. */
export function exportSvg(
  graph: SceneGraph,
  ids: readonly NodeId[],
  options: SvgExportOptions = {},
): string {
  const w = new SvgWriter(options.precision ?? 3);
  const padding = options.padding ?? 0;
  const roots = ids.flatMap((id) => {
    const n = graph.requireNode(id);
    return n.type === 'PAGE' ? [...n.childIds] : [id];
  });
  const bounds = R.inflate(
    R.unionAll(roots.map((id) => graph.getWorldBounds(id))) ?? R.of(0, 0, 1, 1),
    padding,
  );
  const body = roots
    .map((id) => {
      const node = graph.requireNode(id);
      const pm = node.parentId ? graph.getWorldMatrix(node.parentId) : mat2d.identity();
      const markup = nodeToSvg(w, graph, node);
      if (mat2d.isIdentity(pm)) return markup;
      return `<g transform="matrix(${[pm.a, pm.b, pm.c, pm.d, pm.e, pm.f].map((v) => w.n(v)).join(' ')})">${markup}</g>`;
    })
    .join('');
  const viewBox = `${w.n(bounds.x)} ${w.n(bounds.y)} ${w.n(bounds.width)} ${w.n(bounds.height)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.n(bounds.width)}" height="${w.n(bounds.height)}" viewBox="${viewBox}">${w.getDefs()}${body}</svg>`;
  return options.prolog ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}` : svg;
}
