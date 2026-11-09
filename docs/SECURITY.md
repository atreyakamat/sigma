# Security

## Implemented

- Authentication: scrypt password hashes, hashed random session tokens, httpOnly SameSite=Lax
  cookies (`COOKIE_SECURE=true` behind HTTPS), sliding 30-day expiry, logout invalidation,
  deactivation revokes sessions, forced password change for generated passwords.
- Two-factor authentication: TOTP (RFC 6238, own implementation, ±1 step) enrolled from
  **Security** with a QR code and manual key; secrets stored AES-256-GCM encrypted under
  `SESSION_SECRET`; eight single-use recovery codes stored hashed. Login returns a short-lived
  challenge cookie (`sigma_2fa`, path `/api/v1/auth`) until the code is verified.
- Session management: users list their sessions (device, IP, last activity) and revoke one or all
  others; revocation is immediate because every request resolves the session row.
- Authorization: every protected route resolves the caller's workspace role server-side and checks
  it against `WORKSPACE_PERMISSIONS`; non-members receive 404. System-admin routes use a dedicated
  guard. Realtime participants are authorised on join; viewers' updates are refused. The UI hides
  controls by role but never relies on that.
- Audit log: sign-ins (success and failure), session revocations, user creation / update / reset /
  deletion, asset uploads and deletions are recorded with actor, target, IP and metadata;
  administrators browse it at **Audit log** (`GET /api/v1/audit`).
- Password policy: 10–128 characters and a common-password denylist (padding a common word with
  digits does not help).
- Share links: 24-byte random tokens granting read access to one document, optional expiry,
  revocable, never usable for writes; creation and revocation are audited.
- Brute-force limits: login throttled per IP (`LOGIN_RATE_LIMIT`, default 20/min).
- CSRF: state-changing requests require a matching `Origin`/`Referer`; bearer tokens are exempt
  because browsers never attach them automatically.
- Input validation: strict zod schemas (unknown keys rejected) for every body and for document
  content; UUID params validated; uploads checked by magic bytes against the declared type with a
  configurable size cap (`MAX_UPLOAD_MB`, default 20).
- Assets: stored outside the web root (local volume or S3-compatible bucket), served through the
  API with a workspace permission check, or through HMAC-signed URLs with an expiry for embedding
  in exports and handoff.
- Transport hardening: helmet on the API; nginx serves the client with a Content Security Policy
  (`default-src 'self'`, no inline scripts), `nosniff`, frame and referrer policies; CORS allow-list
  with credentials; `trust proxy` behind nginx; optional Caddy TLS edge
  (`docker compose --profile https`) with automatic certificates and HSTS.
- Monitoring: `GET /api/v1/metrics` exposes Prometheus counters/histograms for requests; the
  health endpoint reports database connectivity.
- Secrets: never committed; `.env.example` / `.env.docker.example` document every variable. Change
  `SESSION_SECRET` and the database password before exposing an instance.
- Optimistic concurrency on HTTP document saves prevents lost updates; realtime rooms converge
  through CRDT merging (ADR-0012).

The pre-launch review with per-control results is in `security-review-2026-11.md`.

## Known limits

- Frame locks are enforced on the HTTP save path and by the editor; a modified client could send
  realtime updates that touch a locked frame (ADR-0012).
- Password policy is length-based only; no breached-password check.
- Share links cannot be scoped to a frame or protected with a password.
- One API instance per deployment for realtime (no cross-instance relay).

## Operations

Backups: `scripts/backup.sh` dumps PostgreSQL and archives uploaded assets; `scripts/restore.sh`
restores both. Run backups from cron on the host; keep them off the server.

## Reporting

Report vulnerabilities privately to the maintainers; do not open public issues for them.
