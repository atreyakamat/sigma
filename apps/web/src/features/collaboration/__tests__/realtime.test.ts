import { describe, expect, it } from 'vitest';
import { SceneGraph, createNodeProps } from '@sigma/document';
import { Editor } from '@sigma/engine';
import { Y, decodeUpdate, encodeUpdate, graphFromYDoc, populateYDoc } from '@sigma/collab';
import type { NodeId } from '@sigma/shared';
import type { PresenceClientMessage, PresenceServerMessage } from '@sigma/validation';
import { RealtimeSession } from '../realtime';

/** In-memory stand-in for the presence gateway's realtime part. */
function fakeServer(json = SceneGraph.createEmpty('Doc').toJSON()) {
  const doc = new Y.Doc();
  populateYDoc(SceneGraph.fromJSON(json), doc, 'server');
  let revision = 0;
  const clients: { session: RealtimeSession; userId: string }[] = [];
  const connect = (editor: Editor, userId: string, readOnly = false) => {
    const session = new RealtimeSession(
      editor,
      (msg: PresenceClientMessage) => {
        if (msg.type !== 'update') return;
        Y.applyUpdate(doc, decodeUpdate(msg.update), userId);
        for (const c of clients)
          if (c.userId !== userId) c.session.handle({ type: 'update', update: msg.update, userId });
      },
      { readOnly, onRevision: (r) => revisions.push(r) },
    );
    clients.push({ session, userId });
    session.handle({ type: 'sync', state: encodeUpdate(Y.encodeStateAsUpdate(doc)), revision });
    return session;
  };
  const revisions: number[] = [];
  const persist = () => {
    revision++;
    const msg: PresenceServerMessage = { type: 'saved', revision, userId: 'x', userName: 'X' };
    for (const c of clients) c.session.handle(msg);
  };
  const restore = (json2: ReturnType<SceneGraph['toJSON']>) => {
    const fresh = new Y.Doc();
    populateYDoc(SceneGraph.fromJSON(json2), fresh, 'server');
    revision++;
    const state = encodeUpdate(Y.encodeStateAsUpdate(fresh));
    for (const c of clients) c.session.handle({ type: 'sync', state, revision });
  };
  return { doc, connect, persist, restore, revisions, content: () => graphFromYDoc(doc).toJSON() };
}

describe('RealtimeSession', () => {
  it('propagates edits between two editors and tracks server revisions', () => {
    const server = fakeServer();
    const a = new Editor({ document: SceneGraph.fromJSON(server.content()) });
    const b = new Editor({ document: SceneGraph.fromJSON(server.content()) });
    const sa = server.connect(a, 'a');
    const sb = server.connect(b, 'b');
    expect(sa.active && sb.active).toBe(true);

    const page = a.currentPageId as NodeId;
    const rect = a.graph.insertNode(createNodeProps('RECTANGLE', { name: 'Shared' }), page);
    expect(b.graph.getNode(rect)?.name).toBe('Shared');
    b.ops.setProps([rect], { name: 'Edited by B' });
    expect(a.graph.getNode(rect)?.name).toBe('Edited by B');
    expect(server.content().pages[0]!.children!.map((c) => c.name)).toEqual(['Edited by B']);

    server.persist();
    expect(server.revisions.at(-1)).toBe(1);
  });

  it('does not send from read-only viewers but still applies remote updates', () => {
    const server = fakeServer();
    const a = new Editor({ document: SceneGraph.fromJSON(server.content()) });
    const v = new Editor({ document: SceneGraph.fromJSON(server.content()) });
    server.connect(a, 'a');
    server.connect(v, 'v', true);
    const page = a.currentPageId as NodeId;
    const rect = a.graph.insertNode(createNodeProps('RECTANGLE', { name: 'R' }), page);
    expect(v.graph.hasNode(rect)).toBe(true);
    v.graph.updateNode(rect, { name: 'viewer attempt' });
    expect(a.graph.getNode(rect)?.name).toBe('R');
  });

  it('follows a server-side restore and survives a local document reload', () => {
    const server = fakeServer();
    const a = new Editor({ document: SceneGraph.fromJSON(server.content()) });
    const b = new Editor({ document: SceneGraph.fromJSON(server.content()) });
    server.connect(a, 'a');
    server.connect(b, 'b');
    const page = a.currentPageId as NodeId;
    const rect = a.graph.insertNode(createNodeProps('RECTANGLE', { name: 'R' }), page);
    expect(b.graph.hasNode(rect)).toBe(true);

    server.restore(SceneGraph.createEmpty('Doc').toJSON());
    expect(a.graph.hasNode(rect)).toBe(false);
    expect(b.graph.hasNode(rect)).toBe(false);

    // B reloads the document locally (e.g. "reload from server"): the binding follows the new graph.
    b.loadDocument(server.content());
    const r2 = a.graph.insertNode(
      createNodeProps('ELLIPSE', { name: 'E' }),
      a.currentPageId as NodeId,
    );
    expect(b.graph.getNode(r2)?.name).toBe('E');
  });

  it('merges unsynced offline edits into the shared state on connect', () => {
    const server = fakeServer();
    const a = new Editor({ document: SceneGraph.fromJSON(server.content()) });
    const offline = a.graph.insertNode(
      createNodeProps('RECTANGLE', { name: 'Offline work' }),
      a.currentPageId as NodeId,
    );
    const session = new RealtimeSession(
      a,
      (msg) => {
        if (msg.type === 'update') Y.applyUpdate(server.doc, decodeUpdate(msg.update), 'a');
      },
      { isDirty: () => true },
    );
    session.handle({
      type: 'sync',
      state: encodeUpdate(Y.encodeStateAsUpdate(server.doc)),
      revision: 0,
    });
    expect(a.graph.hasNode(offline)).toBe(true);
    expect(graphFromYDoc(server.doc).getNode(offline)?.name).toBe('Offline work');
  });
});
