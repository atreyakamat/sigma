# Testing

## The pyramid as implemented

| Level      | Tool                | Where                                                             | Runs in                                    |
| ---------- | ------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Unit       | Vitest 5            | `packages/*/src/__tests__/*.test.ts`, `apps/api/src/**/*.spec.ts` | Node, headless (no DOM)                    |
| End-to-end | Playwright 1.65     | `tests/e2e/{fullstack,features,platform}.spec.ts`                 | headless Chromium against the Docker stack |
| Benchmarks | Vitest + Playwright | `tests/benchmarks/`                                               | Node and headless Chromium                 |

There is no separate integration tier yet: the engine tests exercise `document`, `history`,
`renderer` (viewport/text layout) and `engine` together through the real `Editor`, and the API
test boots a real Nest application with supertest.

## Unit tests

Counts from `pnpm test` at the time of writing:

| Package                | Files                                                                  | Tests | Covers                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sigma/geometry`      | `geometry.test.ts`, `path.test.ts`                                     |    27 | vec2/mat2d/rect, hit tests, Bézier, spatial index, SVG path parse/serialise, booleans, simplify/smooth                                               |
| `@sigma/document`      | `scene-graph.test.ts`, `components.test.ts`, `layout.test.ts`, `diff`  |    19 | hierarchy ops, batching, JSON round-trip, schema, instance projection, auto layout solver, constraints, document diff                                |
| `@sigma/history`       | `history.test.ts`                                                      |    12 | execute/undo of every command, merge window, nested transactions, `attach`, limit, events                                                            |
| `@sigma/renderer`      | `viewport.test.ts`                                                     |     7 | world/screen conversion, anchored zoom, clamping, `fitRect`, text layout fallback                                                                    |
| `@sigma/engine`        | `engine`, `components`, `layout`, `prototype`, `gestures` tests        |    38 | headless editor, hit testing, operations, shortcuts, component ops and override routing, relayout glue, prototype runtime, pinch gestures            |
| `@sigma/tools`         | `tools.test.ts`, `vector-tools.test.ts`                                |    24 | select/shape/text/image/hand tools, pen, pencil, vector edit                                                                                         |
| `@sigma/import-export` | `export.test.ts`, `svg-import.test.ts`                                 |     7 | SVG export, document round-trip, magic bytes, SVG import to nodes, design tokens                                                                     |
| `@sigma/collab`        | `collab.test.ts`                                                       |     8 | two bound graphs converge (inserts, updates, reparent, reorder, remove, meta), concurrent inserts, delete-vs-edit, derived exclusion, rebuild, reset |
| `@sigma/validation`    | `validation.test.ts`                                                   |     2 | normalisation and schemas                                                                                                                            |
| `@sigma/web`           | `commands`, `onboarding`, `i18n`, `realtime` tests                     |    25 | palette registry, onboarding checklist, dictionaries/locale persistence, realtime session through an in-memory relay                                 |
| `@sigma/api`           | `health.controller.spec.ts` (unit); `test/*.int.spec.ts` (integration) |  2+38 | HTTP health; auth, users, RBAC, documents, rate limit, versions/exports, comments/presence, libraries, assets/2FA/audit, thumbnails, realtime        |

Integration tests need PostgreSQL (`pnpm --filter @sigma/api test:integration`); each file truncates
the database first and starts a Nest application on a random port.

## End-to-end tests

Three serial Playwright suites run against the Docker stack on `http://localhost:3387`
(`E2E_BASE_URL` to override; the admin password is read from `docker compose logs api`, from
`E2E_ADMIN_PASSWORD`, or is the one a previous run set):

1. `fullstack.spec.ts` — first admin login with forced password change, user creation with a
   generated password, workspace/project/file creation, RBAC in the UI (view-only editor), the MVP
   drawing flow, autosave, reload, export.
2. `features.spec.ts` — onboarding checklist and palette, history panel and versions with diff and
   restore, comments, frame review states and server-enforced locks against a second user, live
   presence and cross-editor refresh, API tokens used for server-side rendering and tokens.
3. `platform.spec.ts` — the AI assistant with the demo provider and the operations API, realtime co-editing between two browsers without reloads, gradient editor,
   prototype interaction and preview player, image upload stored as an asset with a signed URL,
   two-factor enrolment / 2FA sign-in / session revocation / disabling, audit log, language switch
   to Hindi, tablet layout.

```sh
pnpm exec playwright install chromium   # once
docker compose --env-file .env.docker up -d --build
pnpm test:e2e
pnpm test:e2e --headed                  # watch it
```

**Modifier keys:** Playwright's `click({ modifiers: ['Shift'] })` does not set `shiftKey` on the
pointer events that the engine's `InputSystem` reads in headless Chromium, so the tests hold the
key explicitly with `keyboard.down('Shift')` around the click.

Selectors rely on `data-testid` hooks (`canvas-host`, `save-status`, `presence-avatars`,
`preview-frame`, `hotspot`, `gradient-editor`, `two-factor-form`, `audit-table`, …), inspector
field labels and button names. Changing those strings breaks the flows.

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
