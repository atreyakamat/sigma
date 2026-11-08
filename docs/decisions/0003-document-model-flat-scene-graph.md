# ADR-0003: Document model — nested JSON on disk, flat scene graph in memory

## Status

Accepted. Implemented in Milestone 1 (`packages/document`).

## Context

A design document is a tree: pages contain frames, groups and shapes; frames and groups contain
children. The editor needs fast lookup by id, cheap structural edits (reparent, reorder), change
tracking for rendering and hit testing, and a serialized form that is readable, validatable and
migratable. Realtime collaboration (ADR-0004) will need a representation that maps onto a CRDT map
of nodes rather than a deeply nested structure.

## Decision

Two shapes of the same data, both defined in `packages/document/src/schema.ts`:

1. **Serialized form (`DocumentJSON`)** — `{ schemaVersion, id, name, pages, metadata }` where
   each page is a `NodeJSON` with nested `children` arrays. Defined with zod 4. Every object schema
   is `.strict()`, so unknown keys are rejected rather than silently dropped. `superRefine` checks
   enforce that top-level nodes are pages, that node ids are unique across the document and that
   only container types (`PAGE`, `FRAME`, `GROUP`) carry `children`. `SCHEMA_VERSION` is `1`.
2. **In-memory form (`SceneGraph`)** — a flat `Map<NodeId, SceneNode>` where each `SceneNode` is
   the node's props plus `parentId` and `childIds`. Nodes are immutable value objects: every
   mutation replaces the node object and bumps a monotonic `revision`. Changes are reported through
   a single `change` event (`{ revision, added, removed, updated, structural }`); `batch()`
   coalesces nested mutations into one event. World matrices are cached per node and invalidated
   on transform/size changes or any structural change.

Node types are `PAGE`, `FRAME`, `GROUP`, `RECTANGLE`, `ELLIPSE`, `LINE`, `POLYGON`, `STAR`,
`TEXT`, `IMAGE` and `VECTOR`. Shared props: `id`, `name`, `visible`, `locked`, `transform`
(`x`, `y`, `rotation` in degrees, `scaleX`, `scaleY`), `size`, `style` (fills, strokes, effects,
opacity, blend mode, corner radius), `constraints`, `metadata`. Paints are a discriminated union
(`SOLID`, `LINEAR_GRADIENT`, `RADIAL_GRADIENT`, `IMAGE`). Colors are `{ r, g, b, a }` in `0..1`.

Node factories (`createNodeProps`) always run the result through the schema, so every node in a
graph satisfies it. A migrations registry (`MIGRATIONS`, keyed by the version it upgrades _from_)
is applied by `migrateDocument` before parsing; unknown or newer versions throw
`UnsupportedSchemaError`. The registry is empty at version 1.

## Alternatives considered

- **Keep the nested tree in memory too.** Simple, but reparenting, id lookup and change
  tracking become tree walks, and a nested structure does not map onto a `Y.Map` of nodes.
- **Mutable node classes with methods.** Rejected: structural sharing and reference equality are
  what let the React layer and the renderer skip work (`useEditorValue` compares with
  `Object.is`), and immutable plain objects serialize and diff trivially.
- **Store the document as a CRDT document from the start.** Rejected for Milestones 1–2: it would
  tie the single-user editor to a collaboration library before the API exists. The flat map was
  shaped so it can be bound to one later.
- **Loose schema (`passthrough`).** Rejected: silently accepting unknown keys is how data loss
  and version skew go unnoticed. Strictness plus explicit migrations is the chosen trade.

## Consequences

- Schema changes that break existing documents require bumping `SCHEMA_VERSION` and adding a
  migration; `parseDocumentJSON` refuses anything else.
- Every consumer (renderer, hit testing, SVG export, inspector) switches on `node.type`; adding a
  type touches all of them (documented in `docs/DEVELOPMENT.md`).
- Groups have no size of their own: their local bounds are the union of their children's bounds,
  which is computed on demand.
- Patching is one level deep for `transform`, `size`, `style`, `textStyle`, `image`,
  `constraints` and `metadata`; arrays inside `style` (fills, strokes, effects) are replaced
  wholesale.
