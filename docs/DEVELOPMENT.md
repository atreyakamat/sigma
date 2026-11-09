# Development

## Prerequisites

- **Node.js 22+** (`engines.node` in `package.json`).
- **pnpm 12.18** — the exact version is in the `packageManager` field; `corepack enable` picks it
  up.
- **Docker** (Compose v2) — PostgreSQL/Redis for development, and the full self-hosted stack.
- **Playwright browsers** for end-to-end tests: `pnpm exec playwright install chromium`.

## Install

```sh
pnpm install
```

`pnpm install` also runs `prisma generate` for `@sigma/api` (its `postinstall` script), which
writes Prisma Client into `apps/api/prisma/generated/`. pnpm 12 refuses dependency install scripts
unless allowed; `pnpm-workspace.yaml` allows `prisma` and `@prisma/engines` and denies
`@swc/core`.

## Run the web client

```sh
pnpm --filter @sigma/web dev
# → http://localhost:5173
```

Vite serves `apps/web` with React Fast Refresh and compiles the workspace packages from source.
The app requires the API: sign in at `/login` (the bootstrap admin is printed by the API on first
start), manage users at `/admin/users`, workspaces at `/`, projects at `/w/:id`, files at
`/w/:id/p/:projectId`, and the editor at `/file/:documentId`.
the editor. In dev builds the editor exposes `window.__sigma = { editor, tools }` for debugging
and benchmarks.

## Run the API

```sh
docker compose -f infrastructure/docker/docker-compose.yml up -d   # postgres 17, redis 7 (project: sigma)
cp apps/api/.env.example apps/api/.env                             # or copy the root .env.example to ./.env
pnpm --filter @sigma/api prisma:migrate                            # prisma migrate deploy
pnpm --filter @sigma/api dev                                       # nest start --watch
# → GET http://localhost:4000/api/v1/health
```

The API refuses to boot when required environment variables are missing (validated in
`apps/api/src/config/env.validation.ts`), so `pnpm dev` at the root (which starts both apps)
only works once a `.env` exists. The Compose stack and its credentials are documented in
`infrastructure/docker/README.md`.

## Environment variables

`.env.example` at the root and `apps/api/.env.example` are identical. `.env` files are gitignored
(`.env`, `.env.*` except `.env.example`). The API loads `apps/api/.env` first, then the root
`.env`.

| Variable         | Required | Default                 | Purpose                               |
| ---------------- | -------- | ----------------------- | ------------------------------------- |
| `PORT`           | no       | `4000`                  | API HTTP port                         |
| `CORS_ORIGIN`    | no       | `http://localhost:5173` | allowed browser origin                |
| `DATABASE_URL`   | yes      | –                       | PostgreSQL URL                        |
| `REDIS_URL`      | yes      | –                       | Redis URL                             |
| `S3_ENDPOINT`    | yes      | –                       | S3-compatible endpoint (MinIO)        |
| `S3_BUCKET`      | yes      | –                       | asset bucket (`sigma-assets` locally) |
| `S3_ACCESS_KEY`  | yes      | –                       |                                       |
| `S3_SECRET_KEY`  | yes      | –                       |                                       |
| `SESSION_SECRET` | yes      | –                       | cookie signing secret                 |

The web client reads no environment variables.

## Scripts

Root scripts (`package.json`), all driven by Turborepo except `format*` and `test:e2e`:

