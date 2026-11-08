# SIGMA — Master Engineering Instruction (v2)

This is the operating manual for anyone (human or coding agent) building SIGMA. It supersedes the
original master instruction. Changes from v1 are summarised at the end.

---

## 0. Current state (update this section at every milestone)

| Item                                           | State                                                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Milestone 0 Foundation                         | Done                                                                                                           |
| Milestone 1 Engine foundation                  | Done                                                                                                           |
| Milestone 2 Editing                            | Done (local-first persistence included)                                                                        |
| Milestone 3 Persistence (accounts, API, cloud) | Next                                                                                                           |
| Quality gates                                  | `pnpm verify` (typecheck, lint, unit tests, build) · `pnpm test:e2e` · `pnpm --filter @sigma/benchmarks bench` |
| Known limits                                   | see `docs/EDITOR_ENGINE.md` → Known limitations, `docs/engine/benchmarks.md`                                   |

Before any work: read `README.md`, `docs/ARCHITECTURE.md`, the relevant ADRs in `docs/decisions/`,
and `CHANGELOG.md`. Then run `pnpm verify`. If it is red, fix that first.

---

## 1. Role and objective

Act as principal architect, graphics-engine engineer, full-stack developer and QA engineer.
Build SIGMA: an original, browser-based collaborative design platform — interface design, vector
graphics, components, auto layout, prototyping, real-time collaboration, design systems, assets,
import/export, version history, developer handoff.

Optimise for working, tested, maintainable software. Never optimise for the appearance of
completion.

Hard rules:

1. Original software only. No proprietary code, trademarks, branding or assets of other products.
2. No static demos, no frontend-only prototypes, no placeholder functions for required features.
3. Never claim something works without a test that proves it.

---

## 2. Engineering rules

1. Inspect before changing. Preserve working code; replace only with a documented technical reason.
2. TypeScript everywhere, strict configuration (`tsconfig.base.json` is the single source).
3. Interfaces and data contracts before implementations of any subsystem.
4. The engine (`packages/*`) never imports React or touches the DOM outside `Editor.mount()`.
5. All document mutations go through commands (`@sigma/history`) via `EditorOperations`. Tools and
   UI never call `SceneGraph` mutators directly.
6. Rendering never mutates the document and never becomes a source of truth.
7. Validate every external input with zod (`@sigma/document`, `@sigma/validation`), reject unknown
   keys, never trust file extensions or client-declared MIME types.
8. Each feature ships with unit tests; cross-package behaviour with integration tests; user flows
   with Playwright. Run `pnpm verify` before reporting.
9. Record architectural decisions as ADRs (`docs/decisions/NNNN-*.md`: Status, Context, Decision,
   Alternatives, Consequences).
10. One concern per file; one package per subsystem; no circular dependencies (the package graph in
    §4 is enforced by per-package typechecks).
11. No new dependency without a one-line justification in the PR/report. Check compatibility with
    the pinned toolchain first (TypeScript 6.x — TS 7 is not yet supported by typescript-eslint or
    the Nest CLI; see ADR-0008).
12. When a requirement is unclear, choose the technically sound default, implement it, and document
    the choice (ADR for architecture, code comment or doc for behaviour).

---

## 3. Technology stack (locked)

| Area           | Choice                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | React 19, TypeScript, Vite 8, Tailwind CSS 4, Zustand (UI state only), TanStack Query (server/repository state), React Router |
| Editor engine  | Custom TypeScript packages; Canvas 2D renderer behind a `Renderer` interface; WebGL later                                     |
| Backend        | NestJS 12, Prisma 7, PostgreSQL 17, Redis 7, BullMQ, WebSockets                                                               |
| Collaboration  | Yjs + WebSocket transport, persisted update log + snapshots, awareness for presence                                           |
| Infrastructure | Docker Compose (postgres, redis, minio), Nginx/Caddy, GitHub Actions                                                          |
| Monorepo       | pnpm 12 workspaces + Turborepo; packages export TypeScript source (ADR-0007)                                                  |
| Testing        | Vitest (unit/integration), Playwright (e2e + browser benchmarks), `@nestjs/testing`                                           |

---

## 4. Repository architecture and ownership

```
apps/web                 UI           depends on: engine, tools, import-export, document, renderer
apps/api                 backend      depends on: validation (planned), prisma
packages/shared          ids, emitter
packages/geometry        → shared
packages/document        → shared, geometry
packages/history         → document
packages/renderer        → document, geometry
packages/engine          → history, renderer, document, geometry
packages/tools           → engine
packages/import-export   → document, renderer, geometry
packages/validation      → document
packages/collaboration   (Milestone 6) → document, history
packages/ui              (optional, when a second app needs shared components)
tests/e2e                Playwright flows
tests/benchmarks         @sigma/benchmarks (100 / 1k / 10k documents)
infrastructure/{docker,database,storage,deployment}
docs/{architecture,engine,api,development,decisions}
```

Ownership for parallel work: one owner per package per task. Integration happens only through a
package's `src/index.ts` exports. Two agents never edit the same package concurrently; the engine
packages (`document`, `history`, `engine`) are single-owner at all times.

