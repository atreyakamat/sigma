import type { BlendMode, Paint, SceneGraph, SceneNode, Stroke, TextProps } from '@sigma/document';
import { colorToCss } from '@sigma/document';
import type { Rect } from '@sigma/geometry';
import { mat2d, rect as R, regularPolygonPoints, starPoints } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import type { ImageCache } from './image-cache';
import { cssFont, layoutText } from './text';

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  graph: SceneGraph;
  images: ImageCache;
  /** World-space rect used for culling; nodes whose bounds miss it are skipped. */
  cullRect: Rect | null;
  hiddenNodeIds?: ReadonlySet<NodeId>;
  stats: { drawn: number; culled: number };
  /** Current zoom; used to keep hairlines visible. */
  zoom: number;
}

const BLEND_MODES: Record<BlendMode, GlobalCompositeOperation> = {
  NORMAL: 'source-over',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn',
  HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
};

/** Extra world-space margin around a node's bounds that effects/strokes may paint into. */
export function paintMargin(node: SceneNode): number {
  let m = 0;
  for (const s of node.style.strokes)
    if (s.visible) m = Math.max(m, s.align === 'INSIDE' ? 0 : s.width);
  for (const e of node.style.effects) {
    if (!e.visible) continue;
    if (e.type === 'DROP_SHADOW')
      m = Math.max(m, e.blur * 2 + Math.abs(e.offset.x) + Math.abs(e.offset.y) + e.spread);
    else m = Math.max(m, e.radius * 2);
  }
  return m;
}

/** Appends the node's outline (in local coordinates) to the current path. Returns false if the node has no fillable geometry. */
export function buildNodePath(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  bounds: Rect,
): boolean {
  const { x, y, width: w, height: h } = bounds;
  switch (node.type) {
    case 'PAGE':
    case 'FRAME':
    case 'RECTANGLE':
    case 'IMAGE':
    case 'GROUP':
    case 'TEXT': {
      const r = node.style.cornerRadius;
      const radii = typeof r === 'number' ? [r, r, r, r] : r;
      const max = Math.min(w, h) / 2;
      const [tl, tr, br, bl] = radii.map((v) => Math.min(v, max)) as [
        number,
        number,
        number,
        number,
      ];
      if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
        ctx.rect(x, y, w, h);
      } else {
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
        ctx.lineTo(x + w, y + h - br);
        if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
        ctx.lineTo(x + bl, y + h);
        if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
        ctx.lineTo(x, y + tl);
        if (tl) ctx.arcTo(x, y, x + tl, y, tl);
        ctx.closePath();
      }
      return true;
    }
    case 'ELLIPSE':
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
      return true;
    case 'LINE':
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      return false;
    case 'POLYGON':
    case 'STAR': {
      const pts =
        node.type === 'POLYGON'
          ? regularPolygonPoints(bounds, node.pointCount)
          : starPoints(bounds, node.pointCount, node.innerRadius);
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      return true;
    }
    case 'VECTOR': {
      let closed = false;
      for (const c of node.path) {
        if (c.type === 'M') ctx.moveTo(c.x, c.y);
        else if (c.type === 'L') ctx.lineTo(c.x, c.y);
        else if (c.type === 'C') ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        else {
          ctx.closePath();
          closed = true;
        }
      }
      return closed;
    }
    default:
      return false;
  }
}

