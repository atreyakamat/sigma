import { describe, expect, it } from 'vitest';
import { SceneGraph, createNodeProps } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import * as Y from 'yjs';
import { bindGraph, decodeUpdate, encodeUpdate, graphFromYDoc, populateYDoc } from '../index';

/** Two editors sharing one document through relayed Yjs updates. */
function pair(json = SceneGraph.createEmpty('Shared').toJSON()) {
  const a = SceneGraph.fromJSON(json);
  const b = SceneGraph.fromJSON(json);
  const da = new Y.Doc();
  const db = new Y.Doc();
  populateYDoc(a, da);
  // B starts from A's state, as a client that received the server snapshot would.
  Y.applyUpdate(db, Y.encodeStateAsUpdate(da));
  const ba = bindGraph(a, da);
  const bb = bindGraph(b, db);
  let online = true;
  const queueA: Uint8Array[] = [];
  const queueB: Uint8Array[] = [];
  da.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== ba.origin) return;
    if (online) Y.applyUpdate(db, u, 'remote');
    else queueA.push(u);
  });
  db.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin !== bb.origin) return;
    if (online) Y.applyUpdate(da, u, 'remote');
    else queueB.push(u);
  });
  return {
    a,
    b,
    da,
    db,
    ba,
    bb,
    goOffline() {
      online = false;
    },
    goOnline() {
      online = true;
      for (const u of queueA.splice(0)) Y.applyUpdate(db, u, 'remote');
      for (const u of queueB.splice(0)) Y.applyUpdate(da, u, 'remote');
    },
    destroy() {
      ba.destroy();
      bb.destroy();
    },
  };
}

const page = (g: SceneGraph) => g.pageIds[0] as NodeId;

describe('graph ⇄ Y.Doc binding', () => {
  it('propagates inserts, updates, reparenting, reordering and removals', () => {
    const { a, b } = pair();
    const rect = a.insertNode(createNodeProps('RECTANGLE', { name: 'Rect' }), page(a));
    const frame = a.insertNode(createNodeProps('FRAME', { name: 'Frame' }), page(a));
    expect(b.getNode(rect)?.name).toBe('Rect');
    expect(b.getChildIds(page(b))).toEqual([rect, frame]);

    b.updateNode(rect, { name: 'Renamed', transform: { x: 40 } });
    expect(a.getNode(rect)?.name).toBe('Renamed');
    expect(a.getNode(rect)?.transform.x).toBe(40);

    a.reparentNode(rect, frame);
    expect(b.getParent(rect)?.id).toBe(frame);
    expect(b.getChildIds(page(b))).toEqual([frame]);

    const r2 = b.insertNode(createNodeProps('RECTANGLE', { name: 'R2' }), frame, 0);
    expect(a.getChildIds(frame)).toEqual([r2, rect]);
    a.reorderNode(r2, 1);
    expect(b.getChildIds(frame)).toEqual([rect, r2]);

    b.removeNode(frame);
    expect(a.hasNode(frame)).toBe(false);
    expect(a.hasNode(rect)).toBe(false);
    expect(a.nodeCount).toBe(b.nodeCount);
  });

  it('syncs document name, metadata and page order', () => {
    const { a, b } = pair();
    const p1 = page(a);
    a.setName('Mobile app');
    expect(b.name).toBe('Mobile app');
    const p2 = b.insertNode(createNodeProps('PAGE', { name: 'Page 2' }), null);
    expect(a.pageIds).toEqual([p1, p2]);
    a.reorderNode(p2, 0);
    expect(b.pageIds).toEqual([p2, p1]);
  });

  it('converges when both users insert into the same parent while disconnected', () => {
    const t = pair();
    t.goOffline();
    const ra = t.a.insertNode(createNodeProps('RECTANGLE', { name: 'From A' }), page(t.a));
    const rb = t.b.insertNode(createNodeProps('ELLIPSE', { name: 'From B' }), page(t.b));
    t.goOnline();
    expect(new Set(t.a.getChildIds(page(t.a)))).toEqual(new Set([ra, rb]));
    expect(t.a.getChildIds(page(t.a))).toEqual(t.b.getChildIds(page(t.b)));
    expect(t.a.toJSON()).toEqual(t.b.toJSON());
  });

  it('converges when one user edits a node another user deleted', () => {
    const t = pair();
    const r = t.a.insertNode(createNodeProps('RECTANGLE', { name: 'R' }), page(t.a));
    t.goOffline();
    t.a.removeNode(r);
    t.b.updateNode(r, { name: 'Edited' });
    t.goOnline();
    expect(t.a.hasNode(r)).toBe(t.b.hasNode(r));
    expect(t.a.toJSON()).toEqual(t.b.toJSON());
  });

  it('never writes derived (projected) instance children into the shared document', () => {
    const { a, da } = pair();
    const comp = a.insertNode(createNodeProps('COMPONENT', { name: 'Button' }), page(a));
    a.insertNode(createNodeProps('RECTANGLE', { name: 'Bg' }), comp);
    const inst = a.insertNode(
      createNodeProps('INSTANCE', { name: 'Button', componentId: comp }),
      page(a),
    );
    a.insertNode(createNodeProps('RECTANGLE', { name: 'Bg' }), inst, undefined, { derived: true });
    const nodes = da.getMap('nodes');
    expect(nodes.size).toBe(4); // page, component, bg, instance
    expect((nodes.get(inst) as { childIds: string[] }).childIds).toEqual([]);
  });

  it('rebuilds an identical document from the Y.Doc alone', () => {
    const { a, da } = pair();
    const f = a.insertNode(createNodeProps('FRAME', { name: 'F' }), page(a));
    a.insertNode(createNodeProps('TEXT', { name: 'T', characters: 'Hi' }), f);
    a.insertNode(createNodeProps('RECTANGLE', { name: 'R' }), f, 0);
    a.setName('Rebuilt');
    expect(graphFromYDoc(da).toJSON()).toEqual(a.toJSON());
  });

  it('round-trips updates through base64 for JSON transports', () => {
    const d = new Y.Doc();
    d.getMap('nodes').set('x', { a: 1 });
    const text = encodeUpdate(Y.encodeStateAsUpdate(d));
    const d2 = new Y.Doc();
    Y.applyUpdate(d2, decodeUpdate(text));
    expect(d2.getMap('nodes').get('x')).toEqual({ a: 1 });
  });

  it('resetting to a new shared state replaces the local graph content', () => {
    const { a, b, bb } = pair();
    const r = a.insertNode(createNodeProps('RECTANGLE', { name: 'R' }), page(a));
    expect(b.hasNode(r)).toBe(true);
    // Server restored an older version: a fresh doc without the rectangle.
    const fresh = new Y.Doc();
    populateYDoc(SceneGraph.fromJSON(SceneGraph.createEmpty('Shared').toJSON()), fresh);
    let replaced: Y.Doc | null = null;
    bb.onDocReplaced((d) => (replaced = d));
    bb.reset(Y.encodeStateAsUpdate(fresh));
    expect(b.hasNode(r)).toBe(false);
    expect(b.pageIds).toHaveLength(1);
    expect(replaced).toBe(bb.doc);
  });
});
