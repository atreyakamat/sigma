# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Nothing has been released yet; every workspace
package is at `0.1.0`.

## [Unreleased]

### Milestone 0 — Foundation

#### Added

- pnpm 12 workspace (`apps/*`, `packages/*`) orchestrated by Turborepo with `typecheck`, `lint`,
  `test`, `build` and `dev` tasks ordered by package dependencies; root scripts `dev`, `build`,
  `typecheck`, `lint`, `test`, `verify`, `format`, `format:check`, `test:e2e`.
- Shared toolchain: TypeScript 6 with strict options (`tsconfig.base.json`), ESLint 10 flat config
  with `typescript-eslint`, Prettier, Vitest 5, Playwright 1.65, Node 22+.
- `@sigma/shared`: branded `NodeId` / `DocumentId`, `createId` (21-char URL-safe ids), typed
  `Emitter`, `assert`, `clamp`, `deepFreeze`.
- `apps/api` skeleton: NestJS 12 with global `/api/v1` prefix, `helmet`, `cookie-parser`, CORS
  for a single configured origin, global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`,
  `transform`), `@nestjs/config` with `class-validator` environment validation, a global
  `PrismaService` using `@prisma/adapter-pg`, `GET /api/v1/health`, and empty feature modules for
  auth, users, workspaces, memberships, projects, folders, documents, versions, assets, comments,
  permissions and collaboration. Multi-stage `Dockerfile`.
- Prisma 7 schema with 13 models (`User`, `Workspace`, `WorkspaceMember`, `Project`, `Folder`,
  `Document`, `DocumentSnapshot`, `DocumentUpdate`, `Asset`, `Comment`, `DocumentPermission`,
  `ShareToken`, `DocumentVersion`) and two enums, mapped to `snake_case` tables; initial SQL
  migration `0001_init` (copied to `infrastructure/database/0001_init.sql`).
- `infrastructure/docker/docker-compose.yml`: PostgreSQL 17, Redis 7, MinIO with a one-shot
  bucket initialiser; `.env.example` matching it.
- GitHub Actions CI: format check + `turbo run typecheck lint test build`, and a job that applies
  the migrations to PostgreSQL 17 and fails on schema drift.
- `docs/api/README.md` describing the API layout, environment and planned endpoints.

### Milestone 1 — Engine foundation

#### Added

- `@sigma/geometry`: `vec2`, `mat2d` (canvas-compatible affine matrices with transform
  decomposition), `rect` (union, intersection, transformed bounds), hit tests (point in rect /
  ellipse / polygon, distance to segment, segment intersection, regular polygon and star points),
  cubic/quadratic bezier evaluation, bounds and flattening, and `SpatialIndex` (uniform grid
  hash).
- `@sigma/document`: zod 4 schema version 1 with strict objects for colors, paints (solid, linear
  and radial gradients, image), strokes, effects (drop shadow, layer blur), blend modes, corner
  radii, text styles, path commands, constraints and eleven node types (`PAGE`, `FRAME`, `GROUP`,
  `RECTANGLE`, `ELLIPSE`, `LINE`, `POLYGON`, `STAR`, `TEXT`, `IMAGE`, `VECTOR`); nested
  `DocumentJSON` with duplicate-id and page-at-root checks; `SceneGraph` flat node map with
  `parentId`/`childIds`, immutable nodes, revision counter, coalesced `change` events, cached world
  matrices, local/world/parent bounds, insert/remove/reparent/reorder/update/replace and detached
  `Subtree`s; `createNodeProps` factories with per-type default styles; `MIGRATIONS` registry and
  `migrateDocument`; color helpers.
- `@sigma/history`: `Command` interface and `BaseCommand`; `History` with validation before
  execute, merge keys and a 1 s merge window, explicit boundaries, transactions
  (`beginTransaction`/`commit`/`abort`/`transact`), 200-entry limit and events; commands
  `CreateNode`, `DeleteNode`, `ReparentNode`, `ReorderNode`, `ReplaceNode`, `UpdateNodes` (with
  merge), `MoveNodes`, `ResizeNode`, `RotateNode`, `UpdateStyle`, `SetTransforms`, `GroupNodes`,
  `UngroupNodes`, `Batch`.
- `@sigma/renderer`: `Viewport` camera (zoom 0.02–256, anchored zoom, pan, fit, center);
  `Renderer` interface; `Canvas2DRenderer` with viewport culling, dirty-region partial redraws,
  device-pixel-ratio handling and frame stats; drawing primitives for every node type including
  fills, gradients, image paints with scale modes, strokes with alignment/caps/joins/dashes,
  effects, blend modes, opacity, corner radii and frame clipping; `ImageCache`; text layout
  (`layoutText`, `cssFont`, text transforms) with a Node fallback; `rasterizeNodes` for offscreen
  rendering.
- `@sigma/engine`: `Editor` façade owning document, history, viewport, selection, hit testing,
  tools, keymap, input, operations, clipboard and the two-canvas render loop;
  `SelectionManager` (set/add/remove/toggle, hover, prune, bounds); `HitTester` backed by the
  spatial index with z-order resolution, precise per-type geometry tests and incremental updates;
  `ToolManager` with temporary tools; `Keymap` with normalised combos; `InputSystem` (pointer
  capture, click counting, space-to-pan, wheel pan/zoom, pinch); selection-frame transform math
  (resize handles, rotation, flips, multi-node proportional scaling); edge/center/grid/pixel
  snapping with guides; overlay drawing (grid, rulers, selection, hover, snap guides, frame labels,
  marquee).
- Headless unit tests for geometry, document, history, renderer and engine.

### Milestone 2 — Editing

#### Added

- `@sigma/engine` `EditorOperations`: delete, duplicate, insert JSON, move/nudge, set transform
  and size, flip, align (6 modes), distribute, group/ungroup, frame selection, reparent/reorder,
  bring forward/backward/to front/to back, set props, rename, visibility, lock, style, text and
  text style (with auto-resize measurement), add/delete page, top-level selection filtering.
  `EditorClipboard` (copy/cut/paste with world-space placement and same-page offset, mirrored to
  the system clipboard as JSON). PNG export (`exportPng`, `exportPngDataUrl`, `downloadBlob`).
  Default shortcuts (`registerDefaultShortcuts`): undo/redo, delete, duplicate, group/ungroup,
  frame selection, select all, nudge (1/10 px), z-order, flip, lock/visibility toggles,
  copy/cut/paste, zoom to 100%/fit/selection, zoom in/out, pixel grid/rulers/grid toggles, enter
  to edit text or drill into a group, shift+enter to select the parent.
- `@sigma/tools`: `BaseTool`; `SelectTool` (click, shift-click toggle, marquee, drag-move with
  snapping, resize via eight handles with shift = proportional and alt = from center, rotate from
  outside corners with shift = 15° steps, alt-drag duplicate, double-click to edit text or enter a
  group, hover); `ShapeTool` base (shift = square, alt = from center, click = default size,
  parenting into the frame under the pointer) with `Rectangle` (`R`), `Ellipse` (`O`), `Frame`
  (`F`), `Line` (`L`), `Polygon` and `Star` tools; `TextTool` (`T`); `ImageTool` placing a pending
  image at natural or dragged size; `HandTool` (`H`, also temporary via space);
  `registerDefaultTools`.
- `@sigma/import-export`: SVG export of pages or node sets with transforms, paints, gradients,
  strokes, text and paths; image import with magic-byte type sniffing, a 20 MB cap and natural
  size measurement; `.sigma.json` document file serialisation and parsing with migration and
  validation.
- `@sigma/validation`: strict zod contracts for register/login, workspaces, projects, folders,
  documents (including full document content), roles, sharing, comments and pagination.
- `apps/web` (React 19, Vite 8, Tailwind 4, Zustand, TanStack Query, React Router): dashboard
  listing files with thumbnails, create/rename/duplicate/delete and `.sigma.json` import;
  editor page with toolbar (tools, undo/redo, panel toggles, save status, export menu), layers panel (tree with
  drag-and-drop reparent/reorder, rename, lock and visibility toggles, type icons), pages panel
  (add, switch, rename, delete), inspector (position/size/rotation, alignment and distribution,
  flips, fills, strokes, effects, opacity, blend mode, corner radius, text properties, frame clip,
  polygon/star parameters, image scale mode), status bar (layer and selection counts,
  zoom controls), context menu, inline text editing overlay, drag-and-drop and file-picker image
  placement, PNG/SVG/JSON export menu.
- Local-first persistence: `DocumentRepository` interface with an IndexedDB
  `LocalDocumentRepository` (schema-validated on every read and write), debounced autosave
  (600 ms) with page thumbnails, flush on tab hide and unmount, unsaved-changes warning.
- Playwright end-to-end suite (`tests/e2e/editor.spec.ts`): full create → draw → edit → undo/redo
  → group → autosave → reload → reopen → export flow, plus zoom/pan/delete.
- Benchmarks package (`tests/benchmarks`) generating 100 / 1,000 / 10,000-node documents for
  headless and in-browser measurements; `window.__sigma` exposed in dev builds for it.
- Unit tests for tools, import-export and validation.

#### Changed

- Root quality-gate script renamed from `ci` to `verify` (`turbo run typecheck lint test build`).

#### Known gaps

- API business endpoints, authentication and cloud persistence are not implemented
  (Milestone 3). Realtime collaboration is planned (ADR-0004).
- `apps/web` has no unit tests; UI behaviour is covered by the end-to-end flow only.
- Playwright and benchmarks do not run in CI.

### Milestone 3 — Self-hosted persistence, accounts and RBAC (2026-11-08)

- API: session authentication (scrypt, hashed tokens, httpOnly cookie, CSRF origin check, login
  throttling), bootstrap administrator with a generated or configured password, user
  administration (create with generated password, reset, role, deactivate, delete with workspace
  ownership transfer), workspaces with OWNER/ADMIN/EDITOR/VIEWER members, projects, documents with
  server-side content, revision-based optimistic concurrency and soft delete. Permission matrix
  shared with the client in `@sigma/validation`. Prisma migration `0002_auth_rbac`. 22 integration
  tests against PostgreSQL. Production build bundled with Vite; Docker image migrates on start.
- Web: login and forced password change, workspace/project/file navigation, members management,
  admin users page with one-time temporary password display, API-backed autosave with conflict
  banner, read-only editor for viewers, toasts. IndexedDB persistence removed. 12 unit tests.
- Infrastructure: root `docker-compose.yml` (nginx web, api, postgres, redis) with
  `.env.docker.example`; MinIO removed until uploads exist. Full-stack Playwright suite (6
  scenarios) runs against the stack.
- Dependencies: `@nestjs/throttler`, `pg`, `dotenv`, `vite` (api build), `@testing-library/*`,
  `jsdom`.

### Milestones 5–7 — Vector tools, design systems, realtime co-editing, prototyping, hardening (2026-11-08)

#### Added

- Vector tools: pen (click/drag Bézier handles, close paths), pencil (freehand with Ramer–Douglas–
  Peucker simplification and Catmull-Rom smoothing), vector edit mode (`Enter` on a path; drag
  anchors and handles), path boolean operations (union, subtract, intersect, exclude via
  `polygon-clipping`), flatten shapes to vectors, SVG import as vector nodes (drop onto the canvas
  or import as a file; own XML parser), SVG path parsing/serialising in `@sigma/geometry`.
- Design systems: components, component sets (variants), instances with per-node overrides routed
  back to the right projected child, "create component", detach, reset overrides, swap variant,
  go to main component; shared workspace libraries (`library_components`, migration `0004_library`)
  published from a file and inserted from the Components panel. Auto layout (direction, gaps,
  padding, alignment, wrap, hug/fixed/fill sizing, min/max) with a deterministic solver glued into
  the same history entry as the triggering edit; constraints applied on frame resize.
- Realtime co-editing (`@sigma/collab`, ADR-0012): Yjs rooms per open document on the presence
  socket (`sync` / `update` messages), deterministic hierarchy reconciliation so concurrent inserts
  converge, server-side persistence of the room into `documents.content` after a 1 s debounce with
  revision bumps, thumbnails and `saved` broadcasts, viewer writes refused, HTTP replacements
  (restore, CLI) re-synchronise every participant, offline edits merged on reconnect, automatic
  fallback to revision-checked HTTP saves when the socket is down.
- Prototyping: interactions on any layer (click, hover, drag, after delay, key) with navigate /
  overlay / back / close / scroll-to / open-URL actions and transitions (dissolve, slide, push,
  smart), flow starting point per page, connection arrows overlay (toolbar toggle), and a preview
  player at `/file/:id/preview` driven by the engine's `PrototypeRuntime` with CSS transitions,
  overlays, timed triggers, key triggers, back navigation and screen stepping.
- Gradient editing UI: fill type switcher (solid / linear / radial / image), angle, radial centre
  and radius, draggable-by-value stops with colour and position, add/remove stops.
- Assets: uploads to `POST /workspaces/:id/assets` (multipart, magic-byte sniffing, configurable
  size cap), local-disk or S3-compatible storage, permission-checked content endpoint, HMAC-signed
  expiring URLs; the image tool uploads when online and keeps a data URL when offline; server
  exports and thumbnails resolve asset images. Images draw through a clip-and-`drawImage` path so
  server-side rendering needs no `DOMMatrix`.
- Hardening: TOTP two-factor authentication with QR enrolment and hashed recovery codes
  (migration `0005_hardening`), session listing and revocation, administrative audit log with UI,
  Prometheus `GET /metrics`, health endpoint with database status, optional Caddy HTTPS edge
  (`docker compose --profile https`), persistent `api-data` volume for uploads,
  `scripts/backup.sh` / `scripts/restore.sh`.
- Polish: server-side thumbnails for files saved without one (CLI, realtime), comments anchored to
  layers (pins follow the node), pinch-to-zoom and two-finger pan on touch devices, tablet/phone
  layout with floating side panels, i18n infrastructure with English and Hindi and a language
  switch in the account menu, 2FA step on the login page, Security and Audit pages.
- Tests: geometry 27, document 19, history 12, engine 38, tools 24, import-export 7, collab 8,
  web 25 unit tests; API 38 integration tests (incl. realtime, assets, 2FA, audit, thumbnails);
  20 end-to-end scenarios across three suites (realtime convergence in two browsers, prototype
  preview, gradient editor, asset upload with signed URL, 2FA enrolment/sign-in/sessions, audit log,
  language switch, tablet layout).
- Dependencies: `yjs`, `polygon-clipping`, `multer`, `@aws-sdk/client-s3` (optional storage).

#### Changed

- Autosave skips HTTP while realtime is synced; the server persists and reports `saved`.
- Scene graph: `setChildOrder` for collaborative reconciliation; `removeNode` excludes projected
  instance children from the restorable subtree.
- `History.attach` glues follow-up commands (relayout) into the previous entry; nested transactions.

### Milestone 4 — Standout features: guidance, history, handoff, collaboration (2026-11-08)

- Onboarding: per-user "Get started" checklist bound to real engine events, one-time contextual
  hints (rotation, resize, snapping, text, groups, palette), keyboard-shortcut panel (`?`).
- Command palette (`⌘K`) over every editor operation, tool and device frame preset, with recents.
- Undo history panel with thumbnails; right-click "Paste here" and "New frame here" presets;
  last-used text style and frame size remembered; images placed at the viewport centre.
- Version history: named checkpoints, automatic hourly snapshots on save, side-by-side thumbnails,
  structural diff by node id (`diffDocuments`), restore with a safety checkpoint.
- Developer handoff: server-side rendering `GET /documents/:id/export.svg|png` (frame or page),
  design tokens `tokens.json` / `tokens.css` (colours, typography, radii named after layers),
  `frames` listing with review states, personal API tokens (`Authorization: Bearer sgm_…`),
  `@sigma/cli` (`sigma export`, `export-all`, `tokens`, `checkpoint`, `versions`, `frames`).
  Git-friendly `.sigma.json` export with sorted keys.
- Review workflow: frame review states (Draft → In review → Approved) with badges on the canvas;
  per-frame locks enforced on save (409 with the holder) and in the editor (locked frames are
  not selectable by others); `?approved=true` filters handoff endpoints.
- Comments: pins on the canvas (press `C`), threads with replies, resolve/reopen, comment panel;
  viewers can comment, editors moderate.
- Live presence over WebSocket (`/api/v1/presence`): avatars, remote cursors and selections,
  "saved" notifications that refresh idle editors or warn dirty ones. Realtime co-editing via CRDT
  remains planned.
- Resilience: offline edits are kept in the browser and retried; a session that expires mid-edit
  opens a re-login dialog instead of losing work.
- API: migration `0003_versions_tokens` (snapshot content, `api_tokens`); 28 integration tests.
  Web: 16 unit tests. End-to-end: 12 scenarios across two suites.
- Dependencies: `@napi-rs/canvas` (server PNG), `ws`, `globals` (CLI lint).
