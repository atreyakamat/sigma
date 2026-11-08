# ADR-0002: Custom editor engine on Canvas 2D

## Status

Accepted. Implemented in Milestones 1 and 2 (`packages/renderer`, `packages/engine`,
`packages/tools`).

## Context

The product is a design editor comparable to Figma: an infinite, zoomable canvas with hierarchical
frames, groups, shapes, text and images, selection handles, snapping, rulers, undo/redo and later
multiplayer. The rendering and interaction layer is the core of the product and must support
documents with thousands of nodes, pixel-exact export, and a non-DOM document model that a CRDT can
bind to.

Off-the-shelf canvas libraries bring their own object models, event systems and rendering loops,
which would have to be fought at every step (own transform math, own hit testing, own undo).

## Decision

Write the engine in-house as framework-free TypeScript:

- **`@sigma/renderer`** defines a small `Renderer` interface (`invalidate`, `render`,
  `invalidateAll`, `stats`, `dispose`) and ships `Canvas2DRenderer` as its only implementation.
  The renderer never mutates the document. It supports viewport culling (nodes whose world bounds
  miss the visible rect are skipped) and dirty-region redraws (when only a world rect is
  invalidated, the canvas is clipped to it and only intersecting nodes are drawn). `rasterizeNodes`
  reuses the same drawing code to render nodes into an offscreen canvas for PNG export and
  thumbnails. Text layout (`layoutText`) measures with a canvas context in the browser and falls
  back to an estimate in Node.
- **`@sigma/engine`** is the façade (`Editor`) that owns the `SceneGraph`, `History`, `Viewport`,
  `SelectionManager`, `HitTester`, `ToolManager`, `Keymap`, `InputSystem`, `EditorOperations`
  and clipboard. It mounts two stacked `<canvas>` elements: the main canvas for the document and
  an overlay canvas for selection, handles, hover, grid, rulers, snap guides and tool previews. The
  UI subscribes to `editor.events` and calls `editor.ops`; the engine has no React dependency.
- **`@sigma/tools`** implements the interaction tools (`select`, `hand`, `frame`, `rectangle`,
  `ellipse`, `line`, `polygon`, `star`, `text`, `image`) against the `EditorTool` interface.
- The `Viewport` is a pure camera: world geometry never changes when zooming, only the
  world→screen matrix (`screen = world * zoom + offset`), clamped to `MIN_ZOOM = 0.02` and
  `MAX_ZOOM = 256`.

Canvas 2D is the first backend because it is universally available, needs no shader pipeline, and
is fast enough for the document sizes targeted by the first milestones once culling and dirty
regions are in place. The `Renderer` interface and the `createRenderer` option on `Editor` exist
so a WebGL/WebGPU backend can be added without touching tools or UI.

## Alternatives considered

- **Konva / Fabric.js / Paper.js.** Each has its own scene graph and event model that would
  duplicate `@sigma/document`, and none maps cleanly onto an immutable, CRDT-friendly node map.
- **PixiJS (WebGL).** Strong rendering performance, but it is a game-engine style retained scene
  graph; integrating a document model, text layout matching export output, and dirty-region
  redraw would still be custom work, with a much larger dependency.
- **SVG / DOM rendering.** Simple to start and accessible, but DOM node count becomes the limit
  long before the 10k-node target, and exact pixel export would still need a rasterizer.
- **WebGL from day one.** Deferred: the interface boundary is in place, and the work in
  Milestones 1–2 (hit testing, snapping, transforms, tools) is backend-agnostic.

## Consequences

- All drawing primitives (`packages/renderer/src/draw.ts`), hit tests (`packages/engine/src/hit-test.ts`) and SVG export
  (`packages/import-export/src/svg-export.ts`) must be kept in sync per node type; see "Adding a node type" in
  `docs/DEVELOPMENT.md`.
- Text rendering depends on the browser's font rendering; there is no custom text shaper. Layout
  in Node uses a width estimate, so tests that depend on exact text metrics must run in a browser.
- The engine can run headless (`new Editor()` without `mount`), which is how the unit tests for
  `engine` and `tools` run under Vitest in Node.
- Performance work (culling, dirty regions, spatial index) is our responsibility; the benchmarks
  in `tests/benchmarks` exist to keep it measurable.
