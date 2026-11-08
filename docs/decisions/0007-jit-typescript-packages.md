# ADR-0007: Just-in-time TypeScript packages

## Status

Accepted. Implemented in Milestone 0 and applied to every `packages/*` workspace.

## Context

The workspace has nine internal libraries that change constantly together with the app that uses
them. A conventional setup compiles each package to `dist/` and has consumers import the output,
which means every edit to a package needs a rebuild (or a watcher per package) before the app or
tests see it, and `turbo` has to order builds before anything else can run.

## Decision

Internal packages are **"just-in-time" packages**: they publish their TypeScript source directly.

- Each `packages/*/package.json` has `"main": "./src/index.ts"`, `"types": "./src/index.ts"`,
  `"exports": { ".": "./src/index.ts" }`, `"type": "module"` and `"sideEffects": false`.
- There is **no `build` script in packages**; `build` exists only in `apps/web` (Vite) and
  `apps/api` (Nest CLI). `turbo.json` declares `build` with `dependsOn: ["^build"]`, which is a
  no-op for packages.
- Compilation happens in the consumer: Vite (and Vitest via esbuild) transpile package sources
  as part of the app bundle. The root `tsconfig.base.json` uses
  `"moduleResolution": "bundler"`, `"isolatedModules": true` and `"verbatimModuleSyntax": true`
  so sources are transpilable file-by-file.
- Type checking is still per package: each has `"typecheck": "tsc -p tsconfig.json"` with
  `"noEmit": true` inherited from the base config, and `turbo` runs `typecheck` with
  `dependsOn: ["^typecheck"]` so a package is checked after its dependencies. `test` depends on
  `^typecheck` for the same reason.
- Consumers declare dependencies as `"@sigma/<name>": "workspace:*"`; pnpm links them into
  `node_modules`, and `exports` resolves straight to `src/index.ts`.

## Alternatives considered

- **Build each package to `dist/` with `tsc` or `tsup`.** Rejected: adds a build step and a
  watcher per package to the inner loop, and double-compiles everything that the app bundler would
  compile anyway.
- **TypeScript project references.** Gives incremental checking across packages, but still emits
  `.d.ts`/`.js` outputs and requires `composite` configs; the per-package `typecheck` ordered by
  `turbo` covers the same ground with less configuration.
- **A single app with path aliases instead of packages.** Rejected in ADR-0001.

## Consequences

- Any consumer must be able to compile TypeScript from `node_modules/@sigma/*`. Vite, Vitest and
  Playwright (via its own TS loader) do. `apps/api` currently depends on no `@sigma/*` package;
  when it starts using `@sigma/validation`, the Nest build (`tsc` via `nest build`) will need to
  include those sources or the API will need a bundler step. This is not yet solved.
- Packages cannot be published to a registry as-is; that is acceptable because all of them are
  `"private": true`.
- `pnpm build` at the root only builds the two apps.
- Editor tooling (go-to-definition, refactors) lands in the real source files rather than in
  `.d.ts` outputs.