Extension recipes live in `docs/DEVELOPMENT.md` (adding a tool, a node type, a command, an API
module).

---

## 5. Editor engine requirements (status)

Legend: ✅ implemented · 🔜 planned (milestone in brackets)

### 5.1 Document model

✅ Versioned strict schema (v1) with migrations registry · pages, frames, groups, rectangles,
ellipses, lines, polygons, stars, text, images, vector paths · stable random ids · flat scene graph
with `parentId`/`childIds`, nested JSON on disk · 🔜 components and instances (M5).

### 5.2 Scene graph

✅ create/delete/find/update/reparent/insert/remove/reorder/traverse/ancestors/depth · cycle and
container validation · batched change events · world matrix cache · group bounds from children.

### 5.3 Geometry

✅ vec2, mat2d, rect, point-in-rect/ellipse/polygon, segment distance, line/segment intersection,
Bézier point/split/flatten/bounds/length, regular polygon and star points, grid spatial index.
🔜 path boolean operations and clipping (M4).

### 5.4 Rendering

✅ viewport (world/screen), zoom, pan, layer order, culling, dirty regions, overlay canvas with
selection, handles, guides, grid, pixel grid, rulers, frame labels. 🔜 WebGL backend when
benchmarks require it.

### 5.5 Input

✅ pointer events with capture, double-click, wheel pan/zoom, pinch (ctrl+wheel), keyboard with
modifier normalisation, editable-element guard, space-to-pan, middle-button pan.

### 5.6 Tools

✅ select, hand, frame, rectangle, ellipse, line, polygon, star, text, image — one interface, one
registry, one dispatcher. 🔜 pen, pencil (M4).

### 5.7 Selection and transformation

✅ single/multi/marquee, oriented bounding box, 8 resize handles, rotation zones, move, resize
(proportional, from center, flips), rotate (15° with shift), flip, align, distribute, group,
ungroup, frame selection, snapping with guides.

### 5.8 Commands

✅ Create, Delete, Reparent, Reorder, Replace, UpdateNodes (+ Move, Resize, Rotate, UpdateStyle,
SetTransforms), Group, Ungroup, Batch — each with validate/execute/undo/affected ids.

### 5.9 History

✅ undo/redo, merge by key within a window, boundaries, transactions, limit, revision tracking.
🔜 collaborative undo scoping (M6).

---

## 6. Design features order

Initial graphics ✅ → styling ✅ (gradients render/export; gradient _editing UI_ is 🔜) →
typography ✅ (font family/weight/size/line height/letter spacing/align/decoration/transform/wrap)
→ vector editing 🔜 (M4) → components 🔜 (M5) → auto layout 🔜 (M5).

---

## 7. Frontend interface

Five regions ✅: top toolbar, left sidebar (layers, pages, assets), canvas, right inspector,
bottom status bar. Dashboard ✅ (recent files, create/rename/duplicate/delete/import). 🔜 sign-in,
registration, workspace selector, projects, folders, templates, team members, settings (M3).

Rule: every visible control performs its action. If a feature is not implemented, the control does
not exist (or explains, in one sentence, when it arrives — as the Assets tab does today).

---

## 8. Persistence

✅ serialization, deserialization, schema validation, autosave (600 ms debounce) to the API with
revision-based conflict detection and a reload banner, save status, recovery after refresh,
document reopening, `.sigma.json` import/export (ADR-0010). ✅ versions (named + hourly automatic), diff and restore; offline queue with recovery; presence
`saved` refresh. 🔜 snapshots in object storage, Yjs update log.

---

## 9. Backend

✅ NestJS modules for auth (scrypt, hashed sessions, CSRF origin check, login throttling), users
(admin-managed, generated passwords, reset, deactivate, delete with ownership transfer), workspaces

- members, projects, documents (content with optimistic concurrency, soft delete); zod validation
  from `@sigma/validation`; `PermissionsService.assert` on every protected route; bootstrap admin;
  22 integration tests against PostgreSQL; Vite-bundled production build; Docker image that migrates
  on start. ✅ comments, versions, server-side SVG/PNG export, design tokens, frames listing, API tokens,
  presence WebSocket. 🔜 assets/uploads, share links.

---

## 10. Collaboration

✅ Presence (avatars, cursors, selections), `saved` notifications, frame locks enforced on save,
review states, comments. 🔜 CRDT co-editing:

Yjs `Y.Map` mirroring the flat scene graph; WebSocket transport; awareness (cursors, selection,
presence); persisted updates in `document_updates`, compaction to snapshots; reconnection with
state vectors; access validated before joining. Local UI state is never synchronised.

---

## 11. Import and export

✅ PNG/JPEG/WebP/GIF/SVG image import with magic-byte validation and size cap; PNG export at any
scale; SVG export; JSON document export/import. 🔜 PDF export (M4), SVG _import_ as vector nodes
(M4), legally-safe interoperability research (later).

---

## 12. Security

See `docs/SECURITY.md`. Implemented: scrypt hashing, hashed server-side sessions in secure cookies,
role authorization on every route, login rate limiting, CSRF origin check, strict validation,
upload sniffing, env validation, no secrets in client code. 🔜 signed asset URLs, audit log, 2FA.

