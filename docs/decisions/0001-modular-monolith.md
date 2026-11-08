# ADR-0001: Modular monolith in a pnpm/Turborepo

## Status

Accepted. Implemented in Milestone 0 and used by everything since.

## Context

Sigma is a browser-based design tool with its own editor engine, a web client and (later) an HTTP
API with realtime collaboration. The engine, the client and the API share a document schema and
request contracts, and the engine must stay usable without React so it can be tested headless and
reused by future hosts (benchmarks, a collaboration server that replays commands, export workers).

A single repository with clear internal boundaries lets one `pnpm verify` run validate the whole
system, while still keeping the engine independent of any UI or server framework.

## Decision

One repository, one pnpm workspace (`pnpm-workspace.yaml`), orchestrated by Turborepo
(`turbo.json`):

- `apps/web` — React 19 + Vite client (`@sigma/web`).
- `apps/api` — NestJS 12 + Prisma 7 server (`@sigma/api`), a single process with one Nest feature
  module per domain (`auth`, `users`, `workspaces`, `memberships`, `projects`, `folders`,
  `documents`, `versions`, `assets`, `comments`, `permissions`, `collaboration`). The modules are
  currently empty placeholders wired into `AppModule`; only `health` has a controller.
- `packages/*` — framework-free TypeScript libraries with a strict, acyclic dependency order:
  `shared → geometry → document → history → renderer → engine → tools`, plus `import-export`
  (depends on `document`, `renderer`, `geometry`) and `validation` (depends on `document`).
- `infrastructure/` — Docker Compose for PostgreSQL, Redis and MinIO; the SQL copy of the initial
  migration.
- `tests/` — Playwright end-to-end tests and benchmarks that drive the real packages.

The API is a monolith on purpose: the domains share one database and one transaction boundary, and
the realtime collaboration module will need the same document tables. Internal boundaries are
enforced by package `dependencies` (a package can only import what it declares) rather than by
network boundaries.

## Alternatives considered

- **Separate repositories per app/package.** Rejected: the schema (`@sigma/document`) and
  contracts (`@sigma/validation`) change together with their consumers; cross-repo versioning
  would slow every change.
- **Microservices for the API.** Rejected for now: there is one database, one team, and no
  scaling pressure that would justify network boundaries. The module-per-domain layout keeps a
  later extraction (most likely the collaboration/WebSocket server) mechanical.
- **A single app with `src/engine`, `src/ui`, … folders.** Rejected: nothing would stop React
  from leaking into the engine. Separate packages with explicit dependencies make the "no React
  in engine packages" rule checkable by `pnpm` and `tsc`.

## Consequences

- One `pnpm verify` (`turbo run typecheck lint test build`) validates every package and app.
- New code must land in the package whose dependency position allows it; adding a dependency
  that would create a cycle is not possible without changing `package.json` files, which shows up
  in review.
- Workspace packages are consumed as TypeScript source (see ADR-0007), so apps carry the build
  cost of their dependencies.
- The API skeleton carries the full module layout before any feature exists; that is deliberate
  so routes can be added without touching wiring, at the cost of some empty files.
