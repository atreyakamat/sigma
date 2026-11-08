import type { DocumentJSON, SceneChange, SceneNode, TextStyle } from '@sigma/document';
import { SceneGraph, projectInstances } from '@sigma/document';
import type { Rect, Vec2 } from '@sigma/geometry';
import { rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';
import { Emitter } from '@sigma/shared';
import { History } from '@sigma/history';
import type { HistoryEvents } from '@sigma/history';
import type { RenderStats, Renderer } from '@sigma/renderer';
import { Canvas2DRenderer, ImageCache, Viewport } from '@sigma/renderer';
import { EditorClipboard } from './clipboard';
import { HitTester } from './hit-test';
import { InputSystem } from './input';
import { Keymap } from './keymap';
import { EditorOperations } from './operations';
import {
  drawFrameLabels,
  drawGrid,
  drawHover,
  drawRulers,
  drawSelection,
  drawSnapGuides,
  RULER_SIZE,
} from './overlay';
import type { OverlayState } from './overlay';
import { SelectionManager } from './selection';
import type { SnapGuide } from './snapping';
import { ToolManager } from './tool-manager';
import type { SelectionFrame } from './transform';
import { getSelectionFrame } from './transform';
import type { EditorSettings, OverlayContext } from './types';

export interface EditorEvents extends Record<string, unknown> {
  /** Document content changed (any command, undo, redo, load). */
  change: SceneChange;
  selection: { ids: readonly NodeId[] };
  hover: { id: NodeId | null };
  viewport: { zoom: number; offsetX: number; offsetY: number };
  tool: { id: string | null };
  history: HistoryEvents['change'];
  page: { id: NodeId };
  render: RenderStats;
  /** A tool asks the host UI to open inline text editing for a node. */
  textEdit: { id: NodeId };
  document: { graph: SceneGraph };
  settings: EditorSettings;
  cursor: { cursor: string };
}

export interface EditorOptions {
  document?: DocumentJSON | SceneGraph | null;
  settings?: Partial<EditorSettings>;
  /** Custom renderer factory (defaults to Canvas2DRenderer). */
  createRenderer?: (canvas: HTMLCanvasElement, images: ImageCache) => Renderer;
  historyLimit?: number;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  showGrid: false,
  gridSize: 8,
  showPixelGrid: true,
  showRulers: true,
  snapToObjects: true,
  snapToGrid: false,
  snapToPixels: true,
};

/**
 * The editor engine façade. Owns the document, history, viewport, selection, tools and rendering
 * loop. It has no dependency on React: the UI subscribes to `events` and calls `ops`.
 */
export class Editor {
  readonly events = new Emitter<EditorEvents>();
  graph: SceneGraph;
  history: History;
  readonly viewport = new Viewport();
  selection: SelectionManager;
  hitTester: HitTester;
  readonly tools = new ToolManager();
  readonly keymap = new Keymap();
  readonly ops: EditorOperations;
  readonly clipboard: EditorClipboard;
  readonly images = new ImageCache();
  settings: EditorSettings;

  private _currentPageId: NodeId | null = null;
  private container: HTMLElement | null = null;
  private mainCanvas: HTMLCanvasElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private renderer: Renderer | null = null;
  private input: InputSystem | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameHandle: number | null = null;
  private documentDirty = true;
  private overlayDirty = true;
  private readonly createRenderer: EditorOptions['createRenderer'];
  private readonly historyLimit: number;
  private unsubscribeGraph: (() => void)[] = [];
  private _cursor = 'default';

  /** Host-provided guard: return false to make a node (and its subtree) non-interactive, e.g. frames locked by someone else. */
  nodeGuard: ((node: SceneNode) => boolean) | null = null;

  /** Remembered defaults for newly created nodes (last used text style, frame preset). */
  defaults: { textStyle: Partial<TextStyle>; frameSize: { width: number; height: number } | null } =
    { textStyle: {}, frameSize: null };

  /** Transient interaction state shared between tools and the overlay. */
  snapGuides: SnapGuide[] = [];
  hideHandles = false;
  hiddenNodeIds = new Set<NodeId>();
  lastPointerWorld: Vec2 = { x: 0, y: 0 };
  lastPointerScreen: Vec2 = { x: 0, y: 0 };

  constructor(options: EditorOptions = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...options.settings };
    this.createRenderer = options.createRenderer;
    this.historyLimit = options.historyLimit ?? 200;
    this.graph = this.resolveGraph(options.document);
    this.history = new History(this.graph, { limit: this.historyLimit });
    this.selection = new SelectionManager(this.graph);
    this.hitTester = new HitTester(this.graph);
    this.ops = new EditorOperations(this);
    this.clipboard = new EditorClipboard(this);
    this.bindGraph();
    this.setPage(this.graph.pageIds[0] as NodeId);
    this.viewport.events.on('change', (s) => {
      this.documentDirty = true;
      this.overlayDirty = true;
      this.events.emit('viewport', { zoom: s.zoom, offsetX: s.offsetX, offsetY: s.offsetY });
      this.schedule();
    });
    this.tools.events.on('change', ({ id }) => {
      const tool = id ? this.tools.get(id) : null;
      this.setCursor(tool?.cursor ?? 'default');
      this.events.emit('tool', { id });
      this.requestOverlay();
    });
    this.images.events.on('change', () => this.requestRender());
  }

  /* ----------------------------------------------------------- document */

  private resolveGraph(doc: EditorOptions['document']): SceneGraph {
    const graph =
      doc instanceof SceneGraph ? doc : doc ? SceneGraph.fromJSON(doc) : SceneGraph.createEmpty();
    projectInstances(graph);
    return graph;
  }

  /** Replaces the document. History and selection reset. */
  loadDocument(doc: DocumentJSON | SceneGraph): void {
    for (const u of this.unsubscribeGraph) u();
    this.graph = this.resolveGraph(doc);
    this.history = new History(this.graph, { limit: this.historyLimit });
    this.selection = new SelectionManager(this.graph);
    this.hitTester = new HitTester(this.graph);
    this.bindGraph();
    this.setPage(this.graph.pageIds[0] as NodeId);
    this.renderer?.invalidateAll();
    this.events.emit('document', { graph: this.graph });
    this.events.emit('history', { canUndo: false, canRedo: false, undoName: null, redoName: null });
    this.requestRender();
  }

  toJSON(): DocumentJSON {
    return this.graph.toJSON();
  }

  private bindGraph(): void {
    this.unsubscribeGraph = [
      this.graph.events.on('change', (change) => this.onSceneChange(change)),
      this.history.events.on('change', (e) => this.events.emit('history', e)),
      this.selection.events.on('change', (e) => {
        this.overlayDirty = true;
        this.events.emit('selection', e);
        this.schedule();
      }),
      this.selection.events.on('hover', (e) => {
        this.overlayDirty = true;
        this.events.emit('hover', e);
        this.schedule();
      }),
    ];
  }

  private projecting = false;

  private onSceneChange(change: SceneChange): void {
    // Keep instance projections in sync with their masters (re-entrant changes are coalesced).
    if (!this.projecting) {
      this.projecting = true;
      try {
        projectInstances(this.graph);
      } finally {
        this.projecting = false;
      }
    }
    if (this.renderer) {
      if (change.structural || change.added.length || change.removed.length) {
        this.renderer.invalidateAll();
      } else {
        let dirty: Rect | null = null;
        for (const id of change.updated) {
          const prev = this.hitTester['index'].getBounds(id);
          if (prev) dirty = dirty ? R.union(dirty, prev) : prev;
          if (this.graph.hasNode(id)) {
            const nb = this.graph.getWorldBounds(id);
            dirty = dirty ? R.union(dirty, nb) : nb;
            for (const did of this.graph.getDescendantIds(id))
              dirty = R.union(dirty, this.graph.getWorldBounds(did));
          }
        }
        if (dirty) this.renderer.invalidate(R.inflate(dirty, 64));
        else this.renderer.invalidateAll();
      }
    }
    this.hitTester.applyChange(change);
    this.selection.prune();
    if (this._currentPageId && !this.graph.hasNode(this._currentPageId))
      this.setPage(this.graph.pageIds[0] as NodeId);
    this.documentDirty = true;
    this.overlayDirty = true;
    this.events.emit('change', change);
    this.schedule();
  }

  /* ----------------------------------------------------------- pages */

  get currentPageId(): NodeId | null {
    return this._currentPageId;
  }

  setPage(id: NodeId): void {
    if (!this.graph.hasNode(id) || this.graph.getNode(id)?.type !== 'PAGE')
      throw new Error(`Unknown page "${id}"`);
    if (this._currentPageId === id) return;
    this._currentPageId = id;
    this.selection.clear();
    this.selection.setHover(null);
    this.hitTester.setPage(id);
    this.renderer?.invalidateAll();
    this.documentDirty = true;
    this.overlayDirty = true;
    this.events.emit('page', { id });
    this.schedule();
  }

  /* ----------------------------------------------------------- settings & cursor */

  updateSettings(patch: Partial<EditorSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.overlayDirty = true;
    this.events.emit('settings', this.settings);
    this.schedule();
  }

  get cursor(): string {
    return this._cursor;
  }

  setCursor(cursor: string): void {
    if (cursor === this._cursor) return;
    this._cursor = cursor;
    if (this.overlayCanvas) this.overlayCanvas.style.cursor = cursor;
    this.events.emit('cursor', { cursor });
  }

  /** Asks the host UI to open the inline text editor for a text node. */
  requestTextEdit(id: NodeId): void {
    this.events.emit('textEdit', { id });
  }

  /* ----------------------------------------------------------- selection helpers */

  getSelectionFrame(): SelectionFrame | null {
    return getSelectionFrame(this.graph, this.selection.ids);
  }

  /** Screen-pixel tolerance expressed in world units. */
  worldTolerance(px = 4): number {
    return px / this.viewport.zoom;
  }

  /** Whether a screen point lies on the rulers (so tools should ignore it). */
  isOnRulers(screen: Vec2): boolean {
    return this.settings.showRulers && (screen.x < RULER_SIZE || screen.y < RULER_SIZE);
  }

  /* ----------------------------------------------------------- mounting & rendering */

  get isMounted(): boolean {
    return this.container !== null;
  }

  mount(container: HTMLElement): void {
    if (this.container) this.unmount();
    this.container = container;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.overflow = 'hidden';
    const main = document.createElement('canvas');
    const overlay = document.createElement('canvas');
    for (const c of [main, overlay]) {
      c.style.position = 'absolute';
      c.style.inset = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.display = 'block';
    }
    overlay.tabIndex = 0;
    overlay.style.outline = 'none';
    overlay.style.touchAction = 'none';
    overlay.style.cursor = this._cursor;
    container.append(main, overlay);
    this.mainCanvas = main;
    this.overlayCanvas = overlay;
    this.overlayCtx = overlay.getContext('2d');
    this.renderer = this.createRenderer
      ? this.createRenderer(main, this.images)
      : new Canvas2DRenderer(main, { images: this.images });
    this.input = new InputSystem(this, overlay);
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(container);
    this.syncSize();
    this.requestRender();
  }

  unmount(): void {
    this.input?.dispose();
    this.input = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.mainCanvas?.remove();
    this.overlayCanvas?.remove();
    this.mainCanvas = this.overlayCanvas = null;
    this.overlayCtx = null;
    if (this.frameHandle !== null && typeof cancelAnimationFrame !== 'undefined')
      cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.container = null;
  }

  dispose(): void {
    this.unmount();
    for (const u of this.unsubscribeGraph) u();
    this.events.clear();
  }

  private syncSize(): void {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.viewport.setSize(
      Math.max(1, Math.round(rect.width)),
      Math.max(1, Math.round(rect.height)),
      dpr,
    );
    this.documentDirty = true;
    this.overlayDirty = true;
    this.schedule();
  }

  /** Requests a document + overlay redraw on the next animation frame. */
  requestRender(): void {
    this.documentDirty = true;
    this.overlayDirty = true;
    this.renderer?.invalidateAll();
    this.schedule();
  }

  /** Requests only an overlay redraw (selection, handles, previews). */
  requestOverlay(): void {
    this.overlayDirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (!this.container || this.frameHandle !== null) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    this.frameHandle = requestAnimationFrame(() => {
      this.frameHandle = null;
      this.renderNow();
    });
  }

  /** Synchronously draws whatever is dirty. */
  renderNow(): void {
    if (!this.renderer || !this._currentPageId) return;
    if (this.documentDirty) {
      const drew = this.renderer.render({
        graph: this.graph,
        pageId: this._currentPageId,
        viewport: this.viewport,
        hiddenNodeIds: this.hiddenNodeIds,
      });
      this.documentDirty = false;
      if (drew) this.events.emit('render', { ...this.renderer.stats });
    }
    if (this.overlayDirty) {
      this.drawOverlay();
      this.overlayDirty = false;
    }
  }

  private drawOverlay(): void {
    const ctx = this.overlayCtx;
    const canvas = this.overlayCanvas;
    if (!ctx || !canvas) return;
    const { width, height, devicePixelRatio: dpr } = this.viewport;
    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const state: OverlayState = {
      graph: this.graph,
      viewport: this.viewport,
      settings: this.settings,
      selectionIds: this.selection.ids,
      selectionFrame: this.getSelectionFrame(),
      hoverId: this.selection.hover,
      snapGuides: this.snapGuides,
      hideHandles: this.hideHandles,
      currentPageId: this._currentPageId,
    };
    drawGrid(ctx, this.viewport, this.settings);
    drawFrameLabels(ctx, state);
    drawHover(ctx, state);
    drawSelection(ctx, state);
    drawSnapGuides(ctx, state);
    const overlayCtx: OverlayContext = { ctx, editor: this, width, height };
    this.tools.renderOverlay(overlayCtx);
    if (this.settings.showRulers) drawRulers(ctx, this.viewport, this.selection.getBounds());
  }

  /* ----------------------------------------------------------- view helpers */

  zoomToFit(padding = 64): void {
    if (!this._currentPageId) return;
    const children = this.graph.getChildIds(this._currentPageId);
    const bounds = R.unionAll(children.map((id) => this.graph.getWorldBounds(id)));
    if (!bounds || R.isEmpty(bounds)) {
      this.viewport.reset();
      return;
    }
    this.viewport.fitRect(bounds, padding, 4);
  }

  zoomToSelection(padding = 64): void {
    const b = this.selection.getBounds();
    if (b) this.viewport.fitRect(b, padding, 8);
    else this.zoomToFit(padding);
  }

  zoomTo(zoom: number): void {
    this.viewport.zoomTo(zoom, { x: this.viewport.width / 2, y: this.viewport.height / 2 });
  }
}
