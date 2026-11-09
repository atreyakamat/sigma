# SIGMA

SIGMA is a browser-based collaborative design platform with an editor engine we own. It targets
interface design, vector graphics, components, auto layout, prototyping and real-time collaboration.
The engine is an independent TypeScript package; the React interface is one client of it.

**Status:** Milestones 0–4 implemented: foundation, engine, editing, self-hosted persistence with
accounts and roles, and the onboarding / history / handoff / collaboration feature set. CRDT
co-editing (Yjs) and vector tools (pen, booleans) are next. See
[CHANGELOG.md](CHANGELOG.md) and [docs/development/MASTER_INSTRUCTION.md](docs/development/MASTER_INSTRUCTION.md).

## What works today

- Infinite canvas with zoom, pan, rulers, pixel grid, layout grid, snapping and alignment guides.
- Tools: select, hand, frame, rectangle, ellipse, line, polygon, star, text, image.
- Move, resize (proportional / from center), rotate, flip, align, distribute, group/ungroup, frame
  selection, reorder, lock, hide, duplicate, copy/paste.
- Styling: multiple fills (solid, gradient, image), strokes with inside/center/outside alignment,
  corner radius, opacity, blend modes, drop shadow and layer blur. Typography controls.
- Layers panel with search, drag-and-drop reordering and reparenting; pages; context menu.
- Every edit is a reversible command. Undo/redo with drag coalescing and transactions.
- Autosave to the server with conflict detection, recovery after refresh, import/export of
  `.sigma.json`, PNG and SVG export.
- Accounts managed by an administrator (generated passwords, forced change at first login),
  workspaces with OWNER/ADMIN/EDITOR/VIEWER roles enforced by the API and reflected in the UI
  (view-only editor for viewers), projects and files per workspace.
- One-command self-hosting with Docker Compose (web, API, PostgreSQL, Redis) and GitHub Actions CI.
- Guided onboarding checklist and contextual hints, `⌘K` command palette, `?` shortcut panel,
  undo history with thumbnails, device frame presets.
- Version history with named checkpoints, hourly automatic snapshots, visual diff and restore.
- Developer handoff: server-rendered PNG/SVG URLs, design tokens as JSON/CSS, personal API tokens,
  and a `sigma` CLI. Frame review states (draft / in review / approved) feed the handoff endpoints.
- Per-frame locks enforced by the server, comments with threads and pins anchored to layers, live
  presence with cursors and selections, offline edit recovery and session re-login without losing
  work.
- Realtime co-editing: everyone in a file edits the same CRDT document; changes appear live and are
  persisted by the server (ADR-0012).
- Vector tools: pen, pencil, vector edit mode, boolean operations, SVG import as editable paths.
- Design systems: components, variants, instances with overrides, auto layout, constraints and
  shared workspace libraries.
- Prototyping: interactions, transitions, connection arrows and a preview player.
- Gradient editing, image uploads stored as workspace assets with signed URLs, server-side
  thumbnails.
- Security and operations: TOTP two-factor authentication with recovery codes, session listing and
  revocation, administrative audit log, Prometheus metrics, optional HTTPS edge (Caddy), backup and
  restore scripts. Works on tablets (floating panels, pinch-to-zoom) and in English or Hindi.
- Share links: read-only links to a file that open without an account, with optional expiry and
  one-click revocation. PDF export (one page per frame) from the editor, the API and the CLI.
- Launch readiness: `docs/LAUNCH.md` defines the v0.1.0 release, its go/no-go checklist, open
  decisions and the release procedure; `docs/security-review-2026-11.md` records the review.

## Self-hosting (Docker)

```bash
cp .env.docker.example .env.docker          # set SESSION_SECRET and POSTGRES_PASSWORD
docker compose --env-file .env.docker up -d --build
docker compose logs api | grep -A3 'first start'   # initial admin password (unless BOOTSTRAP_ADMIN_PASSWORD was set)
```

Open http://localhost:3000, sign in as `admin@sigma.local`, set your password, then create users
under **Users** and add them to workspaces as viewers, editors or admins.

To run published images instead of building, set `SIGMA_VERSION` (for example `0.1.0`) in
`.env.docker` (images come from `ghcr.io/atreyakamat`; override with `SIGMA_IMAGE_NAMESPACE`), then
`docker compose --env-file .env.docker pull && docker compose --env-file .env.docker up -d --no-build`.

