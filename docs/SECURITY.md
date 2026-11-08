# Security

## Implemented

- Authentication: scrypt password hashes, hashed random session tokens, httpOnly SameSite=Lax
  cookies (`COOKIE_SECURE=true` behind HTTPS), sliding 30-day expiry, logout invalidation,
  deactivation revokes sessions, forced password change for generated passwords.
- Authorization: every protected route resolves the caller's workspace role server-side and checks
  it against `WORKSPACE_PERMISSIONS`; non-members receive 404. System-admin routes use a dedicated
  guard. The UI hides controls by role but never relies on that.
- Brute-force limits: login throttled per IP (`LOGIN_RATE_LIMIT`, default 20/min).
- CSRF: state-changing requests require a matching `Origin`/`Referer`.
- Input validation: strict zod schemas (unknown keys rejected) for every body and for document
  content; UUID params validated; image uploads checked by magic bytes with a 20 MB cap.
- Transport hardening: helmet, CORS allow-list with credentials, `trust proxy` behind nginx.
- Secrets: never committed; `.env.example` / `.env.docker.example` document every variable. Change
  `SESSION_SECRET` and the database password before exposing an instance.
- Optimistic concurrency on document saves prevents lost updates.

## Not yet implemented

Signed asset URLs and object storage (no uploads yet; images are embedded in files), audit log for
administrative actions, password policy beyond length, 2FA, session listing/revocation UI, share
links. Expose SIGMA only behind HTTPS (set `PUBLIC_URL`, `COOKIE_SECURE=true`).

## Reporting

Report vulnerabilities privately to the maintainers; do not open public issues for them.