| Script              | Runs                                  | Notes                                                                      |
| ------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`          | `turbo run dev --parallel`            | web (Vite) + api (Nest watch)                                              |
| `pnpm build`        | `turbo run build`                     | builds `apps/web` (Vite) and `apps/api` (Nest CLI); packages have no build |
| `pnpm typecheck`    | `turbo run typecheck`                 | `tsc --noEmit` per package, dependencies first                             |
| `pnpm lint`         | `turbo run lint`                      | ESLint 10 flat config per package                                          |
| `pnpm test`         | `turbo run test`                      | Vitest per package (`--passWithNoTests`)                                   |
| `pnpm verify`       | `turbo run typecheck lint test build` | the quality gate; CI runs the same tasks                                   |
| `pnpm format`       | `prettier --write .`                  | includes Markdown                                                          |
| `pnpm format:check` | `prettier --check .`                  | run by CI before the turbo tasks                                           |
| `pnpm test:e2e`     | `playwright test`                     | starts the web dev server itself (`playwright.config.ts`)                  |

Per-package scripts: `pnpm --filter @sigma/<name> <script>`; every package has `typecheck`,
`lint`, `test`. `@sigma/api` adds `build:tsc`, `start`, `prisma:generate`, `prisma:migrate`.
`@sigma/benchmarks` (in `tests/benchmarks`) adds `bench` and `bench:browser`
(see `docs/engine/benchmarks.md`).

## How workspace packages resolve

- `pnpm-workspace.yaml` includes `apps/*`, `packages/*` and `tests/benchmarks`.
- Internal dependencies are declared as `"@sigma/<name>": "workspace:*"`; pnpm symlinks them into
  `node_modules/@sigma/`.
- Each package's `package.json` points `main`, `types` and `exports["."]` at `./src/index.ts`.
  There is no build output: Vite, Vitest and Playwright compile the TypeScript source on demand
  (ADR-0007). Editing a package is immediately visible in the running app.
- `tsconfig.base.json` sets `moduleResolution: bundler`, so imports like
  `import { Editor } from '@sigma/engine'` resolve through `exports`. There are no path aliases.
- Dependency direction is fixed and acyclic: `shared → geometry → document → history → renderer →
engine → tools → web`; `import-export` depends on `document`, `renderer`, `geometry`;
  `validation` depends on `document`. `turbo` runs `typecheck`/`test` in that order.

## Adding a package

1. Create `packages/<name>/` with `package.json` copied from a sibling (name `@sigma/<name>`,
   `"private": true`, `"type": "module"`, `main`/`types`/`exports` → `./src/index.ts`,
   the three scripts), a `tsconfig.json` that extends `../../tsconfig.base.json` with
   `"include": ["src"]`, and `src/index.ts`.
2. Declare only the `@sigma/*` dependencies it really imports, respecting the order above.
3. Add it to consumers' `package.json` as `workspace:*`, then `pnpm install`.
4. Put tests in `src/__tests__/*.test.ts`; `pnpm verify` picks the package up automatically.

## Adding a tool

Tools live in `packages/tools` and implement `EditorTool` from `@sigma/engine`
(`packages/engine/src/types.ts`).

1. Create `packages/tools/src/<name>-tool.ts` extending `BaseTool` (`base-tool.ts`), which
   provides no-op handlers. Set `id`, `name`, optional `shortcut` and `cursor`; implement the
   pointer/key handlers and `renderOverlay` for previews. Mutate the document only through
   `this.editor.ops` (or `this.editor.history.execute`), never through `editor.graph` directly.
   Drag-to-create tools can extend `ShapeTool` in `shape-tool.ts`.
2. Register it in **`packages/tools/src/index.ts`**: export the module, add the field to the
   `DefaultTools` interface and instantiate it in `registerDefaultTools`, which registers the tool
   with `editor.tools` and binds its `shortcut` through `editor.keymap`.
3. Add a button in `apps/web/src/features/editor/components/Toolbar.tsx`.
4. Add a test to `packages/tools/src/__tests__/tools.test.ts` (tools are tested headless with
   synthetic `EditorPointerEvent`s).

## Adding a node type

Node types are switched on in several places; add the type to each, in this order:

1. **Schema** — `packages/document/src/schema.ts`: add the literal to `NODE_TYPES`, define
   `<Type>PropsSchema` with `baseProps` and the type-specific fields, add it to
   `NodePropsSchema` and `NodeJSONSchema` (the latter needs the `children` extension only for
   containers; also add containers to `CONTAINER_TYPES`), and export the `NodePropsOf<…>` alias.
2. **Defaults** — `packages/document/src/nodes.ts`: add the display name to `DEFAULT_NAMES` and a
   default style branch in `createNodeProps` if the type should not start empty. If the type's
   local bounds are not simply its `size`, extend `packages/document/src/bounds.ts`.
3. **Drawing** — `packages/renderer/src/draw.ts`: extend `buildNodePath` (outline used for fills,
   strokes, clipping) and `drawNode`. Update `paintMargin` if the type paints outside its bounds.
4. **Hit testing** — `packages/engine/src/hit-test.ts`: add the precise geometry test in
   `HitTester.hitsGeometry`.
5. **SVG export** — `packages/import-export/src/svg-export.ts`: add the element emitted by
   `nodeToSvg`.
6. **Inspector and layers** — `apps/web/src/features/editor/components/Inspector.tsx` (type-specific
   section) and the icon map in `LayersPanel.tsx`.
7. Optionally a creation tool (previous section).
8. If existing documents would no longer validate, bump `SCHEMA_VERSION` and add a migration to
   `MIGRATIONS` in `packages/document/src/migrations.ts`. Adding a new type to the enum does not by
   itself invalidate old documents.
9. Tests: `packages/document/src/__tests__/scene-graph.test.ts` (defaults, serialization),
   `packages/engine/src/__tests__/engine.test.ts` (hit testing),
   `packages/import-export/src/__tests__/export.test.ts` (SVG).

## Debugging tips

- **Headless editor in tests:** `new Editor({ document })` works without a DOM; nothing is drawn
  until `mount(container)`. `engine` and `tools` tests run this way under Vitest in Node.
- **Renderer stats:** `editor.events.on('render', stats => …)` reports `drawn`, `culled`,
  `durationMs` and `partial` per frame. Pass
  `createRenderer: (canvas, images) => new Canvas2DRenderer(canvas, { images, disableDirtyRegions: true })`
  to `Editor` to rule out dirty-region bugs.
- **Browser console:** in dev builds `window.__sigma.editor` is the live `Editor`;
  `__sigma.editor.toJSON()` dumps the document, `__sigma.editor.history.entries()` the undo stack.
- **Text metrics:** outside the browser `measureTextWidth` uses an estimate
  (`chars × fontSize × 0.55`); do not assert exact text sizes in Node tests.
- **Playwright:** `pnpm test:e2e --headed` or `--ui`; traces are kept on failure under
  `test-results/` (`trace: 'retain-on-failure'`). `click({ modifiers: ['Shift'] })` does not set
  `shiftKey` on pointer events in headless Chromium — use `keyboard.down('Shift')` around the
  click, as `tests/e2e/editor.spec.ts` does.
- **Vitest watch for one package:** `pnpm --filter @sigma/engine exec vitest`.
- **Turbo cache:** task logs are in `<package>/.turbo/turbo-<task>.log`; `pnpm turbo run test
--force` bypasses the cache.

## Known toolchain notes

- **TypeScript 6, not 7.** `typescript-eslint` and the Nest CLI need the TS compiler API that
  TS 7 (native) does not ship, so the root and `apps/api` pin `typescript@~6.0.3` (ADR-0008).
  The toolchain note in `docs/api/README.md` and the header comment in `apps/api/eslint.config.mjs`
  still describe an older layout with TS 7 at the root.
- **`apps/api/eslint.config.mjs`** is a standalone copy of the root rules rather than an import.
- **pnpm 12** needs `allowBuilds` for Prisma and `minimumReleaseAgeExclude` for the pinned
  NestJS 12 packages (`pnpm-workspace.yaml`).
- **`apps/web` has no unit tests**; its `test` script passes with `--passWithNoTests`. UI
  behaviour is covered by the Playwright flow.
- **`apps/api/Dockerfile`** copies `eslint.config.js` from the root, but the root file is
  `eslint.config.mjs`; the image build has not been exercised.
- **Prettier formats Markdown.** Run `pnpm format` after editing docs or `pnpm format:check` in
  CI fails.

## Self-hosted stack and tests (Milestone 3)

- `docker-compose.yml` at the root (project `sigma-stack`): `web` (nginx, port `WEB_PORT`, proxies
  `/api` to the API), `api` (runs migrations then starts), `postgres`, `redis`. Configure through
  `.env.docker` (`docker compose --env-file .env.docker up -d --build`). It uses its own volumes, so
  it coexists with the development database from `infrastructure/docker` (project `sigma`).
- API integration tests: `pnpm --filter @sigma/api test:integration` needs PostgreSQL on
  `localhost:5432` (creates `sigma_test` and migrates it). Unit tests: `pnpm --filter @sigma/api test`.
- Web unit tests: `pnpm --filter @sigma/web test` (Vitest + Testing Library, jsdom).
- End-to-end: `pnpm test:e2e` runs Playwright against `E2E_BASE_URL` (default the Docker stack on
  http://localhost:3387). The admin password is read from `E2E_ADMIN_PASSWORD`, otherwise from
  `docker compose logs api`; the suite sets it to a known value on first run.
- The API is bundled for production with Vite (`apps/api/vite.config.mts`, output `dist/main.cjs`)
  because the Nest `tsc` build cannot consume the TypeScript-source workspace packages.

## Milestone 4 additions

- Command palette entries live in `apps/web/src/features/editor/commands.ts`; add a command there
  and it appears in `⌘K` (tests in `features/editor/__tests__/commands.test.ts`).
- Onboarding steps and hints: `apps/web/src/features/onboarding/store.ts`; bindings to engine
  events in `Onboarding.tsx`.
- Server rendering uses `@napi-rs/canvas` through `rasterizeNodes({ createCanvas })`; SVG and
  design tokens come from `@sigma/import-export`.
- Presence gateway: `apps/api/src/collaboration/presence.gateway.ts` (plain `ws`, attached to the
  Nest HTTP server in `main.ts`); client hook `apps/web/src/features/collaboration/usePresence.ts`.
- CLI: `packages/cli/bin/sigma.mjs` (no build step; `node packages/cli/bin/sigma.mjs --help`).
- Playwright: `tests/e2e/features.spec.ts` covers the Milestone 4 features end to end.

## Milestones 5–7 additions

- `packages/collab` — Yjs binding (`bindGraph`, `populateYDoc`, `graphFromYDoc`, base64 update
  helpers). Unit tests run two bound graphs through an in-memory relay, including offline
  divergence. `apps/web/src/features/collaboration/realtime.ts` wraps it for the presence socket;
  `apps/api/src/collaboration/collab-rooms.service.ts` is the server room with debounced
  persistence (`COLLAB_PERSIST_DEBOUNCE_MS`, default 1000).
- Prototyping lives in `packages/engine/src/prototype.ts` (`PrototypeRuntime`) and
  `apps/web/src/features/prototype/` (inspector section, connections overlay, preview page).
- Uploads: `DATA_DIR` (default `./data`, `/data` volume in Docker) or `S3_*` variables for an
  S3-compatible bucket; `MAX_UPLOAD_MB` caps size. Signed URLs are HMAC-SHA256 over
  `assetId:expiry` with `SESSION_SECRET`.
- i18n: `apps/web/src/lib/i18n.ts` — add a key to the English dictionary and TypeScript forces every
  other locale to provide it (`i18n.test.ts` also checks it at runtime).
- Touch: `packages/engine/src/gestures.ts` (pinch maths) wired in `input.ts`; the editor page
  switches to floating panels below 900 px.
- Operations: `scripts/backup.sh`, `scripts/restore.sh`, Caddy profile in `docker-compose.yml`.

## Milestone 8 additions

- Share links: `apps/api/src/sharing/*`; the web editor opens `/share/:token` in shared mode
  (`EditorContextValue.shared`): read-only, no presence or comments, polled every 10 s.
- PDF: `packages/import-export/src/pdf.ts` (`buildPdf`, `rgbaToRgb`) is runtime-agnostic; the API
  injects `zlib.deflateSync` and rasterises frames with `@napi-rs/canvas`.
- Releases: tag `vX.Y.Z` after `pnpm release:bump X.Y.Z`; `.github/workflows/release.yml` publishes
  images to GHCR and a GitHub release. Procedure and gates: `docs/LAUNCH.md`.

## AI and automation (v0.2.0)

- `packages/document/src/ops.ts` — `applyDocumentOps` / `outlineDocument`: the one editing surface
  for automation. Add a field there, in `DocumentOpSchema` (`@sigma/validation`), in the tool
  schema in `apps/api/src/ai/ai.service.ts` and in `packages/mcp/src/server.mjs`.
- `apps/api/src/ai/agent.ts` — provider adapters behind one `runAgent(config, input)` call:
  Anthropic through `@anthropic-ai/sdk` (manual tool loop, full content replayed, refusal and
  typed errors handled), OpenAI-compatible through `fetch`, and the rule-based demo. Integration
  tests script both wire formats with an in-process HTTP server (`test/ai.int.spec.ts`).
- `packages/mcp` — plain ESM (no build step) on `@modelcontextprotocol/sdk`; tests use the SDK's
  in-memory transport and a fake `fetch`.
- Web: `features/editor/components/AssistantPanel.tsx`, `features/settings/AiProvidersPage.tsx`.
