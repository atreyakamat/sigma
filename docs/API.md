# API

Base path `/api/v1`, JSON only, cookie session `sigma_session` (httpOnly, SameSite=Lax, Secure when
`COOKIE_SECURE=true`). Request bodies are validated with the zod schemas in `@sigma/validation`
(`packages/validation/src/api.ts`), which also holds the response types and the permission matrix
`WORKSPACE_PERMISSIONS` shared with the web client. Details and run instructions:
[api/README.md](api/README.md).

## Endpoints (all implemented)

All paths are under `/api/v1`. Authentication is a session cookie or `Authorization: Bearer sgm_…`.

| Method   | Path                                                                                                      | Who                                |
| -------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| GET      | `/health`, `/metrics` (Prometheus)                                                                        | public                             |
| POST     | `/auth/login` → session, or `{ requiresTwoFactor: true }` + challenge cookie; `/auth/login/2fa`           | public, 20 attempts / minute / IP  |
| POST     | `/auth/logout`, GET `/auth/me`, POST `/auth/change-password`                                              | signed in                          |
| GET/POST | `/auth/tokens`; DELETE `/auth/tokens/:id` (personal API tokens, secret shown once)                        | signed in                          |
| GET      | `/auth/sessions`; DELETE `/auth/sessions/:id`; POST `/auth/sessions/revoke-others`                        | signed in                          |
| POST     | `/auth/2fa/setup` → secret + otpauth URL; `/auth/2fa/enable` → recovery codes; `/auth/2fa/disable`        | signed in                          |
| GET/POST | `/users`; GET/PATCH/DELETE `/users/:id`; POST `/users/:id/reset-password`                                 | system ADMIN                       |
| GET      | `/audit?limit=&before=`                                                                                   | system ADMIN                       |
| GET/POST | `/workspaces` (`?all=true` for system admins); GET/PATCH/DELETE `/workspaces/:id`                         | member / role                      |
| GET/POST | `/workspaces/:id/members`; PATCH/DELETE `/workspaces/:id/members/:userId`                                 | OWNER/ADMIN                        |
| GET/POST | `/workspaces/:id/projects`; GET/PATCH/DELETE `/projects/:id`                                              | role                               |
| GET/POST | `/projects/:id/documents`; GET/PATCH/DELETE `/documents/:id`; PUT `/documents/:id/content`                | role                               |
| GET/POST | `/documents/:id/versions`; GET `/documents/:id/versions/:versionId`; POST `…/:versionId/restore`          | role                               |
| GET      | `/documents/:id/export.svg`, `export.png?scale=&frame=`, `tokens.json`, `tokens.css`, `frames?approved=`  | document.read (handoff)            |
| GET/POST | `/documents/:id/comments`; PATCH/DELETE `/comments/:id`                                                   | comment.create / author / moderate |
| GET/POST | `/workspaces/:id/assets` (multipart `file`); POST `/assets/:id/signed-url`; DELETE `/assets/:id`          | role                               |
| GET      | `/assets/:id/content` (session, bearer, or `?exp=&sig=` signed URL)                                       | public with credentials/signature  |
| GET      | `/workspaces/:id/library`; GET/DELETE `/library/:id`; POST `/documents/:id/library/publish`               | role                               |
| GET/POST | `/documents/:id/outline` (GET, compact structure); `/documents/:id/ops` (POST, validated edit operations) | document.read / document.write     |
| GET      | `/ai/providers` (enabled providers, no secrets)                                                           | signed in                          |
| *        | `/admin/ai/providers` (GET, POST); `/admin/ai/providers/:id` (PATCH, DELETE); `…/:id/test` (POST)         | system ADMIN                       |
| POST     | `/documents/:id/ai/chat` (assistant turn with tool use, 30 / minute / IP)                                 | document.read (edits need write)   |
| WS       | `/presence` — presence, awareness, `saved`, realtime `sync` / `update` (see Realtime)                     | member (viewers read-only)         |

