# ADR-0006: Spatial index — uniform grid hash

## Status

Accepted. Implemented in Milestone 1 (`packages/geometry/src/spatial-index.ts`) and used by
`HitTester` in `packages/engine`.

## Context

Pointer hit testing, marquee selection and dirty-region invalidation all ask "which nodes
intersect this rect/point?". Walking every node on the page per pointer move is O(n) and becomes
noticeable in the thousands of nodes. The index must support frequent updates (every drag frame
moves the selected nodes) and be simple enough to reason about in the first milestones.

## Decision

`SpatialIndex<T>` is a **uniform grid spatial hash**:

- World space is divided into square cells of `cellSize` (constructor default 256 world units;
  `HitTester` uses 512). Each entry's bounds are registered in every cell it overlaps, stored in a
  `Map<"cx:cy", Set<id>>`, with a parallel `Map<id, Rect>` of exact bounds.
- `insert`, `update` (no-op when bounds are unchanged) and `remove` are O(cells covered) and
  effectively O(1) for typical node sizes.
- `search(rect)` collects candidates from the covered cells, deduplicates them and applies an
  exact AABB test. The overlap test is **inclusive** so a point query on an exact edge still
  matches in the broad phase; precise geometry (ellipse, polygon, star, line, path) is checked by
  `HitTester.hitsGeometry` afterwards.
- `searchPoint(x, y, tolerance)` is a `search` over a `2 * tolerance` square.

`HitTester` keeps the index per page, rebuilds it on structural changes and incrementally updates
changed nodes (plus their descendants and non-page ancestors, because group bounds depend on
children) on non-structural changes. A separate z-order map resolves the topmost hit.

## Alternatives considered

- **R-tree (e.g. `rbush`).** Better for mixed-size objects and large static scenes, but bulk
  loading is what makes it fast and the editor's workload is update-heavy. Kept as the candidate
  replacement: the index interface (`insert/update/remove/search/searchPoint`) is narrow so a
  packed R-tree can be swapped in without touching `HitTester`.
- **Quadtree.** Adaptive to density, but needs rebalancing on moves and is more code for no
  measured need yet.
- **Brute force over page children.** Fine for hundreds of nodes; it is what the index replaces
  at thousands.

## Consequences

- Objects much larger than a cell (big frames, page-sized backgrounds) register in many cells;
  `cellSize` is a tuning knob, and the benchmarks in `tests/benchmarks` measure index build and
  hit-test time at 100 / 1k / 10k nodes so regressions are visible.
- Bounds are axis-aligned world bounds; rotated nodes get a looser broad phase, resolved by the
  exact geometry test.
- `search` results are unordered; callers that need z-order (hit testing, marquee) sort using
  `HitTester.getZOrder`.
- Zero-size rects (lines) are handled: `forEachCell` clamps negative extents and the inclusive
  test still matches.
