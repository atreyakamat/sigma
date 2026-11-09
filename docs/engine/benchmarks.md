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

## Results summary (2026-11-09, headless, Linux x64, Node 26) — after milestones 5–7

Full table: `benchmarks-headless-2026-11-09.md`. The document schema grew (components, layout,
interactions), so validation and load cost more than on 2026-11-07; command latency is unchanged
after fixing instance projection to visit only `INSTANCE` nodes (it previously walked the whole
tree on every change: 1.1 ms per single-node move at 10k nodes before the fix, 0.04 ms after).

| Metric                          |     100 |   1,000 |  10,000 |
| ------------------------------- | ------: | ------: | ------: |
| Validate JSON (zod)             |  6.4 ms |   18 ms |  143 ms |
| Load into SceneGraph            |  5.8 ms |   21 ms |  148 ms |
| World bounds, cold cache        |  5.2 ms |   22 ms |  169 ms |
| Move one node (command + index) | 0.11 ms | 0.04 ms | 0.04 ms |
| Restyle all nodes (one command) | 0.47 ms |  1.9 ms |   16 ms |

Launch gate 8 (`docs/LAUNCH.md`): 10k-node load (validate + load) 291 ms < 500 ms; single move
0.04 ms < 2 ms. Browser rendering numbers were not re-run; the image-paint path changed (clip +
`drawImage` instead of pattern transforms), which affects only documents with image fills.

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
