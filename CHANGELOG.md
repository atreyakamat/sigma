# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Nothing yet.

## [0.3.3] — 2026-11-09

Desktop installers that include password reset and restore (v0.3.2's desktop build failed in CI).

#### Fixed

- Restore: the copied database folder is made owner-only on Linux and macOS and granted to the
  current user on Windows, so the database starts after a restore on every system.
- Windows: `pg_ctl` output is written to `pg_ctl.log` in the data folder for diagnosis.

## [0.3.2] — 2026-11-09

#### Added

- Desktop: **Reset password…** (menu and a "Forgot your password?" link on the sign-in page). Works
  only in the app window on the computer running SIGMA: the API endpoint (`POST /setup/local-reset`)
  requires a per-run secret held by the desktop shell. Signs the account out everywhere.
- Desktop: **Restore from backup…** replaces the database and uploads with a backup and keeps the
  previous data in a `before-restore-<time>` folder.
- The AI assistant and providers page are labelled **Beta**, stating what is coming soon
  (streaming replies, verified Claude and OpenAI support).
- README: desktop first-launch screenshot; troubleshooting entries for a forgotten password and a
  clean start.

#### Changed

- The v0.3.0 GitHub release is marked as superseded (it had no installers and its tag contains a
  test data folder committed by mistake). It could not be deleted from this environment.

## [0.3.1] — 2026-11-09

First release that carries the desktop installers (v0.3.0 had none: its build failed in CI).

#### Fixed

- Removed a test data folder (`apps/desktop/.tmp-pack`) that was committed by mistake in v0.3.0
  and broke packaging; it is ignored now.
- Windows: the bundled PostgreSQL is started through `pg_ctl` (required when running elevated),
  located through the database library, launched without inherited pipes, and the database is
  created over a plain connection.
- macOS: unset signing variables are no longer read as file paths.
- Windows installer: the packaging tool runs from a short path (NSIS 260-character limit), with a
  zip package as fallback.

#### Verified in CI

- Linux, macOS and Windows: runtime tests, installer build, and the packaged-app check (web
  client, first-run setup, edits, native PNG export) all pass. No installer has been run by hand
  on Windows or macOS, and none is code-signed.

## [0.3.0] — 2026-11-09

#### Added

- **SIGMA Desktop** (`apps/desktop`): a normal desktop application that needs no Docker. An
  Electron window around the existing server running in-process with a bundled PostgreSQL;
  designs, uploads and settings live in the user's data folder. First launch shows a setup screen
  (create your account, land in a starter file). Menu: Share on this network (teammates join from
  a browser), Back up now, Open data folder. Clean shutdown, recovery from an unclean one, and a
  fallback port when 3387 is taken.
- Embeddable server: `startSigma()` (`apps/api/src/embedded.ts`) serves the web client, API and
  realtime socket from one port with the same security headers as the Docker stack;
  `applyMigrations()` applies the SQL migrations without the Prisma CLI; `GET /setup/status` and
  `POST /setup` for first-run account creation (desktop mode only).
- Packaging: `pnpm desktop:build` (electron-builder) produces AppImage/deb, NSIS `.exe` and `.dmg`;
  `.github/workflows/desktop.yml` builds and checks them on Linux, Windows and macOS and attaches
  them to the release. `apps/desktop/test/packaged-check.mjs` verifies a packaged build end to end.

#### Verified

- Linux: runtime tests (6), Electron smoke test (setup → draw → quit → relaunch → data kept), and
  the packaged build check on the unpacked app; the AppImage (183 MB) starts and serves.
- Windows and macOS installers are produced by CI only and have not been run by hand. They are
  unsigned, so both systems show a warning on first launch.

## [0.2.1] — 2026-11-10

#### Added

- One-line installers for people who do not use git or build tools: `install/install.sh` (macOS,
  Linux) and `install/install.ps1` (Windows). They check Docker, download published images, create
  secrets and an administrator password, start SIGMA, open the browser, write `SIGMA-LOGIN.txt`,
  and leave start / stop / update / backup launchers. Downloads are retried and the installer is
  safe to run again.
- `install/docker-compose.yml`: build-free stack on published images; `install/README.md`.

## [0.2.0] — 2026-11-09

#### Added

- **AI assistant in the editor** (left sidebar → AI): chat in plain language and the assistant
  reads and edits the open file through server-side tools. Edits appear live for everyone, are
  saved as normal revisions and respect roles (viewers get a read-only assistant).
- **Pluggable AI providers** (Admin → AI providers): Anthropic (Claude, official SDK), OpenAI, any
  OpenAI-compatible endpoint with tool calling (Ollama, LM Studio, vLLM, OpenRouter, Groq, …), and
  a built-in rule-based demo provider that needs no account. Keys are stored encrypted; a Test
  button checks each configuration end to end.
- **MCP server** (`packages/mcp`, `sigma-mcp`): 15 tools so Claude Code, Claude Desktop and other
  MCP clients can list and create files, read outlines, apply edit operations, render PNG/SVG,
  extract tokens, save versions and create share links. Ships with a `sigma-design` Claude skill
  and an `.mcp.json.example` (`integrations/claude/`).
- **Document operations API**: `POST /documents/:id/ops` (validated add / update / move / delete /
  rename with per-operation results) and `GET /documents/:id/outline`; the shared editing surface
  of the assistant, the MCP server and scripts (`applyDocumentOps`, `outlineDocument` in
  `@sigma/document`).
- User-facing README with screenshots, a five-minute quick start, feature tour and guides.
- Migration `0006_ai` (`ai_providers`).

#### Changed

- The UI is served on port **3387** by default (`WEB_PORT`, `PUBLIC_URL`).

#### Tests

- API integration 47 (ops, providers, assistant against mock Anthropic and OpenAI-style servers),
  document 25, MCP 4, e2e 22 scenarios.

## [0.1.2] — 2026-11-09

#### Fixed

- Sign-in failed with "Cross-origin request rejected" whenever the stack was served on a port
  other than the one in `PUBLIC_URL` (for example `WEB_PORT=3100`): nginx forwarded `Host` without
  the port, so the CSRF origin check could not match the request's own origin. nginx now forwards
  `$http_host`. Found by the clean-clone install test on a non-default port.
- `GET /health` reports the real build version (injected from `package.json` at build time)
  instead of a hard-coded `0.1.0`.

## [0.1.1] — 2026-11-09

#### Fixed

- Web container failed to start from a fresh clone: the nginx security-header snippet had been
  rewrapped by the formatter into invalid syntax. The snippet is now `security-headers.conf`,
  excluded from formatting, and verified by a clean-clone install test. v0.1.0 images are
  superseded by this release.

## [0.1.0] — 2026-11-09

First release: the self-hosted stack described in `docs/LAUNCH.md`. Licence: MIT. Install by
cloning the repository and running `docker compose up --build`; images are also published to
`ghcr.io/atreyakamat/sigma-web` and `ghcr.io/atreyakamat/sigma-api`. The milestone sections
below list everything included.

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

### Milestone 8 — Production readiness (2026-11-09)

#### Added

- Launch definition (`docs/LAUNCH.md`): scope of v0.1.0, out-of-scope list, go/no-go checklist
  with verification commands, open decisions needing an owner (licence, name, registry, support
  channel, storage, password length), release procedure and rollback.
- Share links: `POST/GET /documents/:id/share-links`, `DELETE /share-links/:id`, public
  `GET /share/:token` (+ `export.svg|png|pdf`); Share dialog in the toolbar (create with access
  level and expiry, copy, revoke); `/share/:token` opens a read-only "Shared view" without an
  account, polling for new revisions.
- PDF export: in-house PDF 1.4 writer (`@sigma/import-export` `buildPdf`), one raster page per
  frame with Flate compression; `GET /documents/:id/export.pdf?scale=&frame=&approved=`,
  "Download PDF" in the export menu, `sigma export file.pdf` and `export-all --format pdf`.
- Release pipeline: `.github/workflows/release.yml` builds `sigma-web` / `sigma-api` images from a
  `v*` tag, pushes them to GHCR and creates a GitHub release with the compose files;
  `pnpm release:bump <version>`.
- Security: common-password denylist in `PasswordSchema`; nginx Content Security Policy and
  security headers; share-link audit events; `docs/security-review-2026-11.md`.
- Performance: `SceneGraph.getNodeIdsOfType` index; instance projection visits only instances
  (single-node move at 10k nodes: 1.1 ms → 0.04 ms). Benchmarks recorded for 2026-11-09.
- Tests: API 41 integration tests (share links, PDF), import-export 10, validation 3, web 27,
  document 20; 21 e2e scenarios (share link opened anonymously, PDF export, revocation).

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
