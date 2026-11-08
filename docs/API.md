# API

Base path `/api/v1`, JSON only, cookie session `sigma_session` (httpOnly, SameSite=Lax, Secure when
`COOKIE_SECURE=true`). Request bodies are validated with the zod schemas in `@sigma/validation`
(`packages/validation/src/api.ts`), which also holds the response types and the permission matrix
`WORKSPACE_PERMISSIONS` shared with the web client. Details and run instructions:
[api/README.md](api/README.md).

## Endpoints (all implemented)

| Method   | Path                                                                                       | Who                               |
| -------- | ------------------------------------------------------------------------------------------ | --------------------------------- |
| GET      | `/health`                                                                                  | public                            |
| POST     | `/auth/login`                                                                              | public, 20 attempts / minute / IP |
| POST     | `/auth/logout`, GET `/auth/me`, POST `/auth/change-password`                               | signed in                         |
| GET/POST | `/users`; GET/PATCH/DELETE `/users/:id`; POST `/users/:id/reset-password`                  | system ADMIN                      |
| GET/POST | `/workspaces` (`?all=true` for system admins); GET/PATCH/DELETE `/workspaces/:id`          | member / role                     |
| GET/POST | `/workspaces/:id/members`; PATCH/DELETE `/workspaces/:id/members/:userId`                  | OWNER/ADMIN                       |
| GET/POST | `/workspaces/:id/projects`; GET/PATCH/DELETE `/projects/:id`                               | role                              |
| GET/POST | `/projects/:id/documents`; GET/PATCH/DELETE `/documents/:id`; PUT `/documents/:id/content` | role                              |

Errors: 400 validation (`message` is a list), 401 not signed in, 403 forbidden (role or CSRF
origin), 404 not found (also for resources in workspaces the caller is not a member of), 409
conflict (duplicate email/member, or a stale `baseRevision` on content save: body carries
`revision`), 429 login throttled.

## Authentication and bootstrap

- First start on an empty database creates the administrator from `BOOTSTRAP_ADMIN_EMAIL` /
  `BOOTSTRAP_ADMIN_NAME` and either `BOOTSTRAP_ADMIN_PASSWORD` or a generated password printed once
  in the API log, plus a default workspace. The generated password must be changed at first login.
- Passwords are hashed with scrypt (Node `crypto`, N=16384, r=8, p=1, 32-byte salt).
- Sessions are random 256-bit tokens stored hashed (SHA-256) in `sessions`, 30-day sliding expiry.
- Every non-GET request must carry an `Origin` (or `Referer`) matching `CORS_ORIGIN` or the request
  host; this is the CSRF control for cookie auth.
- Personal API tokens (`Authorization: Bearer sgm_…`) authenticate without cookies and skip the
  Origin check; they are stored hashed, can expire, and record last use.

## Roles

System roles: `ADMIN` (manages users, sees every workspace, cannot edit documents without
membership) and `MEMBER`. Workspace roles and permissions:

| Permission                                           | OWNER | ADMIN | EDITOR | VIEWER |
| ---------------------------------------------------- | :---: | :---: | :----: | :----: |
| read workspace, projects, documents                  |   ✓   |   ✓   |   ✓    |   ✓    |
| create/update projects, create/edit/delete documents |   ✓   |   ✓   |   ✓    |        |
| delete projects, rename workspace, manage members    |   ✓   |   ✓   |        |        |
| grant/revoke ADMIN, delete workspace                 |   ✓   |       |        |        |

The owner cannot be removed or demoted; a user who owns workspaces is deleted only after ownership
passes to the oldest workspace ADMIN (or the workspace is deleted when there is none).

## Documents

`documents.content` holds the latest document JSON (schema-validated, unknown keys rejected) with an
integer `revision`. Clients send the revision they loaded; a mismatch returns 409 so no edit silently
overwrites someone else's. Deletes are soft (`deleted_at`). Snapshots and the update log remain
reserved for versioning and realtime collaboration.

## Locks, review states and versions

Frames may carry `metadata.lock = { userId, name, until }` and `metadata.review = { state, byId,
byName, at }`. A content save that changes a frame locked by someone else (until the lock expires)
is rejected with 409 and `lockedBy`. Versions snapshot the whole document; saving content creates
an automatic version at most once per hour; restoring first snapshots the current state.