export function paintToCanvasStyle(
  ctx: CanvasRenderingContext2D,
  paint: Paint,
  bounds: Rect,
  images: ImageCache,
): string | CanvasGradient | CanvasPattern | null {
  switch (paint.type) {
    case 'SOLID':
      return colorToCss(paint.color, paint.opacity);
    case 'LINEAR_GRADIENT': {
      const g = ctx.createLinearGradient(
        bounds.x + paint.start.x * bounds.width,
        bounds.y + paint.start.y * bounds.height,
        bounds.x + paint.end.x * bounds.width,
        bounds.y + paint.end.y * bounds.height,
      );
      for (const s of paint.stops) g.addColorStop(s.position, colorToCss(s.color, paint.opacity));
      return g;
    }
    case 'RADIAL_GRADIENT': {
      const cx = bounds.x + paint.center.x * bounds.width;
      const cy = bounds.y + paint.center.y * bounds.height;
      const r = paint.radius * Math.max(bounds.width, bounds.height);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      for (const s of paint.stops) g.addColorStop(s.position, colorToCss(s.color, paint.opacity));
      return g;
    }
    case 'IMAGE': {
      const src = paint.src ?? null;
      if (!src) return 'rgba(0,0,0,0.08)';
      const img = images.get(src);
      if (img === undefined) return 'rgba(0,0,0,0.08)';
      if (img === null) return 'rgba(255,0,0,0.15)';
      if (paint.scaleMode === 'TILE') return ctx.createPattern(img, 'repeat');
      const iw = img.width;
      const ih = img.height;
      let sx = bounds.width / iw;
      let sy = bounds.height / ih;
      if (paint.scaleMode === 'FILL') sx = sy = Math.max(sx, sy);
      else if (paint.scaleMode === 'FIT') sx = sy = Math.min(sx, sy);
      const dw = iw * sx;
      const dh = ih * sy;
      const dx = bounds.x + (bounds.width - dw) / 2;
      const dy = bounds.y + (bounds.height - dh) / 2;
      const pattern = ctx.createPattern(img, 'no-repeat');
      if (!pattern) return null;
      const m = new DOMMatrix([sx, 0, 0, sy, dx, dy]);
      pattern.setTransform(m);
      return pattern;
    }
    default:
      return null;
  }
}

