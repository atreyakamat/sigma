# Architecture decision records

Each record describes one architectural decision: the context at the time, what was decided, what
else was considered and what the decision costs. Records are numbered in the order they were
written and are never deleted; a superseded record gets its status changed and a pointer to the
newer one.

| ADR                                                  | Title                                         | Status   |
| ---------------------------------------------------- | --------------------------------------------- | -------- |
| [0001](./0001-modular-monolith.md)                   | Modular monolith in a pnpm/Turborepo          | Accepted |
| [0002](./0002-custom-engine-canvas2d.md)             | Custom editor engine on Canvas 2D             | Accepted |
| [0003](./0003-document-model-flat-scene-graph.md)    | Document model: nested JSON, flat scene graph | Accepted |
| [0004](./0004-collaboration-yjs-planned.md)          | Realtime collaboration with Yjs (planned)     | Proposed |
| [0005](./0005-command-system-and-history.md)         | Command system and history                    | Accepted |
| [0006](./0006-spatial-index-grid-hash.md)            | Spatial index: uniform grid hash              | Accepted |
| [0007](./0007-jit-typescript-packages.md)            | Just-in-time TypeScript packages              | Accepted |
| [0008](./0008-typescript-6-toolchain.md)             | TypeScript 6 toolchain                        | Accepted |
| [0009](./0009-local-first-persistence-before-api.md) | Local-first persistence before the API        | Accepted |

## Writing a new record

1. Copy the section layout of an existing record: **Status**, **Context**, **Decision**,
   **Alternatives considered**, **Consequences**.
2. Number it `NNNN-short-slug.md` with the next free number.
3. Add a row to the table above.
4. Reference the record from code comments where the decision shows up (the scene graph and the
   spatial index already cite ADR-0004 and ADR-0006).

- [ADR-0010](0010-self-hosted-auth-and-rbac.md) — self-hosted authentication, sessions and RBAC
- [ADR-0011](0011-collaboration-presence-locks-versions.md) — presence, frame locks and versions before CRDT co-editing