---

## 13. Testing and benchmarks

- Unit: every package (`pnpm test`). Every command has execute+undo tests. Geometry, schema,
  scene graph, hit testing, transforms, snapping, keymap, tools (synthetic pointer events) are
  covered.
- E2E: `pnpm test:e2e` runs the MVP flow (create, draw, edit, undo/redo, group, autosave, refresh,
  reopen, export PNG + SVG) and zoom/pan/delete.
- Benchmarks: `tests/benchmarks` — 100/1k/10k nodes, headless and browser. Record results in
  `docs/engine/` with a date. Never state a performance target is met without a recorded run.
- Collaboration (M6): two independent browser contexts must converge.

---

## 14. Milestones

Each milestone has entry criteria, deliverables and exit criteria. Do not start a milestone whose
entry criteria fail.

| #   | Milestone            | Entry             | Exit (all must pass)                                                                                                                  |
| --- | -------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Foundation           | —                 | `pnpm verify` green, Docker Compose validates, docs skeleton ✅                                                                       |
| 1   | Engine foundation    | M0                | rect/ellipse/select/move/resize/delete/zoom/pan headless tests ✅                                                                     |
| 2   | Editing              | M1                | layers, text, images, styling, multi-select, groups, commands, undo/redo, shortcuts, e2e flow ✅                                      |
| 3   | Persistence          | M2                | register/login, workspace, project, document CRUD via API, autosave to API, assets upload to S3, e2e against API, authorization tests |
| 4   | Advanced graphics    | M3                | pen/pencil, vector editing, gradient UI, boolean ops, SVG import, PDF export, tests                                                   |
| 5   | Design systems       | M4                | components, instances, overrides, variants, auto layout, constraints, libraries                                                       |
| 6   | Collaboration        | M3 (+5 preferred) | Yjs sync, presence, cursors, persistence, reconnection, 2-browser convergence test, version history                                   |
| 7   | Prototyping          | M5                | connections, interactions, transitions, preview player                                                                                |
| 8   | Production readiness | M6, M7            | security + performance audits, monitoring, deployment, beta                                                                           |

---

## 15. Workflow for every task

1. Inspect the repository and `pnpm verify`.
2. Read the architecture docs and ADRs touching the area.
3. Identify affected packages and their owners.
4. Write/extend interfaces and contracts first (types, zod schemas, command signatures).
5. Implement the smallest complete, user-visible slice.
6. Unit tests → integration tests → e2e when a user flow changed.
7. `pnpm verify`; fix everything it reports. Format with `pnpm format`.
8. Update docs, ADRs and `CHANGELOG.md`.
9. Report using the template in §16. Never skip a failed test silently; never proceed to a
   dependent milestone on a red gate.

---

## 16. Milestone report template

```
## Milestone N — <name>
1. Implemented features (what a user can now do)
2. Modified/added files (grouped by package)
3. New dependencies (name, version, why)
4. Database changes (models, migrations)
5. Tests executed (commands)
6. Test results (counts, failures with output)
7. Benchmarks (if performance-relevant; link to recorded results)
8. Known limitations
9. Remaining tasks
10. Next milestone and its entry criteria status
```

If context or execution limits interrupt work: commit nothing half-done to `main`, leave the tree
building, and write a continuation report with exact next steps.

---

## 17. Acceptance criteria for the MVP

A user can: sign in with an admin-issued account and change the password ✅ · create a workspace and
project ✅ · be added to a workspace with a role that the server enforces ✅ · create a design
document ✅ · open the editor ✅ · draw shapes ✅ · create text ✅ · select ✅ · move ✅ · resize ✅ ·
rotate ✅ · change fills and strokes ✅ · manage layers ✅ · group ✅ · undo/redo ✅ · autosave ✅ ·
refresh ✅ · reopen ✅ · export PNG ✅ · export SVG ✅. The editor depends on no third-party design
application ✅.

---

## What changed from v1 and why

- **Added a living status table (§0)** so an agent starting cold knows what exists and which gate to run.
- **Fixed the implementation order**: geometry before the document schema (the schema's bounds and
  matrices depend on geometry); local-first persistence moved into M2 so M1/M2 are usable products,
  not "frontend-only prototypes".
- **Made the package graph explicit and enforced** (§4) with single-owner rules for engine packages,
  replacing the loose "parallelize only independent tasks".
- **Replaced feature lists with status-tagged requirements** (✅/🔜 with milestone) to stop re-implementation and to make gaps visible.
- **Added entry/exit criteria per milestone** and the exact commands that constitute a gate.
- **Added a benchmark protocol** (documents, metrics, where results are recorded) instead of "measure" in the abstract.
- **Pinned toolchain constraints** (TypeScript 6, pnpm 12 build-script approval, Prisma 7 adapters) that cost time when discovered late.
- **Deferred `packages/ui` and `packages/collaboration`** until they have content; empty packages are placeholders, which v1 itself forbids.
- **Clarified the "no decorative controls" rule** with the allowed exception (a one-sentence note on when a feature arrives).
- **Added a continuation protocol** for interrupted work and a concrete report template.
