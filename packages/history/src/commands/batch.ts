import type { SceneGraph } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import type { Command } from '../command';
import { BaseCommand } from '../command';

/** Executes several commands as one history entry. Undo runs in reverse order. */
export class BatchCommand extends BaseCommand {
  readonly name: string;
  /** The batch merges like its first command (drag coalescing works through layout batches). */
  override readonly mergeKey?: string;
  private readonly commands: Command[];
  private executedCount = 0;

  constructor(name: string, commands: Command[]) {
    super();
    this.name = name;
    this.commands = commands;
    this.mergeKey = commands[0]?.mergeKey;
  }

  get size(): number {
    return this.commands.length;
  }

  override validate(graph: SceneGraph): boolean {
    return this.commands.length > 0 && this.commands.every((c) => c.validate(graph));
  }

  execute(graph: SceneGraph): void {
    graph.batch(() => {
      this.executedCount = 0;
      for (const c of this.commands) {
        c.execute(graph);
        this.executedCount++;
      }
    });
  }

  undo(graph: SceneGraph): void {
    graph.batch(() => {
      for (let i = this.executedCount - 1; i >= 0; i--) (this.commands[i] as Command).undo(graph);
      this.executedCount = 0;
    });
  }

  /** Adds an already-executed command to this batch; same-key update commands merge in place. */
  append(command: Command): void {
    for (const existing of this.commands) {
      if (
        existing !== this.commands[0] &&
        command.mergeKey &&
        existing.mergeKey === command.mergeKey &&
        existing.merge?.(command)
      )
        return;
    }
    this.commands.push(command);
    this.executedCount = this.commands.length;
  }

  override merge(next: Command): boolean {
    const first = this.commands[0];
    if (!first?.merge || !this.mergeKey || next.mergeKey !== this.mergeKey) return false;
    return first.merge(next);
  }

  affectedNodeIds(): readonly NodeId[] {
    const ids = new Set<NodeId>();
    for (const c of this.commands) for (const id of c.affectedNodeIds()) ids.add(id);
    return [...ids];
  }
}