function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  bounds: Rect,
  images: ImageCache,
): boolean {
  const style = paintToCanvasStyle(ctx, stroke.paint, bounds, images);
  if (!style) return false;
  ctx.strokeStyle = style;
  ctx.lineCap = stroke.cap.toLowerCase() as CanvasLineCap;
  ctx.lineJoin = stroke.join.toLowerCase() as CanvasLineJoin;
  ctx.setLineDash(stroke.dashPattern);
  return true;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  bounds: Rect,
  stroke: Stroke,
  images: ImageCache,
  closedPath: boolean,
): void {
  if (!stroke.visible || stroke.width <= 0) return;
  const opacity = stroke.paint.opacity;
  if (opacity <= 0) return;
  ctx.save();
  ctx.beginPath();
  const closed = buildNodePath(ctx, node, bounds) && closedPath;
  if (!applyStrokeStyle(ctx, stroke, bounds, images)) {
    ctx.restore();
    return;
  }
  if (closed && stroke.align === 'INSIDE') {
    ctx.clip();
    ctx.lineWidth = stroke.width * 2;
    ctx.stroke();
  } else if (closed && stroke.align === 'OUTSIDE') {
    // Clip to everything except the shape (even-odd with a huge rect), then stroke at double width.
    ctx.beginPath();
    const big = 1e6;
    ctx.rect(-big, -big, big * 2, big * 2);
    buildNodePath(ctx, node, bounds);
    ctx.clip('evenodd');
    ctx.beginPath();
    buildNodePath(ctx, node, bounds);
    ctx.lineWidth = stroke.width * 2;
    ctx.stroke();
  } else {
    ctx.lineWidth = stroke.width;
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  node: Extract<SceneNode, { type: 'TEXT' }>,
  bounds: Rect,
  images: ImageCache,
): void {
  const layout = layoutText(node as TextProps);
  const style = node.textStyle;
  const fills = node.style.fills.filter((f) => f.visible);
  if (fills.length === 0) return;
  ctx.font = cssFont(style);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if ('letterSpacing' in ctx)
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${style.letterSpacing}px`;

  const totalHeight = layout.height;
  let yStart = bounds.y;
  if (style.verticalAlign === 'MIDDLE') yStart = bounds.y + (bounds.height - totalHeight) / 2;
  else if (style.verticalAlign === 'BOTTOM') yStart = bounds.y + bounds.height - totalHeight;
  // Baseline sits ~80% down the line box for typical Latin fonts.
  const ascent = style.fontSize * 0.8;
  const leading = (layout.lineHeightPx - style.fontSize) / 2;

  for (const fill of fills) {
    const paintStyle = paintToCanvasStyle(ctx, fill, bounds, images);
    if (!paintStyle) continue;
    ctx.fillStyle = paintStyle;
    layout.lines.forEach((line, i) => {
      let x = bounds.x;
      const w = node.autoResize === 'WIDTH_AND_HEIGHT' ? layout.width : bounds.width;
      if (style.textAlign === 'CENTER') x = bounds.x + (w - line.width) / 2;
      else if (style.textAlign === 'RIGHT') x = bounds.x + w - line.width;
      const y = yStart + i * layout.lineHeightPx + leading + ascent;
      ctx.fillText(line.text, x, y);
      if (style.textDecoration !== 'NONE') {
        const ly =
          style.textDecoration === 'UNDERLINE'
            ? y + style.fontSize * 0.12
            : y - style.fontSize * 0.3;
        ctx.fillRect(x, ly, line.width, Math.max(1, style.fontSize / 14));
      }
    });
  }
}

/**
 * Draws a node and its descendants. The context must already be in the node's PARENT coordinate
 * space; this function applies the node's local transform.
 */
export function drawNode(dc: DrawContext, node: SceneNode): void {
  if (!node.visible) return;
  if (dc.hiddenNodeIds?.has(node.id)) return;
  const { ctx, graph } = dc;

  if (dc.cullRect) {
    const wb = graph.getWorldBounds(node.id);
    if (!R.intersects(R.inflate(wb, paintMargin(node) + 1), dc.cullRect)) {
      dc.stats.culled++;
      return;
    }
  }
  dc.stats.drawn++;

  const local = mat2d.fromTransform(node.transform);
  const bounds = graph.getLocalBounds(node.id);
  const style = node.style;

  ctx.save();
  ctx.transform(local.a, local.b, local.c, local.d, local.e, local.f);
  ctx.globalAlpha *= style.opacity;
  if (style.blendMode !== 'NORMAL') ctx.globalCompositeOperation = BLEND_MODES[style.blendMode];

  const blur = style.effects.find((e) => e.type === 'LAYER_BLUR' && e.visible);
  if (blur && blur.type === 'LAYER_BLUR' && blur.radius > 0 && 'filter' in ctx)
    ctx.filter = `blur(${blur.radius}px)`;

  const isClosed =
    node.type !== 'LINE' && !(node.type === 'VECTOR' && !node.path.some((c) => c.type === 'Z'));

  // Drop shadows: drawn first, beneath fills, using the shape silhouette.
  if (node.type !== 'GROUP') {
    for (const effect of style.effects) {
      if (effect.type !== 'DROP_SHADOW' || !effect.visible) continue;
      ctx.save();
      ctx.shadowColor = colorToCss(effect.color);
      ctx.shadowBlur = effect.blur;
      ctx.shadowOffsetX = effect.offset.x;
      ctx.shadowOffsetY = effect.offset.y;
      ctx.beginPath();
      const spreadBounds = effect.spread ? R.inflate(bounds, effect.spread) : bounds;
      const fillable = buildNodePath(ctx, node, spreadBounds);
      ctx.fillStyle = 'rgba(0,0,0,1)';
      if (fillable && (style.fills.some((f) => f.visible) || node.type === 'TEXT')) {
        if (node.type === 'TEXT') drawText(ctx, node, bounds, dc.images);
        else ctx.fill();
      } else {
        const s = style.strokes.find((st) => st.visible);
        if (s) {
          ctx.lineWidth = s.width;
          ctx.strokeStyle = 'rgba(0,0,0,1)';
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // Fills
  if (node.type === 'TEXT') {
    drawText(ctx, node, bounds, dc.images);
  } else if (node.type === 'IMAGE') {
    const fills: Paint[] = [node.image, ...style.fills];
    for (const fill of fills) {
      if (!fill.visible) continue;
      const paintStyle = paintToCanvasStyle(ctx, fill, bounds, dc.images);
      if (!paintStyle) continue;
      ctx.beginPath();
      buildNodePath(ctx, node, bounds);
      ctx.fillStyle = paintStyle;
      ctx.fill();
    }
  } else if (node.type !== 'GROUP') {
    for (const fill of style.fills) {
      if (!fill.visible) continue;
      ctx.beginPath();
      const fillable = buildNodePath(ctx, node, bounds);
      if (!fillable) continue;
      const paintStyle = paintToCanvasStyle(ctx, fill, bounds, dc.images);
      if (!paintStyle) continue;
      ctx.fillStyle = paintStyle;
      ctx.fill();
    }
  }

  // Children (frames clip)
  if (node.childIds.length > 0) {
    ctx.save();
    if (node.type === 'FRAME' && node.clipsContent) {
      ctx.beginPath();
      buildNodePath(ctx, node, bounds);
      ctx.clip();
    }
    for (const childId of node.childIds) drawNode(dc, graph.requireNode(childId));
    ctx.restore();
  }

  // Strokes above fills and children
  if (node.type !== 'GROUP') {
    for (const stroke of style.strokes) drawStroke(ctx, node, bounds, stroke, dc.images, isClosed);
  }

  ctx.restore();
}
