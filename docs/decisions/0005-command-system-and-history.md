# ADR-0005: Command system and history

## Status

Accepted. Implemented in Milestone 1 (`packages/history`) and used by every mutation in
`packages/engine`, `packages/tools` and `apps/web`.

## Context

Undo/redo is table stakes for a design tool, and a future collaboration layer (ADR-0004) needs to
know which nodes each edit touches. Interactive edits (drags, slider changes) produce many
intermediate states that should collapse into one undo step, while multi-step operations (group,
frame selection, paste) must undo as a unit.

## Decision

All document mutations outside collaboration replay go through a **`Command`**
(`packages/history/src/command.ts`):

```ts
interface Command {
  readonly name: string; // "Move 3 layers"
  readonly mergeKey?: string; // same key + inside the merge window => folded into one entry
  validate(graph: SceneGraph): boolean;
  execute(graph: SceneGraph): void;
  undo(graph: SceneGraph): void;
  affectedNodeIds(): readonly NodeId[];
  merge?(next: Command): boolean;
}
```

**`History`** is a linear undo/redo stack over one `SceneGraph`:

- `execute(command)` validates first and does nothing when validation fails; otherwise it runs the
  command and records it. Executing a new command clears the redo stack.
- **Merging:** a command with the same non-empty `mergeKey` as the previous entry, executed within
  `mergeWindowMs` (default 1000 ms) and not after `markBoundary()`, is absorbed into that entry
  via `merge()`. Tools call `markBoundary()` on pointer-up so two separate drags stay separate.
- **Transactions:** `beginTransaction(name)` / `commit()` / `abort()` and the `transact()`
  helper group commands into one `BatchCommand` entry; `abort()` undoes them in reverse.
- **Limit:** the undo stack keeps at most `limit` entries (default 200; `Editor` passes
  `historyLimit`, also 200).
- Events: `change` (`canUndo`, `canRedo`, `undoName`, `redoName`), `execute`, `undo`, `redo`.

Shipped commands: `CreateNodeCommand`, `DeleteNodeCommand` (keeps the detached `Subtree` so undo
restores it at the same index), `ReparentNodeCommand`, `ReorderNodeCommand`, `ReplaceNodeCommand`,
`UpdateNodesCommand` (generic patch with per-key snapshots and merge support), and its
specialisations `MoveNodesCommand`, `ResizeNodeCommand`, `RotateNodeCommand`,
`UpdateStyleCommand`, `SetTransformsCommand`; `GroupNodesCommand` / `UngroupNodesCommand`
(preserve world positions by rewriting local transforms); `BatchCommand`.

`EditorOperations` in `@sigma/engine` is the only API the tools and UI use; every method builds a
command and calls `history.execute`, so nothing above the engine touches the graph directly.

## Alternatives considered

- **Snapshot-based undo (copy the whole document per step).** Trivial to implement but O(document)
  memory per step and no notion of which nodes changed, which the collaboration layer needs.
- **Structural patches (immer-style `produce` + inverse patches).** Attractive for the generic
  case, but merge semantics for drags and the "validate before execute" check are easier to
  express per command, and commands double as the vocabulary for logging and replay.
- **Event sourcing of raw scene-graph events.** The graph already emits `change` events, but they
  describe _what_ changed, not _why_; grouping them into user-meaningful undo steps would
  re-invent commands.

## Consequences

- Adding an operation means adding (or composing) a command; a mutation that bypasses the history
  is a bug. Tests in `packages/history/src/__tests__/history.test.ts` and
  `packages/engine/src/__tests__/engine.test.ts` cover execute/undo symmetry.
- `UpdateNodesCommand` snapshots only the top-level keys a patch touches; a patch to
  `style.fills` therefore snapshots the whole `style` object, which is correct but means merged
  entries can hold more state than strictly needed.
- `validate` makes commands safe to replay against a changed document (a node may have been
  deleted by another user); a failed validation is reported as `false`, not an exception.
- History is per editor instance and is reset by `Editor.loadDocument`.
