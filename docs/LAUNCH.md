# Launch definition and readiness (v0.1.0)

This document defines what "launch" means for SIGMA, what must be true before it, who decides,
and how a release is cut. Nothing ships until every **Go/No-Go** row is green and every **Decision**
row has an owner's answer recorded here.

## 1. What we are launching

- **Product:** SIGMA v0.1.0, a self-hosted collaborative design platform. One Docker Compose stack
  (web, api, PostgreSQL, Redis, optional Caddy TLS edge) run by a team on their own machine or
  server. No hosted/SaaS offering, no public sign-up, no telemetry.
- **Users:** small teams (1–50 people per instance). An administrator installs the stack, creates
  accounts and hands out generated passwords; members work in workspaces with
  OWNER / ADMIN / EDITOR / VIEWER roles.
- **Release artefacts:** a Git tag `v0.1.0` on `main`, container images `sigma-web` and
  `sigma-api` built from that tag (published by the release workflow to the container registry of
  the GitHub repository), the `docker-compose.yml` + `.env.docker.example` pair, and the
  `CHANGELOG.md` entry for 0.1.0.
- **Support promise:** security fixes and data-loss bugs for the current minor release; upgrades
  are `docker compose up -d --build` after a backup; database migrations are forward-only and run
  automatically on API start.

## 2. Out of scope for v0.1.0 (explicitly)

| Item                                  | Why not now                                              | Planned |
| ------------------------------------- | -------------------------------------------------------- | ------- |
| Hosted multi-tenant service           | self-hosting is the product; no billing/abuse tooling    | later   |
| Multi-instance realtime (Redis relay) | one API container per instance is the supported topology | 0.2     |
| Public sign-up / SSO (OIDC, SAML)     | admin-managed accounts by design; SSO when requested     | 0.2     |
| Mobile editing on phones              | tablet layout works; phone-size canvases are view-first  | later   |
| Import of other design tools' files   | legal review of formats pending                          | later   |
| WebGL renderer                        | Canvas 2D meets recorded benchmarks                      | later   |
| Plugin API                            | needs a stable public engine surface first               | later   |

## 3. Go / No-Go checklist

Status as of 2026-11-09. "Green" means verified by the named command or test on the release
candidate commit.

| #   | Gate                                                                                | How verified                                                                  | Status                     |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| 1   | All unit, integration and e2e suites green                                          | `pnpm verify`, `pnpm --filter @sigma/api test:integration`, `pnpm test:e2e`   | green                      |
| 2   | Fresh install works from the README in under 10 minutes                             | `docker compose … up -d --build` on a clean machine, e2e `fullstack`          | green                      |
| 3   | Upgrade path: migrations apply from 0001 on an empty DB and on a seeded DB          | CI job `api-migrations` (deploy + drift check)                                | green                      |
| 4   | Backup and restore round-trip                                                       | `scripts/backup.sh` then `scripts/restore.sh`; documents and assets identical | green (manual, 2026-11-09) |
| 5   | HTTPS deployment documented and tested with the Caddy profile                       | `docs/OPERATIONS.md`; `docker compose --profile https config`                 | green                      |
| 6   | No known vulnerabilities in production dependencies                                 | `pnpm audit --prod`                                                           | green (0 findings)         |
| 7   | Security review of auth, RBAC, uploads, realtime, headers recorded                  | `docs/SECURITY.md`, `docs/security-review-2026-11.md`                         | green                      |
| 8   | Performance: 10k-node document loads < 500 ms, single-node move < 2 ms (headless)   | `docs/engine/benchmarks.md` (run recorded 2026-11-09)                         | green                      |
| 9   | Data safety: optimistic concurrency on HTTP saves, CRDT convergence tests, versions | API `documents`, `collab` tests, e2e `platform` realtime                      | green                      |
| 10  | Every user-visible control works or does not exist                                  | manual pass over web UI against `docs/API.md`                                 | green                      |
| 11  | Docs complete: README, OPERATIONS, SECURITY, API, DEVELOPMENT, CHANGELOG 0.1.0      | review                                                                        | green                      |
| 12  | Licence file present and compatible with all dependencies                           | `LICENSE` at repo root; `pnpm licenses list`                                  | **blocked: Decision A**    |
| 13  | Release workflow builds and publishes images from a tag                             | `.github/workflows/release.yml` dry run on a `v0.1.0-rc.1` tag                | pending first push         |
| 14  | Repository pushed to GitHub with CI green on `main`                                 | `git push`, Actions                                                           | pending (push is manual)   |

## 4. Decisions that need an owner's answer before launch

| ID  | Decision                                                          | Options                                                 | Default if unanswered |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------- | --------------------- |
| A   | Open-source licence                                               | MIT / Apache-2.0 / AGPL-3.0 / proprietary               | none; blocks gate 12  |
| B   | Product name and domain (affects window titles, Caddy host, docs) | keep "SIGMA" / rename                                   | keep "SIGMA"          |
| C   | Where images are published                                        | GitHub Container Registry (ghcr.io) / Docker Hub / none | ghcr.io               |
| D   | Support channel for self-hosters                                  | GitHub Issues / email / none                            | GitHub Issues         |
| E   | Default upload storage in the reference compose file              | local volume (current) / MinIO service / external S3    | local volume          |
| F   | Minimum password length                                           | 10 (current) / 12 / 14                                  | 10                    |

## 5. Release procedure

1. Confirm `main` is green in CI and the working tree is clean.
2. Update `CHANGELOG.md`: move "Unreleased" into a dated `## [0.1.0]` section.
3. Bump versions: `pnpm release:bump 0.1.0` (sets every workspace `package.json`).
4. Commit `chore(release): v0.1.0`, tag `v0.1.0`, push the tag. The release workflow builds the
   images, pushes them to the registry with the tag and `latest`, and attaches
   `docker-compose.yml` and `.env.docker.example` to the GitHub release.
5. Smoke-test the published images on a clean host: install, sign in, create a file, draw, invite a
   second user, verify realtime, export PNG/SVG/PDF, back up.
6. Announce through the channel chosen in Decision D.

## 6. Rollback

Images are immutable per tag: `docker compose pull && docker compose up -d` with the previous tag
restores the previous application. Database migrations are forward-only; to roll back a release
that migrated the schema, restore the pre-upgrade backup (`scripts/restore.sh`). Always back up
before upgrading (the procedure says so and the OPERATIONS doc repeats it).

## 7. Known limits shipped with v0.1.0

- Frame locks are advisory on the realtime path (editor and HTTP saves enforce them).
- One API container per instance for realtime sessions.
- Undo is per user; another user's later edit to the same node may be reverted by an undo.
- PDF export is raster (one PNG page per frame), not vector.
- Share links grant view or comment access to one document; they cannot be scoped to a frame.
