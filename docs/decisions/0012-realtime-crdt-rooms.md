# ADR-0012: Realtime co-editing with Yjs rooms persisted into `documents`

## Status

Accepted (2026-11-08). Implements the direction of ADR-0004 with two deliberate deviations noted
below.

## Context

ADR-0011 shipped presence, locks and versions over the revision-checked HTTP save. Teams now need
simultaneous editing of one file. The constraints: keep the engine's command/undo model local
(ADR-0005), keep `documents.content` the single source of truth for exports, the CLI, versions and
thumbnails, and stay deployable as one API container without extra services.

## Decision

- **Shared model** (`@sigma/collab`): a `Y.Map('nodes')` holding one plain JSON record per scene
  node (`id`, `type`, `parentId`, `childIds`, props) plus a `Y.Map('meta')` with `name`,
  `metadata` and `pageIds`. Records are replaced wholesale, so Yjs resolves concurrent edits to one
  node last-writer-wins per node. Hierarchy conflicts (two users inserting into the same parent
  while apart) are repaired by a deterministic order function: the parent's listed order first,
  then unlisted children sorted by id. Every peer computes the same result, so graphs converge.
- **Binding** (`bindGraph`): local `SceneGraph` changes are mirrored into the doc inside a
  transaction tagged with a local origin; remote transactions are applied to the graph in one
  batch (insert / replace / reparent / remove / reorder) so the editor repaints once. Derived
  (projected) instance children are never written; projection recreates them.
- **Transport**: the existing presence WebSocket. Clients receive `sync` (full state) on join and
  after any HTTP replacement of the document, exchange `update` messages, and viewers are refused
  writes server-side (`document.write` is checked on join).
- **Persistence** (`CollabRoomsService`): one in-memory `Y.Doc` per open document. Updates are
  folded into `documents.content` after a 1 s debounce (5 s maximum wait); the room's state is
  authoritative, so no `baseRevision` is checked on that path. Every persist bumps `revision`,
  regenerates the thumbnail and broadcasts `saved`, so HTTP readers stay at most seconds behind.
  When the last participant leaves the room is flushed and dropped. HTTP saves (version restore,
  CLI checkpoints, offline flushes) rebuild the room and push a fresh `sync`.
- **Client fallback**: while realtime is synced the editor does not autosave over HTTP; if the
  socket drops it resumes revision-checked HTTP saves with the latest server revision, and unsynced
  offline edits are merged into the shared state on reconnect.

## Deviations from ADR-0004

- No `document_updates` log or snapshot compaction: the CRDT history is not persisted. Durable
  history is the `document_versions` table; the room is rebuilt from `documents.content` on load.
  This keeps one source of truth and avoids a second persistence format.
- No Redis fan-out: one API instance per deployment. Running several instances would require
  sticky routing or a pub/sub relay; this is documented as a known limit.

## Consequences

- Frame locks are advisory in the realtime path: the editor refuses to touch frames locked by
  others (`nodeGuard`), and the HTTP save path still rejects violations with 409, but a modified
  client could bypass the guard over the socket.
- Node ids must stay globally unique (they are: 21-character random ids) because records are keyed
  by id across all participants.
- Undo stays per user. A user's undo may revert another user's later edit to the same node, as in
  other collaborative editors with per-node LWW.
- The web client and API gain a `yjs` dependency.