HTTPS: set `PUBLIC_HOST` (a DNS name pointing at the machine), `PUBLIC_URL=https://<host>` and
`COOKIE_SECURE=true` in `.env.docker`, then start with
`docker compose --env-file .env.docker --profile https up -d --build`; Caddy obtains certificates
automatically. Backups: `scripts/backup.sh` (database dump + uploaded assets) and
`scripts/restore.sh <dir>`. See `docs/OPERATIONS.md`.

## Development

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d   # PostgreSQL + Redis on localhost
cp .env.example .env && pnpm --filter @sigma/api dev                # API on :4000 (bootstraps the admin)
pnpm --filter @sigma/web dev                                        # web on :5173, proxies /api to :4000
pnpm verify                                                         # typecheck + lint + unit tests + build
pnpm --filter @sigma/api test:integration                           # API tests against PostgreSQL
pnpm test:e2e                                                       # Playwright against the Docker stack on :3000
```

## Repository layout

```
apps/web               React interface (Vite, Tailwind, Zustand, TanStack Query, React Router)
apps/api               NestJS API (Prisma, PostgreSQL) — skeleton + schema
packages/shared        ids, typed emitter
packages/geometry      vectors, matrices, rects, hit tests, Bézier, spatial index
packages/document      versioned document schema (zod), scene graph, migrations
packages/history       command interface, commands, undo/redo history
packages/renderer      viewport, Canvas 2D renderer, text layout, rasterization
packages/engine        Editor façade: selection, hit testing, tools, input, overlay, operations
packages/tools         default tool set
packages/import-export SVG export, image import validation, document files
packages/validation    zod request contracts shared by web and api
packages/cli           `sigma` CLI: export frames, tokens, checkpoints (uses an API token)
tests/e2e              Playwright end-to-end tests
tests/benchmarks       100 / 1,000 / 10,000-node benchmark documents and measurements
infrastructure         Docker Compose, database migration SQL
docs                   architecture, engine, API, database, decisions (ADRs)
```

## Documentation

| Document                                       | Purpose                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | System layers, package boundaries, data flow         |
| [docs/EDITOR_ENGINE.md](docs/EDITOR_ENGINE.md) | Engine internals, coordinate system, tools, commands |
| [docs/DATABASE.md](docs/DATABASE.md)           | Prisma schema and migrations                         |
| [docs/API.md](docs/API.md)                     | API conventions and endpoint status                  |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)     | Local setup, scripts, how to extend                  |
| [docs/TESTING.md](docs/TESTING.md)             | Test strategy and commands                           |
| [docs/SECURITY.md](docs/SECURITY.md)           | Implemented controls and known limits                |
| [docs/OPERATIONS.md](docs/OPERATIONS.md)       | HTTPS, backups, monitoring, upgrades                 |
| [docs/LAUNCH.md](docs/LAUNCH.md)               | Launch definition, go/no-go checklist, release steps |
| [docs/decisions/](docs/decisions/)             | Architecture decision records                        |
| [docs/engine/](docs/engine/)                   | Benchmark methodology and results                    |
| [CONTRIBUTING.md](CONTRIBUTING.md)             | Workflow and rules                                   |

## CLI

```bash
export SIGMA_URL=http://localhost:3000 SIGMA_TOKEN=sgm_…   # token from Account → API tokens
node packages/cli/bin/sigma.mjs frames <documentId> --approved
node packages/cli/bin/sigma.mjs export-all <documentId> ./out --format png --scale 2
node packages/cli/bin/sigma.mjs export <documentId> deck.pdf --approved          # one PDF page per approved frame
node packages/cli/bin/sigma.mjs tokens <documentId> --css > tokens.css
node packages/cli/bin/sigma.mjs checkpoint <documentId> "Before redesign"
```

## Editor shortcuts

`V` select · `F` frame · `R` rectangle · `O` ellipse · `L` line · `T` text · `H` hand · `Space` pan ·
`⌘/Ctrl+scroll` zoom · `⌘Z` / `⇧⌘Z` undo/redo · `⌘D` duplicate · `⌘G` / `⇧⌘G` group/ungroup ·
`⌥⌘K` frame selection · `⌘K` command palette · `?` shortcuts · `C` comment · `⌘[` `⌘]` reorder · `⇧⌘H` `⇧⌘V` flip · `⌘0` 100% · `⌘1` fit · `⌘2` zoom to selection ·
arrows nudge (`⇧` ×10) · `Enter` edit text / enter group · `⇧Enter` select parent · `⌘'` pixel grid · `⇧⌘R` rulers.

## License

MIT. See `LICENSE`.
