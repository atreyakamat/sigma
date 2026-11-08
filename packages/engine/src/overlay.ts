import type { SceneGraph } from '@sigma/document';
import type { Rect, Vec2 } from '@sigma/geometry';
import { mat2d, rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import type { Viewport } from '@sigma/renderer';
import type { SnapGuide } from './snapping';
import type { SelectionFrame } from './transform';
import { ALL_HANDLES, frameCorners, handleWorldPoint } from './transform';
import type { EditorSettings } from './types';

export const OVERLAY_COLORS = {
  selection: '#2f6df6',
  component: '#8b5cf6',
  selectionFill: 'rgba(47, 109, 246, 0.08)',
  hover: '#2f6df6',
  handleFill: '#ffffff',
  guide: '#ff3b7b',
  grid: 'rgba(0, 0, 0, 0.06)',
  pixelGrid: 'rgba(0, 0, 0, 0.12)',
  rulerBg: '#f7f7f8',
  rulerLine: 'rgba(0,0,0,0.18)',
  rulerText: 'rgba(0,0,0,0.55)',
  rulerSelection: 'rgba(47, 109, 246, 0.25)',
};

export const HANDLE_SIZE = 8;
export const RULER_SIZE = 20;

export interface OverlayState {
  graph: SceneGraph;
  viewport: Viewport;
  settings: EditorSettings;
  selectionIds: readonly NodeId[];
  selectionFrame: SelectionFrame | null;
  hoverId: NodeId | null;
  snapGuides: readonly SnapGuide[];
  /** Hide handles while dragging/drawing. */
  hideHandles: boolean;
  currentPageId: NodeId | null;
}

function screenPath(ctx: CanvasRenderingContext2D, pts: readonly Vec2[], close = true): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (close) ctx.closePath();
}