Errors: 400 validation (`message` is a list), 401 not signed in, 403 forbidden (role or CSRF
origin), 404 not found (also for resources in workspaces the caller is not a member of), 409
conflict (duplicate email/member, a stale `baseRevision` on content save, or a locked frame: body
carries `revision` and `lockedBy`), 413 upload too large, 429 login throttled.

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

## Realtime co-editing (WebSocket)

After `{ type: 'join', documentId }` the server sends `presence`, then `sync` with the document's
full Yjs state (base64) and current `revision`. Participants with `document.write` send
`{ type: 'update', update }` (a base64 Yjs update); the server applies it to the room, relays it as
`{ type: 'update', update, userId }` to everyone else and persists the room into
`documents.content` after a one-second debounce, broadcasting `saved` with the new revision. Any
HTTP replacement of the content (restore, CLI, offline flush) rebuilds the room and pushes a new
`sync`. Shared-state layout and conflict rules: `packages/collab` and ADR-0012.

## Automation: operations, outline, assistant, MCP

`POST /documents/:id/ops` takes `{ ops: [...] }` (1–200): `add` (`type`, optional `parent` id or
`$ref`, `ref`, `index`, fields), `update` (`id`, fields), `move` (`id`, `parent`, `index`),
`delete` (`id`), `rename_document` (`name`). Fields: `name`, `x`, `y`, `width`, `height`,
`rotation`, `fill` / `stroke` (hex or `"none"`), `strokeWidth`, `opacity`, `visible`,
`cornerRadius`, `text`, `fontSize`, `fontWeight`. The response lists one result per operation
(`ok`, `id` or `error`), the number applied and the new `revision`; failing operations are skipped.
Pending realtime edits are flushed first and the result goes through the normal save path, so
frame locks, versions, thumbnails and realtime resync apply. `GET /documents/:id/outline` returns
pages and nested layers (`id`, `type`, `name`, `x`, `y`, `w`, `h`, `text`, `fill`), capped at 400
nodes with a `truncated` flag.

`POST /documents/:id/ai/chat` (`{ messages: [{ role, content }], providerId? }`) runs one assistant
turn on the server: the configured provider is called with two tools, `get_document_outline` and
(for roles with `document.write`) `apply_document_ops`, in a loop of at most eight steps. The
response carries `reply`, the `steps` taken, `applied`, `revision`, `provider` and `stopReason`.
Provider kinds: `anthropic` (official SDK, Messages API), `openai`, `openai_compatible` (any Chat
Completions endpoint with tool calling: Ollama, LM Studio, vLLM, OpenRouter, Groq…), and `demo`
(rule-based, no model). Provider failures return 400/429/502 with an actionable message.

The MCP server in `packages/mcp` wraps the same endpoints for Claude and other MCP clients; see
`integrations/claude/README.md`.

## Share links and PDF

`POST /documents/:id/share-links` (`{ role: 'VIEWER' | 'COMMENTER', expiresInHours? }`) returns
the link once, including `token` and `url` (`<PUBLIC_URL>/share/<token>`); listings omit the
token. `GET /share/:token` returns `{ id, name, revision, updatedAt, role, content }` and the
export routes under `/share/:token/` render the same document. Tokens are never accepted as a
bearer credential, so a link can never write. `export.pdf` renders one page per frame of the first
page (or the given `frame`), raster at `scale` (points = pixels × 0.75), Flate-compressed; with
`approved=true` only frames in the APPROVED review state are included.

## Locks, review states and versions

Frames may carry `metadata.lock = { userId, name, until }` and `metadata.review = { state, byId,
byName, at }`. A content save that changes a frame locked by someone else (until the lock expires)
is rejected with 409 and `lockedBy`. Versions snapshot the whole document; saving content creates
an automatic version at most once per hour; restoring first snapshots the current state.
