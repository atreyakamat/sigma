import type { NodeJSON } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import type { Editor } from './editor';

const MIME = 'application/x-sigma-nodes+json';

/** Internal clipboard for nodes. Mirrors to the system clipboard as JSON text when available. */
export class EditorClipboard {
  private items: NodeJSON[] = [];
  private sourcePage: NodeId | null = null;

  constructor(private readonly editor: Editor) {}

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  copy(ids: readonly NodeId[] = this.editor.selection.ids): boolean {
    const roots = this.editor.ops.topLevelOf(ids);
    if (roots.length === 0) return false;
    const graph = this.editor.graph;
    // Store with world-space placement so pasting across frames keeps visual position.
    this.items = roots.map((id) => {
      const json = graph.nodeToJSON(id);
      const wb = graph.getWorldBounds(id);
      return { ...json, transform: { ...json.transform, x: wb.x, y: wb.y } };
    });
    this.sourcePage = this.editor.currentPageId;
    void this.writeSystem();
    return true;
  }

  cut(ids: readonly NodeId[] = this.editor.selection.ids): boolean {
    if (!this.copy(ids)) return false;
    this.editor.ops.deleteNodes(ids);
    return true;
  }

  /** Pastes into the current page. Same-page pastes offset by 10px so the copy is visible. */
  paste(): NodeId[] {
    if (this.items.length === 0) return [];
    const samePage = this.sourcePage === this.editor.currentPageId;
    const offset = samePage ? { x: 10, y: 10 } : undefined;
    if (samePage) {
      this.items = this.items.map((n) => ({
        ...n,
        transform: { ...n.transform, x: n.transform.x + 10, y: n.transform.y + 10 },
      }));
    }
    return this.editor.ops.insertJSON(
      this.items,
      this.editor.currentPageId,
      offset ? { x: 0, y: 0 } : undefined,
    );
  }

  serialize(): string {
    return JSON.stringify({ type: MIME, nodes: this.items });
  }

  /** Loads nodes from serialized clipboard text produced by `serialize`. */
  load(text: string): boolean {
    try {
      const parsed = JSON.parse(text) as { type?: string; nodes?: NodeJSON[] };
      if (parsed.type !== MIME || !Array.isArray(parsed.nodes)) return false;
      this.items = parsed.nodes;
      this.sourcePage = null;
      return true;
    } catch {
      return false;
    }
  }

  private async writeSystem(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(this.serialize());
    } catch {
      /* clipboard access denied: internal clipboard still works */
    }
  }
}
