# ADR-0011: Presence, frame locks and versions before CRDT co-editing

## Status

Accepted (2026-11-08)

## Context

Teams asked for awareness of who is in a file, protection against stepping on each other's work,
and recoverable history. Full CRDT co-editing (Yjs) is a large milestone; shipping it first would
delay the features above.

## Decision

- Presence is a thin WebSocket channel (`ws` on the existing HTTP server): join, awareness
  (cursor, selection, page), leave, and `saved` notifications. Content still travels over HTTP with
  revisions; an idle editor that receives `saved` reloads itself, a dirty one is warned.
- Frame locks and review states live in node `metadata` so they travel with the document and
  survive exports. The server enforces locks on save by comparing the locked subtree canonically;
  the client hides locked frames from selection via `Editor.nodeGuard`.
- Versions are snapshots of the full document JSON in PostgreSQL (`document_snapshots.content`),
  created on demand and automatically at most hourly; diffs are computed by stable node id.

## Alternatives considered

Yjs now (deferred, ADR-0004 stays the plan), per-node operational locks in a separate table
(more machinery, no benefit until co-editing), snapshots in object storage (deferred until size
requires it).

## Consequences

Low operational cost (no Redis dependency). When Yjs arrives, presence messages map onto its
awareness protocol and locks/review states stay unchanged in metadata.
