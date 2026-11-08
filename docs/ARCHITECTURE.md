# SIGMA architecture

## Principle

The editor engine is the product's foundation. The frontend is one interface to that engine; the
backend persists and authorizes documents; the collaboration layer synchronizes them. These
responsibilities stay separate:

| Responsibility     | Owner                                            | Must not                                   |
| ------------------ | ------------------------------------------------ | ------------------------------------------ |
| Document truth     | `@sigma/document` (SceneGraph)                   | depend on rendering or UI                  |
| Mutations          | `@sigma/history` commands via `EditorOperations` | mutate the graph directly from tools or UI |
| Drawing            | `@sigma/renderer`                                | hold document state or mutate it           |
| Interaction        | `@sigma/engine` + `@sigma/tools`                 | know about React                           |
| Interface          | `apps/web`                                       | own canvas objects as DOM/React components |
| Persistence & auth | `apps/api` (NestJS + Prisma)                     | transmit per-pointer-move edits            |

## Layers

```
Browser
 ├── apps/web (React)            toolbar · layers · inspector · dashboard · autosave
 │     └── @sigma/engine          Editor façade (no React)
 │           ├── @sigma/tools     select/hand/shape/text/image tools
 │           ├── @sigma/renderer  Viewport · Canvas2DRenderer · text layout · rasterize
 │           ├── @sigma/history   Command · History · concrete commands
 │           └── @sigma/document  schema (zod) · SceneGraph · migrations
 │                 └── @sigma/geometry · @sigma/shared
 ├── @sigma/import-export         SVG export · image sniffing · .sigma.json
 └── @sigma/validation            zod contracts shared with the API
Server (planned usage)
 ├── apps/api (NestJS + Prisma)   auth · workspaces · projects · documents · assets · versions
 ├── PostgreSQL                    metadata, permissions, update log
 ├── Redis                         sessions, queues (BullMQ), presence
 ├── Local volume or S3 bucket     uploaded assets (signed URLs)
 └── @sigma/collab + WebSockets    CRDT document sync (Yjs rooms, ADR-0012)
```

Dependency direction is strictly downward; `pnpm verify` typechecks every package in isolation, which
makes a cycle a build error. Packages are "just-in-time" (source exports, see ADR-0007).

## Document model

- A document is `{ schemaVersion, id, name, pages[] }`. Pages are nodes; every node has a stable
  random id, `type`, `name`, `transform {x, y, rotation, scaleX, scaleY}`, `size`, `style`,
  `visible`, `locked`, `constraints`, `metadata`, and type-specific fields.
- **Serialized form** nests `children`. **In memory** the `SceneGraph` keeps a flat
  `Map<NodeId, SceneNode>` where each node carries `parentId` and `childIds`. Nodes are immutable
  value objects: every mutation replaces the node and bumps `graph.revision`, so React and the
  renderer can compare by reference. The flat shape maps directly onto a Yjs `Y.Map` (ADR-0004).
- The schema is strict (unknown keys rejected) and versioned; `migrateDocument` upgrades older files
  through a registry before validation.

## Coordinate system

World coordinates are the document's unit. `screen = viewport.zoom × world + viewport.offset`.
A node's local space has its origin at its top-left; `world = parentWorld × T(x,y) × R(rotation) × S(scale)`.
World matrices are cached in the graph and invalidated on transform/structural changes.

## Edit pipeline

```
pointer/keyboard → InputSystem (screen→world) → ToolManager → active tool
    → EditorOperations → Command.execute(graph) → SceneGraph change event
    → HitTester index update · Renderer invalidate(dirty rect) · UI subscribers
```

Continuous interactions (drags, sliders) issue many small commands sharing a `mergeKey`; `History`
folds them into one undo entry inside a time window, and `markBoundary()` on pointer-up ends the
run. Multi-step operations use `history.transact()`.

## Rendering

Two stacked canvases: the document canvas (Canvas 2D renderer, world transform applied) and the
overlay canvas (screen-space selection, handles, guides, rulers, tool previews). The renderer culls
against the visible world rect and supports dirty-region redraws when only node updates occurred.
`rasterizeNodes` reuses the same draw primitives for PNG export and thumbnails; SVG export mirrors
their semantics in `@sigma/import-export`.

## Frontend

`apps/web` subscribes to engine events through `useEditorValue(select, events)` and never stores
document data in React state. UI-only state (panels, save status) lives in a Zustand store.
Documents are loaded/saved through the `DocumentRepository` interface; today's implementation is
the HTTP API (`api-document-repository.ts`) with revision-based optimistic concurrency; viewers get a
read-only editor (ADR-0010). ADR-0009 describes the earlier IndexedDB stage.

## Backend

A modular NestJS monolith (`apps/api`) with one module per bounded concept, thin controllers and
services holding logic. The Prisma schema (users, workspaces, members, projects, folders,
documents, snapshots, updates, assets, comments, permissions, share tokens, versions) and migration
`0001_init` exist; only `/api/v1/health` is implemented. See `docs/DATABASE.md` and `docs/API.md`.

## Collaboration

`@sigma/collab` binds a `SceneGraph` to a Yjs document: one JSON record per node in a `Y.Map`,
document meta in a second map. Local commands apply to the graph as before (undo stays local); the
binding mirrors the resulting node changes into the Y.Doc and applies remote transactions back in
one batch. Hierarchy conflicts are repaired deterministically so every peer converges. The API
keeps one room per open document on the presence socket, relays updates, and folds the room into
`documents.content` after a short debounce, so exports, versions and the CLI read the same table
as before. Presence (cursors, selections) is ephemeral awareness on the same socket. Details and
trade-offs: ADR-0012.

## Non-goals for now

Microservices, plugins, AI generation, animation timelines, native apps, enterprise billing.
