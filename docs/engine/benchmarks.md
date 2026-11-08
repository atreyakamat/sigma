# Benchmarks

Benchmark documents with 100, 1,000 and 10,000 nodes are generated deterministically by
`tests/benchmarks/generate-document.ts`: a grid of 400×300 frames each holding ~23 children
(60% rectangles, 20% ellipses, 15% text, 5% lines; 30% have strokes, 10% are rotated).

## Running

```bash
pnpm --filter @sigma/benchmarks bench            # headless: document, hit testing, commands, memory
pnpm --filter @sigma/benchmarks bench:browser    # Chromium: render frames, pan, partial redraw, pointer latency, heap
```

Both write Markdown tables to `tests/benchmarks/results/*-latest.md`; copy a run into this folder
with a date when it is worth keeping.

## What is measured

Headless (Node, Vitest): zod validation, graph load, serialization, cold world-bounds pass,
spatial index build, 1,000 random hit tests, marquee query, move 1 node, move 10% of nodes, undo +
redo, restyle all nodes, select-all bounds, process heap.

Browser (Playwright, headless Chromium, 1600×1000): `loadDocument`, full frame at zoom-to-fit (every
node visible), full frame at 100% (culling active), pan frames, partial redraw after moving one
node, synthetic `pointermove` → hover hit test + overlay draw, select-all overlay draw, JS heap.

## Results summary (2026-11-07, headless Chromium, Linux x64, Node 26)

| Metric                                   |      100 |    1,000 |     10,000 |
| ---------------------------------------- | -------: | -------: | ---------: |
| Validate + load document (headless)      |   3.5 ms |    15 ms |     111 ms |
| Single hit test                          | 0.007 ms | 0.009 ms |   0.013 ms |
| Move one node (command + index)          |  0.09 ms |  0.03 ms |    0.02 ms |
| Full frame, 100% zoom (culled)           |   1.5 ms |   1.5 ms |     1.8 ms |
| Full frame, zoom-to-fit (nothing culled) |   2.5 ms |  11.8 ms | **171 ms** |
| Partial frame after moving a node        |   0.5 ms |   0.2 ms |     0.5 ms |
| pointermove → hover + overlay            |   0.2 ms |   0.3 ms |     1.3 ms |
| Select all + overlay                     |   1.7 ms |   6.6 ms |    39.9 ms |

Interpretation:

- The 16.7 ms frame budget (60 FPS) holds for ordinary editing at working zoom levels on all three
  documents because viewport culling (frames culled skip their subtrees) keeps the draw count low.
- Zoomed all the way out on 10,000 nodes, Canvas 2D must draw everything: 171 ms per frame. That
  is the current limit and the motivation for the planned WebGL renderer / cached frame tiles.
- Overlay drawing of 10,000 selected outlines is the second hotspot (40 ms); a selection of that
  size should draw a single bounds box instead of per-node outlines.
- `performance.memory` in headless Chromium reported a constant 29.8 MB; treat the browser heap
  figure as unreliable until measured with `--enable-precise-memory-info` or DevTools.
- Numbers come from a software-rendered headless browser; a GPU-backed desktop browser is faster
  for raster work and similar for JS work.
