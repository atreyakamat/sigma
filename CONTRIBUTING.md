# Contributing

## Before you start

Read `README.md`, `docs/ARCHITECTURE.md`, the ADRs in `docs/decisions/` that touch the area, and
`CHANGELOG.md`. Then run `pnpm verify`. If it is red, fix that first; do not build on a broken
baseline. Setup and scripts are in `docs/DEVELOPMENT.md`.

## Workflow for a change

1. **Inspect.** Find the package that owns the behaviour (see the ownership table below) and read
   its tests; they are the executable spec.
2. **Interfaces first.** Add or extend types, zod schemas and command signatures before writing
   implementation. Public surface lives in each package's `src/index.ts`.
3. **Smallest complete feature.** Implement one user-visible slice end to end rather than a layer
   at a time. Leave no half-wired module.
4. **Tests.** Unit tests next to the code (`src/__tests__/*.test.ts`); extend
   `tests/e2e/editor.spec.ts` when a user flow changed; run the benchmarks when touching
   rendering, hit testing or the document model.
5. **`pnpm verify` and `pnpm format`.** Typecheck, lint, unit tests and build must pass; Prettier
   formats code and Markdown.
6. **Docs.** Update the affected page in `docs/`, add an ADR for architectural decisions and a
   line under "Unreleased" in `CHANGELOG.md`.

## Package ownership and dependency rules

| Package                | Owns                                                                                               | May depend on                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `@sigma/shared`        | ids, `Emitter`, small helpers                                                                      | nothing                                       |
| `@sigma/geometry`      | vec2, mat2d, rect, hit tests, bezier, `SpatialIndex`                                               | shared                                        |
| `@sigma/document`      | zod schema, `SceneGraph`, node factories, migrations                                               | shared, geometry                              |
| `@sigma/history`       | `Command`, `History`, all commands                                                                 | shared, geometry, document                    |
| `@sigma/renderer`      | `Viewport`, `Renderer`, Canvas 2D drawing, text layout, image cache                                | shared, geometry, document                    |
| `@sigma/engine`        | `Editor`, selection, hit testing, tools manager, input, operations, overlay, clipboard, PNG export | shared, geometry, document, history, renderer |
| `@sigma/tools`         | the interaction tools                                                                              | engine and below                              |
| `@sigma/import-export` | SVG export, image decoding, `.sigma.json`                                                          | document, renderer, geometry, shared          |
| `@sigma/validation`    | API request/response zod contracts                                                                 | document                                      |
| `@sigma/web`           | React UI, IndexedDB repository                                                                     | all packages                                  |
| `@sigma/api`           | NestJS server, Prisma schema and migrations                                                        | (validation, planned)                         |

Rules:

- The dependency graph is acyclic and flows one way:
  `shared → geometry → document → history → renderer → engine → tools → web`. Never add a
  dependency that points backwards; if two packages need the same thing, move it down.
- **No React (or any UI framework) in `packages/*`.** Only `apps/web` imports React. Engine
  packages must run headless in Node, which is how their tests execute.
- **No DOM assumptions in `document`, `history`, `geometry`, `shared`.** `renderer` and `engine`
  may touch the DOM only inside guarded code paths (`typeof document !== 'undefined'`).
- `apps/api` stays a thin controller layer over services; validation happens in DTOs through the
  global `ValidationPipe`.
- A new package needs a row in this table and in `docs/ARCHITECTURE.md`.

## Code style

- **Strict TypeScript.** `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `verbatimModuleSyntax` and friends; do not loosen them per package. Use
  `import type` for type-only imports (enforced by ESLint).
- **All document mutations go through commands.** Tools and UI call `editor.ops` (or execute a
  `Command` via `editor.history`); nothing outside `@sigma/history` and collaboration replay calls
  `graph.insertNode` / `updateNode` / `removeNode` / `reparentNode` directly. Every command must
  implement `validate`, `execute`, `undo` and `affectedNodeIds`.
- **Immutable nodes.** Never mutate a `SceneNode`; the scene graph replaces nodes and relies on
  reference equality.
- **Schemas are strict.** New fields get defaults in the zod schema; a breaking change bumps
  `SCHEMA_VERSION` and ships a migration.
- Prettier settings: semicolons, single quotes, `printWidth` 100, trailing commas. `no-console`
  is a lint warning except for `console.warn` / `console.error`.
- Prefer small pure functions in `geometry`, `transform.ts`, `snapping.ts`; keep state in the
  classes that own it (`SceneGraph`, `History`, `Viewport`, `SelectionManager`).

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

feat(tools): add polygon tool with point-count inspector field
fix(engine): invalidate ancestor bounds when a grouped child moves
docs(decisions): add ADR-0006 spatial index
test(history): cover merge boundary after pointer-up
chore(deps): bump vitest to 5.1
refactor(renderer): extract paintToCanvasStyle
perf(hit-test): skip descendants of hidden frames
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`, `build`. Scope is the
package or app short name (`document`, `engine`, `tools`, `web`, `api`, `infra`, `decisions`).
Breaking changes to the document schema or a public package API get a `!` after the scope and a
`BREAKING CHANGE:` footer.

## Pull request checklist

- [ ] `pnpm verify` passes locally (typecheck, lint, unit tests, build) and `pnpm format:check`
      is clean.
- [ ] Tests added or updated for the change; `pnpm test:e2e` run if a user flow changed.
- [ ] No document mutation bypasses the command system; new commands undo cleanly (tested).
- [ ] Dependency direction respected; no React in `packages/*`.
- [ ] Architectural decisions recorded as an ADR in `docs/decisions/` (and listed in its README).
- [ ] Docs updated (`docs/*.md`, `docs/api/README.md` for API changes, `docs/DATABASE.md` plus a
      migration for schema changes).
- [ ] `CHANGELOG.md` "Unreleased" section updated.
- [ ] No secrets, `.env` files or generated Prisma output committed.
