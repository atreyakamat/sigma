# Security review — November 2026 (pre-launch, v0.1.0)

Scope: the self-hosted stack as shipped in `docker-compose.yml` (web/nginx, api, PostgreSQL,
Redis, optional Caddy). Method: code reading of every authentication, authorization, upload,
realtime and export path; automated dependency audit; the integration and e2e suites as evidence.
Findings are listed with their status; anything open is in `docs/LAUNCH.md` §7 (known limits).

## Authentication and sessions

| Check              | Result                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Password storage   | scrypt (N=2^15, r=8, p=1) with per-user salt; constant-time compare                         |
| Password policy    | ≥10 chars, ≤128, common-password denylist (`isCommonPassword`), forced change of generated  |
| Session tokens     | 32 random bytes, stored hashed (SHA-256), httpOnly SameSite=Lax cookie, sliding 30 days     |
| Session revocation | every request resolves the row; revoke one / all others; deactivation revokes all           |
| Two-factor         | TOTP ±1 step, secret AES-256-GCM under `SESSION_SECRET`, 8 hashed single-use recovery codes |
| Login challenge    | separate short-lived `sigma_2fa` cookie scoped to `/api/v1/auth`; no session until verified |
| Brute force        | 20 login attempts / minute / IP (`LOGIN_RATE_LIMIT`), failures audited with IP              |
| API tokens         | `sgm_` prefix, stored hashed, optional expiry, shown once, revocable, last-used tracking    |

## Authorization

| Check                                | Result                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Workspace RBAC                       | `PermissionsService.assert` on every protected route from one matrix (`WORKSPACE_PERMISSIONS`)                    |
| Enumeration                          | non-members get 404 for any resource in a workspace they are not in                                               |
| System admin                         | `@SystemAdmin()` guard on users and audit routes                                                                  |
| Realtime                             | role checked on `join`; `update` refused for roles without `document.write`; tested                               |
| Share links                          | 24 random bytes (base64url); read-only; never accepted as a bearer credential; expiry enforced; revocable; tested |
| Signed asset URLs                    | HMAC-SHA256 over `assetId:expiry` with `SESSION_SECRET`, ≤30 days, constant-time compare                          |
| IDOR on comments / versions / assets | every handler resolves the parent document's workspace and asserts the role                                       |

## Input handling

| Check             | Result                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request bodies    | zod `strict()` schemas (unknown keys rejected); document content validated against the strict v1 schema                                                                                            |
| Path params       | `ParseUUIDPipe` on every id                                                                                                                                                                        |
| Uploads           | multipart single file, size cap (`MAX_UPLOAD_MB`), magic-byte sniffing must match the declared type, stored under random keys outside the web root, served with the stored MIME type and `nosniff` |
| SVG               | SVG uploads are served as `image/svg+xml` from the API origin only through `<img>`-style use; the editor imports SVG into its own node model through an in-house parser (no script execution)      |
| Realtime updates  | size-capped (8 MB) Yjs updates; malformed updates rejected per message; persisted state re-validated against the document schema before it is written                                              |
| Export parameters | scale bounded (0, 4]; output capped at 8192 px per side                                                                                                                                            |

## Transport and headers

| Check     | Result                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| API       | helmet defaults, CORS allow-list with credentials, `trust proxy` behind nginx/Caddy                                                |
| Web       | nginx: CSP (`default-src 'self'`, no inline scripts), `nosniff`, `X-Frame-Options SAMEORIGIN`, referrer policy, permissions policy |
| CSRF      | state-changing cookie requests must carry a matching `Origin`/`Referer`; bearer requests exempt                                    |
| TLS       | Caddy profile with automatic certificates and HSTS; `COOKIE_SECURE=true` documented                                                |
| WebSocket | origin checked on upgrade; same session cookie or bearer token required                                                            |

## Dependencies and build

- `pnpm audit --prod`: 0 known vulnerabilities (2026-11-09).
- Lockfile pinned; pnpm 12 blocks unapproved install scripts (`allowBuilds`).
- Images run as a non-root user (`sigma`), uploads volume owned by it, no secrets baked in.

## Open items (accepted for v0.1.0)

1. Frame locks are advisory on the realtime path (enforced in the editor and on HTTP saves).
2. No breached-password lookup (offline denylist only).
3. Share links grant document-wide read access; no per-frame scoping, no password on links.
4. Audit log has no retention policy; operators should rotate it with a scheduled delete.
5. No per-user request rate limiting beyond login; nginx can add `limit_req` if an instance is exposed publicly.
