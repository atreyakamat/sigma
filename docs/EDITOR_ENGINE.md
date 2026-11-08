# Editor engine

`@sigma/engine` exposes one façade, `Editor`, plus the building blocks it is made of. It has no
dependency on React or the DOM except inside `mount()`; everything else runs headless (the unit
tests and benchmarks run it under Node).

```ts
const editor = new Editor({ document: json });   // or new Editor() for an empty page
registerDefaultTools(editor);                     // @sigma/tools
registerDefaultShortcuts(editor);
editor.mount(containerElement);                   // creates the two canvases and binds input
editor.events.on('change', ...);                  // document changed (commands, undo, load)
editor.ops.createNode('RECTANGLE', { size: { width: 100, height: 80 } });
editor.toJSON();
```

## Pieces

| Member                        | Role                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `graph: SceneGraph`           | Document truth (`@sigma/document`)                                                                                            |
| `history: History`            | Undo/redo, merging, transactions (`@sigma/history`)                                                                           |
| `viewport: Viewport`          | zoom/offset, world↔screen conversion, fit/zoom helpers                                                                        |
| `selection: SelectionManager` | ordered selection ids, hover id, bounds                                                                                       |
| `hitTester: HitTester`        | spatial index (grid hash) + z-order map + precise per-shape tests                                                             |
| `tools: ToolManager`          | registry, active tool, temporary tool stack (space → hand)                                                                    |
| `keymap: Keymap`              | shortcut registry (`mod+shift+z` style combos)                                                                                |
| `ops: EditorOperations`       | every editing operation the UI/tools call; all go through commands                                                            |
| `clipboard`                   | internal node clipboard (mirrors JSON to the system clipboard when allowed)                                                   |
| `images: ImageCache`          | async image loading for image fills; re-renders when loaded                                                                   |
| `settings`                    | rulers, grids, snapping flags                                                                                                 |
| `events`                      | `change`, `selection`, `hover`, `viewport`, `tool`, `history`, `page`, `render`, `textEdit`, `document`, `settings`, `cursor` |

## Tool contract

```ts
interface EditorTool {
  id: string;
  name: string;
  shortcut?: string;
  cursor?: string;
  activate(): void;
  deactivate(): void;
  onPointerDown(e: EditorPointerEvent): void; // e.world is already in document units
  onPointerMove(e: EditorPointerEvent): void;
  onPointerUp(e: EditorPointerEvent): void;
  onDoubleClick?(e: EditorPointerEvent): void;
  onKeyDown(e: EditorKeyEvent): boolean | void; // true = consumed, global shortcuts skipped
  onKeyUp(e: EditorKeyEvent): boolean | void;
  renderOverlay(ctx: OverlayContext): void; // screen space, drawn after selection/guides
}
```

Tools never touch `graph` directly; they call `editor.ops.*`, which builds commands. Adding a tool
means one class extending `BaseTool` and one line in `registerDefaultTools`. The renderer and
persistence are untouched.

## Selection, handles and transforms

`getSelectionFrame(graph, ids)` returns an oriented box (`matrix`, `width`, `height`): a single
node's own world matrix (handles rotate with it) or the axis-aligned union for multiple nodes.
`resizeFrameRect` computes the new frame-space rect for a dragged handle (shift = proportional,
alt = from center; crossing over produces negative sizes → flips). `applyFrameRectToNodes` maps that
rect back to per-node `transform`/`size` (groups scale their children; multi-selections scale each
node's world bounds within the frame). `rotateNodesAround` and `flipNodes` work in world space and
decompose back into each node's parent space.

## Hit testing

`HitTester` maintains, per page, a uniform-grid spatial index of inflated world bounds (stroke and
effect margins included) and a pre-order z-index. `hitTest(world)` searches the grid cell, filters
hidden/locked nodes and ancestors, runs a precise test in the node's local space (rect, ellipse,
polygon, line/vector polyline distance, frame fill-or-border), and returns the top-most hit. The
select tool resolves that hit to the selectable ancestor: groups capture clicks until "entered"
(⌘-click or double-click selects inside). Scene changes update the index incrementally; structural
changes rebuild it (10k nodes ≈ 20 ms, see benchmarks).

## Snapping

While moving, the selection's bounds are snapped against the edges and centers of on-screen
siblings and the parent frame (threshold 6 screen px), then grid or pixel. Guides are stored on
`editor.snapGuides` and drawn by the overlay. ⌘ disables snapping for the drag.

## Rendering loop

`requestRender()` marks the document canvas dirty; `requestOverlay()` only the overlay. One
`requestAnimationFrame` per frame draws whatever is dirty. Scene changes that only update nodes
invalidate the union of their old and new bounds so the renderer clips and redraws that region;
structural changes redraw everything. `events.render` reports `drawn`, `culled`, `durationMs`,
`partial`.

## Text

Text nodes have `characters`, `textStyle` and `autoResize` (`WIDTH_AND_HEIGHT` | `HEIGHT` |
`NONE`). Layout (`@sigma/renderer/text`) wraps words for fixed-width text and measures with a
hidden canvas (a width estimate under Node). `ops.setText` / `ops.setTextStyle` re-measure
auto-sized nodes. Inline editing is a host concern: the engine emits `textEdit`, the web app
overlays a textarea and streams updates through `ops.setText` with one merge key.

## Images

Image nodes carry an `IMAGE` paint (`src` data URL or asset URL + `scaleMode`). The host validates
files with `decodeImageFile` (magic bytes, size cap) and either hands the tool a pending image or
calls `tools.image.placeAt(world, image)` for drag-and-drop.

## Export

`exportPng` rasterizes nodes through the same draw primitives at any scale; `exportSvg` emits
equivalent SVG (gradients, image patterns, inside/outside strokes via clip/mask, frame clipping,
text spans, shadows and blur as filters).

## Known limitations

- Group opacity is applied per child (multiplicative), not as a composited layer.
- Text measurement uses canvas metrics; baseline placement assumes Latin metrics (≈0.8 em ascent).
- Rotated multi-selection resize keeps orientation but scales bounds, which is approximate for
  rotated children.
- No vector editing (pen/pencil/boolean ops) yet — `VECTOR` nodes render and export but cannot be
  drawn interactively until Milestone 4.
- Fully zoomed-out views that show every node are not culled; see `docs/engine/` benchmarks.
