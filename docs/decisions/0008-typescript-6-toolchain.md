# ADR-0008: TypeScript 6 toolchain

## Status

Accepted. Implemented in Milestone 0; revisited when `apps/api` was added.

## Context

The repository was started when TypeScript 7 (the native, Go-based compiler) was available. TS 7
ships `tsc` only: it does not expose the JavaScript compiler API that `typescript-eslint` (used by
ESLint) and the Nest CLI (`nest build`, `nest start --watch`) load at runtime. Both would refuse
to run against it. At the same time the codebase wants the strictest practical checks and a
single lint/format configuration for the whole workspace.

## Decision

- **TypeScript `~6.0.3`** at the root and in `apps/api` (the API pins its own copy as a
  devDependency so the Nest CLI resolves a TS 6 compiler API in its own `node_modules`). TS 7 is
  not used anywhere until typescript-eslint and the Nest CLI support it.
- **Strict compiler options** in `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `isolatedModules`,
  `noEmit`, target/lib ES2022 with DOM, `moduleResolution: bundler`. `apps/api` overrides to
  `module`/`moduleResolution: nodenext`, ES2023, decorators (`experimentalDecorators`,
  `emitDecoratorMetadata`), `verbatimModuleSyntax: false` and `noEmit: false` because Nest needs
  emitted decorator metadata and a real build output.
- **ESLint 10 flat config** at `eslint.config.mjs` using `@eslint/js` recommended plus
  `typescript-eslint` recommended, with `consistent-type-imports` as an error,
  `no-unused-vars` ignoring `_`-prefixed names and `no-console` warning except `warn`/`error`.
  `apps/api/eslint.config.mjs` is a standalone copy of those rules (not an import of the root
  config) that additionally sets `emitDecoratorMetadata`/`experimentalDecorators` parser options
  so value imports used only as constructor parameter types are kept for Nest's DI.
- **Prettier** (`.prettierrc`: semicolons, single quotes, `printWidth` 100, trailing commas)
  formats everything including Markdown; CI runs `pnpm format:check`.
- **Vitest 5** for unit tests in every package and the API; **Playwright 1.65** for end-to-end
  tests from the root.
- **pnpm 12.18** (`packageManager` field, enforced by `pnpm/action-setup` in CI), **Node >= 22**.
  pnpm 12 fails installs for dependencies with install scripts unless allowed, so
  `pnpm-workspace.yaml` lists `allowBuilds` (`@prisma/engines` and `prisma` allowed, `@swc/core`
  denied) and `minimumReleaseAgeExclude` for the exact NestJS 12 versions in use.
- **Turborepo** orders `typecheck`, `test` and `build` across the workspace (ADR-0007).

## Alternatives considered

- **TypeScript 7 at the root with TS 6 only in `apps/api`.** This was the initial layout and is
  what the comments in `apps/api/eslint.config.mjs` and the toolchain note in `docs/api/README.md`
  still describe. It was dropped because `typescript-eslint` at the root also needs the compiler
  API, so lint would not run for the packages either. The standalone API ESLint config is a
  leftover of that layout and could now import the root config.
- **Biome instead of ESLint + Prettier.** Fewer moving parts, but no typed lint rules and no
  Nest decorator handling; not pursued.
- **Jest for the API.** Nest's default, but Vitest is already used everywhere else and runs the
  `health.controller.spec.ts` supertest test without extra configuration.

## Consequences

- Upgrading to TypeScript 7 is blocked on two upstream projects; track `typescript-eslint` and
  `@nestjs/cli` release notes. When they support it, remove the `typescript` devDependency from
  `apps/api` and collapse `apps/api/eslint.config.mjs` into an import of the root config.
- `noUncheckedIndexedAccess` means array indexing yields `T | undefined`; the code uses explicit
  `as T` casts in hot loops where the index is known to be valid.
- `verbatimModuleSyntax` plus `consistent-type-imports` make `import type` mandatory for
  type-only imports; the API is the one place where this rule is relaxed for DI parameters.
- Markdown in `docs/` must be Prettier-formatted: CI runs `pnpm format:check` before the
  `turbo` tasks (`pnpm verify` itself does not include the format check).
