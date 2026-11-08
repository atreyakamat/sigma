import type { SceneGraph } from '@sigma/document';
import type { NodeId } from '@sigma/shared';

/**
 * A reversible document operation. Commands are the only way the editor mutates a SceneGraph
 * outside of collaboration replay, which gives undo/redo, history grouping and (later) CRDT
 * integration one consistent seam.
 */
export interface Command {
  /** Human-readable label, e.g. "Move 3 layers". */
  readonly name: string;
  /**
   * Commands with the same non-empty mergeKey executed back-to-back inside the merge window are
   * folded into one history entry (continuous drags, slider changes).
   */
  readonly mergeKey?: string;
  /** Returns false when the command cannot run against the current graph (e.g. node vanished). */
  validate(graph: SceneGraph): boolean;
  execute(graph: SceneGraph): void;
  undo(graph: SceneGraph): void;
  /** Ids this command touches; used for change notifications and collaboration conflict checks. */
  affectedNodeIds(): readonly NodeId[];
  /**
   * Attempts to absorb a later command with the same mergeKey. Returns true when merged; the
   * merged command must then undo to the state before the first command and redo to the state after
   * the last.
   */
  merge?(next: Command): boolean;
}

export abstract class BaseCommand implements Command {
  abstract readonly name: string;
  readonly mergeKey?: string;
  validate(_graph: SceneGraph): boolean {
    return true;
  }
  abstract execute(graph: SceneGraph): void;
  abstract undo(graph: SceneGraph): void;
  abstract affectedNodeIds(): readonly NodeId[];
  merge?(next: Command): boolean;
}
