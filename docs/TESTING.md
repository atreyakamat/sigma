# Testing

## The pyramid as implemented

| Level      | Tool                | Where                                                             | Runs in                                       |
| ---------- | ------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Unit       | Vitest 5            | `packages/*/src/__tests__/*.test.ts`, `apps/api/src/**/*.spec.ts` | Node, headless (no DOM)                       |
| End-to-end | Playwright 1.65     | `tests/e2e/editor.spec.ts`                                        | headless Chromium against the Vite dev server |
| Benchmarks | Vitest + Playwright | `tests/benchmarks/`                                               | Node and headless Chromium                    |

There is no separate integration tier yet: the engine tests exercise `document`, `history`,
`renderer` (viewport/text layout) and `engine` together through the real `Editor`, and the API
test boots a real Nest application with supertest.

## Unit tests

Counts from `pnpm test` at the time of writing:

| Package                       | File                        | Tests | Covers                                                                                                                                                                                                                      |
| ----------------------------- | --------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sigma/geometry`             | `geometry.test.ts`          |    19 | vec2, mat2d (order, inverse, decomposition), rect, hit tests, bezier bounds, `SpatialIndex`                                                                                                                                 |
| `@sigma/document`             | `scene-graph.test.ts`       |    13 | hierarchy ops and their error cases, batching, world matrices/bounds, JSON round-trip, defaults, schema version refusal                                                                                                     |
| `@sigma/history`              | `history.test.ts`           |    12 | execute/undo of every command, group/ungroup world-position preservation, merge window and boundaries, transactions and abort, limit, events                                                                                |
| `@sigma/renderer`             | `viewport.test.ts`          |     7 | world/screen conversion, anchored zoom, clamping, `fitRect`, change events, `layoutText` fallback                                                                                                                           |
| `@sigma/engine`               | `engine.test.ts`            |    19 | headless `Editor`, hit testing (z-order, locked/hidden, rect modes, page switch), operations (duplicate, group, align, distribute, reorder, frame, text, clipboard), transform math, snapping, keymap and default shortcuts |
| `@sigma/tools`                | `tools.test.ts`             |    16 | select tool (click, shift-click, drag-move, marquee, resize handles, rotate, alt-duplicate, group entry, hover), shape tools (drag, shift/alt, parenting into frames, line), text, image, hand                              |
| `@sigma/import-export`        | `export.test.ts`            |     4 | SVG export of a page and a single node, document file round-trip, magic-byte sniffing                                                                                                                                       |
| `@sigma/validation`           | `validation.test.ts`        |     2 | email/password normalisation, slug and document creation schemas                                                                                                                                                            |
| `@sigma/api`                  | `health.controller.spec.ts` |     2 | controller result, `GET /api/v1/health` over HTTP                                                                                                                                                                           |
| `@sigma/shared`, `@sigma/web` | –                           |     0 | no unit tests (`--passWithNoTests`)                                                                                                                                                                                         |

Total: 94 tests. Engine and tool tests drive the editor with synthetic `EditorPointerEvent`s and
never need a canvas; text measurement falls back to an estimate in Node, so tests avoid asserting
exact text widths.

Run:

```sh
pnpm test                                   # every package via turbo (typecheck of dependencies first)
pnpm --filter @sigma/engine test            # one package
pnpm --filter @sigma/engine exec vitest     # watch mode
pnpm turbo run test --force                 # ignore the turbo cache
```

`turbo.json` makes `test` depend on `^typecheck`, so a type error in a dependency fails the
dependent package's tests early.

## End-to-end tests

`tests/e2e/editor.spec.ts` contains two Playwright tests against the real web app:

1. **MVP flow** — create a file from the dashboard, draw a rectangle with `R`, edit width and name
   in the inspector, draw an ellipse and a text node, move by drag then undo/redo, shift-click to
   multi-select and `Ctrl+G` to group, wait for "Saved" (autosave), reload and verify the layers
   survived, go back to the dashboard and reopen the file, export PNG and SVG and check the SVG
   contains the typed text.
2. **Zoom, pan and delete** — draw, wheel-zoom, `Ctrl+=`, read the zoom from the status bar,
   `Ctrl+1` to fit, `Delete`, undo.

`playwright.config.ts` (root) starts `pnpm --filter @sigma/web dev` itself, uses
`http://localhost:5173`, Desktop Chrome, serial execution (`fullyParallel: false`), `retries: 1` in CI and keeps traces on
failure under `test-results/`.

```sh
pnpm exec playwright install chromium   # once
pnpm test:e2e
pnpm test:e2e --headed                  # watch it
pnpm test:e2e --ui
```

**Modifier keys:** Playwright's `click({ modifiers: ['Shift'] })` does not set `shiftKey` on the
pointer events that the engine's `InputSystem` reads in headless Chromium, so the tests hold the
key explicitly:

```ts
await page.keyboard.down('Shift');
await page.mouse.click(x, y);
await page.keyboard.up('Shift');
```

Selectors rely on `data-testid="canvas-host"`, the inspector field labels (`W`, `X`), the status
bar text (`N layers`, `N selected`), the toolbar save status (`Saved`) and button names (`New design file`, `Export`,
`Download PNG`, `Download SVG`). Changing those strings breaks the flow.

## Benchmarks

`tests/benchmarks` (`@sigma/benchmarks`, part of the workspace) measures the engine on generated
documents of **100, 1,000 and 10,000 nodes** (`BENCHMARK_SIZES` in `generate-document.ts`,
deterministic PRNG so runs are comparable):

- `pnpm --filter @sigma/benchmarks bench` — headless (Vitest): zod validation, `SceneGraph` load
  and serialization, world bounds, spatial-index build, random hit tests, marquee queries, move/
  restyle commands with undo/redo, heap.
- `pnpm --filter @sigma/benchmarks bench:browser` — Playwright in Chromium driving the real editor
  through `window.__sigma`: `loadDocument`, full frames at fit and 100% zoom (culling), pan,
  partial redraw, pointer-move latency, select-all overlay, JS heap.

Both write `tests/benchmarks/results/*-latest.md`. Methodology, what each metric means and
recorded results are in `docs/engine/benchmarks.md`; numbers are not repeated here. Benchmarks are
not part of `pnpm verify` or CI; they are run by hand when touching rendering, hit testing or the
document model.

## CI

`.github/workflows/ci.yml` runs on every push and pull request, with one concurrency group per
ref:

| Job              | Steps                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks`         | pnpm (version from `packageManager`), Node 22, `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm turbo run typecheck lint test build`                           |
| `api-migrations` | `postgres:17-alpine` service; `prisma migrate deploy`; `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` to fail on schema drift |

The Playwright suite and the benchmarks are **not** run in CI yet. `pnpm verify` locally is the
same task set as the `checks` job minus the format check.
