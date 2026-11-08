# ADR-0009: Local-first persistence before the API

## Status

Accepted. Implemented in Milestone 2 (`apps/web/src/lib/document-repository.ts`,
`apps/web/src/features/editor/EditorPage.tsx`).

## Context

The editor MVP (Milestone 2) had to be usable end to end — create a file, draw, close the tab,
come back, export — before the API had any business endpoints (as of now only
`GET /api/v1/health` exists). Waiting for accounts, workspaces and document endpoints would have
blocked all editor work on backend work, and the end-to-end test needs persistence to verify
reload behaviour.

## Decision

Persist documents in the browser behind a storage interface that the API client will later
implement:

- **`DocumentRepository`** interface: `list`, `get`, `create`, `save`, `rename`, `remove`,
  `duplicate`. The dashboard and the editor only talk to this interface
  (`documentRepository` singleton).
- **`LocalDocumentRepository`** stores `StoredDocument` records (`id`, `name`, `createdAt`,
  `updatedAt`, `thumbnail`, `nodeCount`, `content`) in IndexedDB — database `sigma`, version 1,
  object store `documents` keyed by `id`. Every read runs `migrateDocument` +
  `parseDocumentJSON`; every write validates with `parseDocumentJSON`, so the store never holds
  an invalid document.
- **Autosave** in `EditorPage`: every `change` event from the editor schedules a save
  600 ms later (debounced). The save serialises the graph, renders a quarter-scale PNG thumbnail
  of the current page with `exportPngDataUrl`, writes through the repository and updates the
  `saveStatus` shown in the status bar (`saving` → `Saved`). A pending save is flushed when the
  tab becomes hidden (`visibilitychange`) and when the editor unmounts; `beforeunload` warns
  while a save is pending.
- **Import/export of files**: `@sigma/import-export` defines the `.sigma.json` document file
  (`serializeDocument`, `parseDocumentFile`) so documents can leave and re-enter the browser
  without a server.
- Milestone 3 is expected to add an HTTP-backed repository behind the same interface; the UI
  copy already says files are stored in this browser until then.

## Alternatives considered

- **Build the API first.** Rejected: it serialises the two work streams and gives the engine no
  real users until much later.
- **`localStorage`.** Synchronous and limited to a few MB; documents with embedded image data
  URLs (image fills store `src` inline when unsaved) would not fit.
- **File System Access API.** Not available in all browsers and requires user gestures per file;
  the explicit `.sigma.json` import/export covers the "I want a file" case.
- **Keep documents only in memory.** Would have made the reload/reopen path of the e2e test
  untestable and lost work on refresh.

## Consequences

- Documents are per browser profile; there is no sync, sharing or multi-device access until the
  API exists.
- The API's planned document storage (snapshots in object storage plus a Yjs update log, see
  `docs/DATABASE.md`) is independent of this; the repository interface hides which one is used.
- The thumbnail is generated on the client on every autosave; for large pages this is bounded by
  the 0.25 scale factor but is still a full rasterisation.
- Clearing site data deletes all documents; the dashboard's "Import .sigma.json" is the recovery
  path.