/** Outline of a node's oriented bounds in screen space. */
export function nodeOutlineScreen(graph: SceneGraph, viewport: Viewport, id: NodeId): Vec2[] {
  const lb = graph.getLocalBounds(id);
  const m = mat2d.multiply(viewport.getMatrix(), graph.getWorldMatrix(id));
  return R.corners(lb).map((p) => mat2d.apply(m, p));
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  settings: EditorSettings,
): void {
  const { width, height, zoom } = viewport;
  const drawLines = (step: number, color: string): void => {
    const screenStep = step * zoom;
    if (screenStep < 4) return;
    const origin = viewport.worldToScreen({ x: 0, y: 0 });
    const startX = ((origin.x % screenStep) + screenStep) % screenStep;
    const startY = ((origin.y % screenStep) + screenStep) % screenStep;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x <= width; x += screenStep) {
      const px = Math.round(x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    for (let y = startY; y <= height; y += screenStep) {
      const py = Math.round(y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.stroke();
  };
  if (settings.showGrid) drawLines(settings.gridSize, OVERLAY_COLORS.grid);
  if (settings.showPixelGrid && zoom >= 8) drawLines(1, OVERLAY_COLORS.pixelGrid);
}

export function drawRulers(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  selectionBounds: Rect | null,
): void {
  const { width, height, zoom } = viewport;
  const s = RULER_SIZE;
  ctx.save();
  ctx.fillStyle = OVERLAY_COLORS.rulerBg;
  ctx.fillRect(0, 0, width, s);
  ctx.fillRect(0, 0, s, height);
  // Choose a tick step that yields ~ 60-120px spacing.
  const candidates = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  const step = candidates.find((c) => c * zoom >= 60) ?? 10000;
  const minor = step / 5;
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = OVERLAY_COLORS.rulerText;
  ctx.strokeStyle = OVERLAY_COLORS.rulerLine;
  ctx.lineWidth = 1;

  if (selectionBounds) {
    const sb = viewport.worldRectToScreen(selectionBounds);
    ctx.fillStyle = OVERLAY_COLORS.rulerSelection;
    ctx.fillRect(sb.x, 0, sb.width, s);
    ctx.fillRect(0, sb.y, s, sb.height);
    ctx.fillStyle = OVERLAY_COLORS.rulerText;
  }

  const worldLeft = viewport.screenToWorld({ x: s, y: 0 }).x;
  const worldRight = viewport.screenToWorld({ x: width, y: 0 }).x;
  const worldTop = viewport.screenToWorld({ x: 0, y: s }).y;
  const worldBottom = viewport.screenToWorld({ x: 0, y: height }).y;

  ctx.beginPath();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let wx = Math.floor(worldLeft / minor) * minor; wx <= worldRight; wx += minor) {
    const sx = Math.round(viewport.worldToScreen({ x: wx, y: 0 }).x) + 0.5;
    if (sx < s) continue;
    const major = Math.abs(wx / step - Math.round(wx / step)) < 1e-6;
    ctx.moveTo(sx, major ? s - 10 : s - 4);
    ctx.lineTo(sx, s);
    if (major) ctx.fillText(String(Math.round(wx)), sx + 3, 2);
  }
  for (let wy = Math.floor(worldTop / minor) * minor; wy <= worldBottom; wy += minor) {
    const sy = Math.round(viewport.worldToScreen({ x: 0, y: wy }).y) + 0.5;
    if (sy < s) continue;
    const major = Math.abs(wy / step - Math.round(wy / step)) < 1e-6;
    ctx.moveTo(major ? s - 10 : s - 4, sy);
    ctx.lineTo(s, sy);
    if (major) {
      ctx.save();
      ctx.translate(2, sy + 3);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(wy)), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();
  ctx.fillStyle = OVERLAY_COLORS.rulerBg;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = OVERLAY_COLORS.rulerLine;
  ctx.beginPath();
  ctx.moveTo(0, s + 0.5);
  ctx.lineTo(width, s + 0.5);
  ctx.moveTo(s + 0.5, 0);
  ctx.lineTo(s + 0.5, height);
  ctx.stroke();
  ctx.restore();
}

export function drawSelection(ctx: CanvasRenderingContext2D, state: OverlayState): void {
  const { graph, viewport, selectionIds, selectionFrame } = state;
  if (selectionIds.length === 0 || !selectionFrame) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = OVERLAY_COLORS.selection;

  // Per-node outlines when multiple selected.
  if (selectionIds.length > 1) {
    for (const id of selectionIds) {
      if (!graph.hasNode(id)) continue;
      screenPath(ctx, nodeOutlineScreen(graph, viewport, id));
      ctx.stroke();
    }
  }

  const vm = viewport.getMatrix();
  const corners = frameCorners(selectionFrame).map((p) => mat2d.apply(vm, p));
  screenPath(ctx, corners);
  ctx.lineWidth = selectionIds.length > 1 ? 1 : 1.5;
  ctx.stroke();

  if (!state.hideHandles) {
    const hs = HANDLE_SIZE;
    for (const h of ALL_HANDLES) {
      const p = mat2d.apply(vm, handleWorldPoint(selectionFrame, h));
      const w = selectionFrame.width * viewport.zoom;
      const hgt = selectionFrame.height * viewport.zoom;
      // Hide edge handles on tiny selections to keep corners usable.
      if ((h === 'n' || h === 's') && w < 40) continue;
      if ((h === 'e' || h === 'w') && hgt < 40) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(selectionFrame.matrix.b, selectionFrame.matrix.a));
      ctx.fillStyle = OVERLAY_COLORS.handleFill;
      ctx.strokeStyle = OVERLAY_COLORS.selection;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(-hs / 2, -hs / 2, hs, hs);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Size label below the selection.
  const bounds = R.boundsOfPoints(corners);
  const label = `${fmt(selectionFrame.width)} × ${fmt(selectionFrame.height)}`;
  ctx.font = '11px system-ui, sans-serif';
  const tw = ctx.measureText(label).width + 10;
  const lx = bounds.x + bounds.width / 2 - tw / 2;
  const ly = bounds.y + bounds.height + 8;
  ctx.fillStyle = OVERLAY_COLORS.selection;
  roundRect(ctx, lx, ly, tw, 18, 3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, lx + tw / 2, ly + 9);
  ctx.restore();
}

export function drawHover(ctx: CanvasRenderingContext2D, state: OverlayState): void {
  const { hoverId, graph, viewport, selectionIds } = state;
  if (!hoverId || !graph.hasNode(hoverId) || selectionIds.includes(hoverId)) return;
  ctx.save();
  ctx.strokeStyle = OVERLAY_COLORS.hover;
  ctx.lineWidth = 2;
  screenPath(ctx, nodeOutlineScreen(graph, viewport, hoverId));
  ctx.stroke();
  ctx.restore();
}

export function drawSnapGuides(ctx: CanvasRenderingContext2D, state: OverlayState): void {
  const { snapGuides, viewport } = state;
  if (snapGuides.length === 0) return;
  ctx.save();
  ctx.strokeStyle = OVERLAY_COLORS.guide;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const g of snapGuides) {
    if (g.axis === 'x') {
      const x = Math.round(viewport.worldToScreen({ x: g.position, y: 0 }).x) + 0.5;
      ctx.moveTo(x, viewport.worldToScreen({ x: 0, y: g.from }).y - 8);
      ctx.lineTo(x, viewport.worldToScreen({ x: 0, y: g.to }).y + 8);
    } else {
      const y = Math.round(viewport.worldToScreen({ x: 0, y: g.position }).y) + 0.5;
      ctx.moveTo(viewport.worldToScreen({ x: g.from, y: 0 }).x - 8, y);
      ctx.lineTo(viewport.worldToScreen({ x: g.to, y: 0 }).x + 8, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Draws the names of top-level frames above them, like a design canvas does. */
export function drawFrameLabels(ctx: CanvasRenderingContext2D, state: OverlayState): void {
  const { graph, viewport, currentPageId, selectionIds } = state;
  if (!currentPageId || !graph.hasNode(currentPageId)) return;
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  const visible = viewport.getVisibleWorldRect();
  for (const child of graph.getChildren(currentPageId)) {
    if (!['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(child.type) || !child.visible)
      continue;
    const wb = graph.getWorldBounds(child.id);
    if (!R.intersects(wb, visible)) continue;
    const p = viewport.worldToScreen({ x: wb.x, y: wb.y });
    const isComponent = child.type !== 'FRAME';
    ctx.fillStyle = selectionIds.includes(child.id)
      ? OVERLAY_COLORS.selection
      : isComponent
        ? OVERLAY_COLORS.component
        : 'rgba(0,0,0,0.5)';
    ctx.fillText((isComponent ? '◈ ' : '') + child.name, p.x, p.y - 4);
    const meta = child.metadata as {
      lock?: { name: string; until: string };
      review?: { state: string };
    };
    let x = p.x + ctx.measureText((isComponent ? '◈ ' : '') + child.name).width + 6;
    const badge = (text: string, color: string): void => {
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = color;
      roundRect(ctx, x, p.y - 16, w, 13, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 4, p.y - 5);
      x += w + 4;
    };
    if (meta.review?.state === 'IN_REVIEW') badge('In review', '#d97706');
    else if (meta.review?.state === 'APPROVED') badge('Approved', '#16a34a');
    if (meta.lock && new Date(meta.lock.until).getTime() > Date.now())
      badge(`🔒 ${meta.lock.name}`, '#6b7280');
  }
  ctx.restore();
}

export function drawMarquee(ctx: CanvasRenderingContext2D, screenRect: Rect): void {
  ctx.save();
  ctx.fillStyle = OVERLAY_COLORS.selectionFill;
  ctx.strokeStyle = OVERLAY_COLORS.selection;
  ctx.lineWidth = 1;
  ctx.fillRect(screenRect.x, screenRect.y, screenRect.width, screenRect.height);
  ctx.strokeRect(
    Math.round(screenRect.x) + 0.5,
    Math.round(screenRect.y) + 0.5,
    Math.round(screenRect.width),
    Math.round(screenRect.height),
  );
  ctx.restore();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
