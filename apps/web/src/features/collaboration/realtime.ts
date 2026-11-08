import { Y, bindGraph, decodeUpdate, encodeUpdate } from '@sigma/collab';
import type { GraphBinding } from '@sigma/collab';
import type { Editor } from '@sigma/engine';
import type { PresenceClientMessage, PresenceServerMessage } from '@sigma/validation';

export interface RealtimeOptions {
  /** True when the editor holds edits the server has not seen (offline work); they are merged on sync. */
  isDirty?: () => boolean;
  /** Called with every server revision (own saves included) so HTTP fallbacks use the right base. */
  onRevision?: (revision: number) => void;
  /** Called when realtime becomes active or inactive. */
  onActive?: (active: boolean) => void;
  /** Read-only participants apply remote state but never send. */
  readOnly?: boolean;
}

/**
 * Realtime co-editing session for one editor: applies `sync`/`update` messages from the presence
 * socket to the scene graph through a Yjs binding and sends local changes back. Transport-agnostic
 * so it can be unit-tested with an in-memory relay.
 */
export class RealtimeSession {
  private binding: GraphBinding | null = null;
  private offDoc: (() => void) | null = null;
  private offReplaced: (() => void) | null = null;
  private docListener: ((u: Uint8Array, origin: unknown) => void) | null = null;
  private listeningDoc: Y.Doc | null = null;
  private _active = false;

  constructor(
    private readonly editor: Editor,
    private readonly send: (msg: PresenceClientMessage) => void,
    private readonly opts: RealtimeOptions = {},
  ) {
    // The graph object changes when a document is (re)loaded: rebind to the same shared state.
    this.offDoc = editor.events.on('document', () => {
      if (!this.binding) return;
      const doc = this.binding.doc;
      this.teardownBinding();
      this.bind(doc, false);
    });
  }

  get active(): boolean {
    return this._active;
  }

  handle(msg: PresenceServerMessage): void {
    if (msg.type === 'sync') {
      this.opts.onRevision?.(msg.revision);
      const state = decodeUpdate(msg.state);
      if (this.binding) {
        this.binding.reset(state);
      } else {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, state, 'server');
        this.bind(doc, this.opts.isDirty?.() ?? false);
      }
      this.setActive(true);
    } else if (msg.type === 'update') {
      if (this.binding) Y.applyUpdate(this.binding.doc, decodeUpdate(msg.update), 'remote');
    } else if (msg.type === 'saved') {
      this.opts.onRevision?.(msg.revision);
    }
  }

  /** Socket closed: local edits fall back to HTTP saves until the next `sync`. */
  disconnected(): void {
    this.setActive(false);
  }

  destroy(): void {
    this.offDoc?.();
    this.teardownBinding();
    this.setActive(false);
  }

  private bind(doc: Y.Doc, mergeLocal: boolean): void {
    // Listen before binding so edits merged on connect are sent too.
    const origin = { name: 'sigma-local' };
    this.listen(doc, origin);
    this.binding = bindGraph(this.editor.graph, doc, { mergeLocal, origin });
    this.offReplaced = this.binding.onDocReplaced((d) => this.listen(d, origin));
  }

  private listen(doc: Y.Doc, localOrigin: object): void {
    if (this.listeningDoc && this.docListener) this.listeningDoc.off('update', this.docListener);
    this.docListener = (u, origin) => {
      if (this.opts.readOnly || origin !== localOrigin) return;
      this.send({ type: 'update', update: encodeUpdate(u) });
    };
    this.listeningDoc = doc;
    doc.on('update', this.docListener);
  }

  private teardownBinding(): void {
    if (this.listeningDoc && this.docListener) this.listeningDoc.off('update', this.docListener);
    this.listeningDoc = null;
    this.docListener = null;
    this.offReplaced?.();
    this.offReplaced = null;
    this.binding?.destroy();
    this.binding = null;
  }

  private setActive(active: boolean): void {
    if (this._active === active) return;
    this._active = active;
    this.opts.onActive?.(active);
  }
}
