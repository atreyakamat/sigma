# ADR-0004: Realtime collaboration with Yjs (planned)

## Status

Proposed. **Not implemented.** No collaboration code exists and `yjs` is not a dependency of any
package. This record captures the direction that earlier decisions (ADR-0003, ADR-0005, the
database schema) were shaped around, so that it is reviewed before Milestone 3+ work starts.

## Context

Multiplayer editing is a product requirement. The pieces that already exist and constrain the
design:

- `SceneGraph` (ADR-0003) is a flat map of immutable nodes keyed by id, with a `replaceNode`
  operation documented as "used by collaboration and undo".
- Every local mutation goes through a `Command` (ADR-0005) that reports `affectedNodeIds()`,
  described in the code as the seam for "collaboration conflict checks".
- The database schema (`docs/DATABASE.md`) has a `document_updates` table (`sequence_number`,
  `update_data BYTEA`, unique per document) and `document_snapshots` (`revision`,
  `schema_version`, `storage_key`, `content_hash`).
- `apps/api` has an empty `CollaborationModule`, and the Docker stack includes Redis, listed in
  the API README for "sessions, realtime pub/sub".

## Decision (planned)

Use **Yjs** as the CRDT:

- Represent a page's nodes as a `Y.Map<Y.Map>` keyed by node id, mirroring the flat scene graph.
  Hierarchy stays as `parentId` / `childIds` fields on each node, which keeps reparenting a
  two-key change rather than a tree move.
- Bind the `SceneGraph` to the Yjs document: local commands apply to the graph and are mirrored
  into the `Y.Doc`; remote updates are applied with `replaceNode` / `insertNode` / `removeNode`
  inside a `graph.batch()` so the UI gets one coalesced change event.
- Persist each Yjs update as a row in `document_updates` with a per-document monotonic
  `sequence_number`; periodically fold the update log into a snapshot stored in object storage
  (`document_snapshots.storage_key` pointing at the S3/MinIO bucket) so loads do not replay the
  full history.
- Transport over a WebSocket endpoint in `CollaborationModule`; fan out between API instances via
  Redis pub/sub. Presence (cursors, selections) is ephemeral awareness state, never persisted.
- Undo/redo stays local and command-based; it is not Yjs' `UndoManager`, because the history
  entries must stay tied to the user's own commands.

## Alternatives considered

- **Operational transformation.** Requires a central sequencer and per-operation transform
  functions for every command type; more code and harder to make correct than a CRDT for a
  node map.
- **Last-writer-wins over REST with `baseRevision`.** `SaveDocumentContentSchema` in
  `@sigma/validation` already carries an optional `baseRevision` so a conflict-detecting save can
  ship before realtime does; it is a stepping stone, not the end state.
- **Automerge.** Comparable model; Yjs chosen for smaller update encoding and the existing
  ecosystem of providers (`y-websocket`, `y-indexeddb`) that match the planned transport and the
  local-first client (ADR-0009).

## Consequences

- Until this is implemented, the editor is single-user and documents live in the browser
  (ADR-0009). The API tables for updates and snapshots are created by migration `0001_init` but
  unused.
- The scene graph must keep all node changes expressible as whole-node replacements or
  hierarchy edits; that is already true today and should not be relaxed.
- Node ids must be globally unique and generated client-side (`createNodeId()` in
  `@sigma/shared`, 21-character random ids), which they are.
- Adopting Yjs adds a runtime dependency to the web client and the API; this record should be
  revisited and marked Accepted (or superseded) when the work is scheduled.
