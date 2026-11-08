# @sigma/api

NestJS 12 + Prisma 7 (PostgreSQL). Endpoint reference, auth model and roles: [../API.md](../API.md).

## Modules

`auth` (login/logout/me/change-password, global `AuthGuard`), `users` (system-admin user
management), `permissions` (`PermissionsService.assert(user, workspaceId, permission)`),
`workspaces` (+ members), `projects`, `documents`, `health`, `bootstrap` (first admin), `prisma`,
`config`. Placeholder modules for later milestones: assets, comments, versions, collaboration,
folders, memberships.

## Environment

| Variable                                        | Required | Default                                           | Purpose                                                           |
| ----------------------------------------------- | -------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                                  | yes      | –                                                 | PostgreSQL connection string                                      |
| `SESSION_SECRET`                                | yes      | –                                                 | ≥ 8 chars; change in production                                   |
| `PORT`                                          | no       | `4000`                                            | HTTP port                                                         |
| `CORS_ORIGIN`                                   | no       | `http://localhost:5173`                           | Allowed browser origin (also the CSRF allow-list)                 |
| `COOKIE_SECURE`                                 | no       | `false`                                           | Set `true` behind HTTPS                                           |
| `TRUST_PROXY`                                   | no       | `false`                                           | Set `true` behind nginx/Caddy                                     |
| `SESSION_TTL_DAYS`                              | no       | `30`                                              | Session lifetime (sliding)                                        |
| `LOGIN_RATE_LIMIT`                              | no       | `20`                                              | Login attempts per IP per minute                                  |
| `BOOTSTRAP_ADMIN_EMAIL` / `_NAME` / `_PASSWORD` | no       | `admin@sigma.local` / `Administrator` / generated | First admin on an empty database                                  |
| `REDIS_URL`, `S3_*`                             | no       | –                                                 | Reserved for collaboration and uploads; the API runs without them |

## Run

```bash
docker compose -f ../../infrastructure/docker/docker-compose.yml up -d postgres   # from apps/api
cp .env.example .env
pnpm dev                 # nest start --watch; applies nothing — run `pnpm prisma:migrate` first on a fresh DB
pnpm build && pnpm start # Vite-bundled dist/main.cjs
pnpm test                # unit (health)
pnpm test:integration    # supertest against PostgreSQL (creates sigma_test, migrates, truncates between files)
```

Migrations: `prisma/migrations/*` (`0001_init`, `0002_auth_rbac`), applied with
`pnpm prisma:migrate` or automatically by the Docker entrypoint. Generate a new one after editing
`prisma/schema.prisma` with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
against a database that is at the previous migration, then deploy it.

## Build notes

`tsconfig.json` uses bundler resolution; the production bundle is produced by Vite
(`vite.config.mts`, CJS, `node_modules` external, workspace packages inlined). Decorator metadata
is emitted from tsconfig; the Nest CLI is used only for `dev`.
