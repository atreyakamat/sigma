import type { SceneGraph } from '@sigma/document';
import { Emitter } from '@sigma/shared';
import type { Command } from './command';
import { BatchCommand } from './commands/batch';

export interface HistoryEntry {
  command: Command;
  /** Timestamp of the last merge into this entry. */
  time: number;
  /** Document revision after the command executed. */
  revision: number;
}

export interface HistoryEvents extends Record<string, unknown> {
  change: { canUndo: boolean; canRedo: boolean; undoName: string | null; redoName: string | null };
  execute: { command: Command; merged: boolean };
  undo: { command: Command };
  redo: { command: Command };
}

export interface HistoryOptions {
  /** Maximum number of undo entries kept. */
  limit?: number;
  /** Commands sharing a mergeKey executed within this many ms are merged into one entry. */
  mergeWindowMs?: number;
  now?: () => number;
}

/**
 * Linear undo/redo stack with command merging, transactions (grouping) and explicit boundaries.
 */
export class History {
  readonly events = new Emitter<HistoryEvents>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private transaction: { name: string; commands: Command[] } | null = null;
  private readonly limit: number;
  private readonly mergeWindowMs: number;
  private readonly now: () => number;
  private boundary = false;

  constructor(
    private readonly graph: SceneGraph,
    options: HistoryOptions = {},
  ) {
    this.limit = options.limit ?? 200;
    this.mergeWindowMs = options.mergeWindowMs ?? 1000;
    this.now = options.now ?? (() => Date.now());
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoName(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.command.name ?? null;
  }

  get redoName(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.command.name ?? null;
  }

  get length(): number {
    return this.undoStack.length;
  }

  get inTransaction(): boolean {
    return this.transaction !== null;
  }

  /**
   * Validates and executes a command, recording it. Returns false (and does nothing) when the
   * command is invalid for the current document state.
   */
  execute(command: Command): boolean {
    if (!command.validate(this.graph)) return false;
    command.execute(this.graph);
    if (this.transaction) {
      this.transaction.commands.push(command);
      return true;
    }
    this.record(command);
    return true;
  }

  /** Starts grouping subsequent commands into one entry until `commit()` or `abort()`. */
  beginTransaction(name: string): void {
    if (this.transaction) throw new Error('A transaction is already open');
    this.transaction = { name, commands: [] };
  }

  /** Ends the transaction and records it as a single undoable entry. */
  commit(): boolean {
    const tx = this.transaction;
    if (!tx) throw new Error('No transaction is open');
    this.transaction = null;
    if (tx.commands.length === 0) return false;
    const batch = new BatchCommand(tx.name, tx.commands);
    // Already executed command-by-command; mark the batch as fully executed for undo bookkeeping.
    (batch as unknown as { executedCount: number }).executedCount = tx.commands.length;
    this.record(batch, false);
    return true;
  }

  /** Reverts everything executed since `beginTransaction` and discards the group. */
  abort(): void {
    const tx = this.transaction;
    if (!tx) throw new Error('No transaction is open');
    this.transaction = null;
    this.graph.batch(() => {
      for (let i = tx.commands.length - 1; i >= 0; i--)
        (tx.commands[i] as Command).undo(this.graph);
    });
  }

  /** Runs `fn` inside a transaction; aborts if it throws. */
  transact<T>(name: string, fn: () => T): T {
    this.beginTransaction(name);
    try {
      const result = fn();
      this.commit();
      return result;
    } catch (err) {
      this.abort();
      throw err;
    }
  }

  /** Prevents the next command from merging into the previous entry (e.g. on pointer-up). */
  markBoundary(): void {
    this.boundary = true;
  }

  undo(): boolean {
    if (this.transaction) throw new Error('Cannot undo during a transaction');
    const entry = this.undoStack.pop();
    if (!entry) return false;
    entry.command.undo(this.graph);
    this.redoStack.push(entry);
    this.boundary = true;
    this.events.emit('undo', { command: entry.command });
    this.emitChange();
    return true;
  }

  redo(): boolean {
    if (this.transaction) throw new Error('Cannot redo during a transaction');
    const entry = this.redoStack.pop();
    if (!entry) return false;
    entry.command.execute(this.graph);
    this.undoStack.push(entry);
    this.boundary = true;
    this.events.emit('redo', { command: entry.command });
    this.emitChange();
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emitChange();
  }

  /** Snapshot of the undo stack (newest last), for history panels. */
  entries(): readonly HistoryEntry[] {
    return this.undoStack;
  }

  private record(command: Command, allowMerge = true): void {
    this.redoStack = [];
    const time = this.now();
    const last = this.undoStack[this.undoStack.length - 1];
    let merged = false;
    if (
      allowMerge &&
      !this.boundary &&
      last &&
      command.mergeKey &&
      last.command.mergeKey === command.mergeKey &&
      time - last.time <= this.mergeWindowMs &&
      last.command.merge?.(command)
    ) {
      last.time = time;
      last.revision = this.graph.revision;
      merged = true;
    } else {
      this.undoStack.push({ command, time, revision: this.graph.revision });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.boundary = false;
    this.events.emit('execute', { command, merged });
    this.emitChange();
  }

  private emitChange(): void {
    this.events.emit('change', {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoName: this.undoName,
      redoName: this.redoName,
    });
  }
}
