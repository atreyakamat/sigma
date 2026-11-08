# ADR-0010: Self-hosted authentication, sessions and RBAC

## Status

Accepted (2026-11-08)

## Context

SIGMA is deployed as a self-hosted Docker stack for a team. There is no public sign-up: one
bootstrap administrator creates accounts and hands out passwords. The product spec asks for secure
session-based auth, workspace roles OWNER/ADMIN/EDITOR/VIEWER and authorization on every document
operation. No native dependencies may be required (pnpm 12 blocks build scripts by default).

## Decision

- Passwords hashed with Node's built-in `crypto.scrypt`; generated 16-character temporary passwords
  with `mustChangePassword`.
- Opaque session tokens stored hashed in a `sessions` table (PostgreSQL, no Redis dependency),
  delivered as an httpOnly SameSite=Lax cookie; Origin check for CSRF; login throttling per IP.
- A single permission matrix (`WORKSPACE_PERMISSIONS` in `@sigma/validation`) consumed by both the
  API guard logic and the UI.
- System role `ADMIN` for user administration, separate from workspace roles.
- Latest document JSON stored in `documents.content` (JSONB) with an integer revision for optimistic
  concurrency; snapshots/update log reserved for versioning and Yjs.

## Alternatives considered

JWTs (no server-side revocation; rejected), argon2 (native module; rejected for now), Redis-backed
sessions (extra moving part before collaboration needs Redis), per-document ACLs now (deferred:
workspace roles cover the current product).

## Consequences

Simple operations: one Postgres, one API, one web container. Sessions can be revoked. Argon2id can
replace scrypt later by versioning the hash prefix. Per-document permissions and share links will
layer on top of the same `assertPermission` seam.
