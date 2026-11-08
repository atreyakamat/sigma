import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SceneGraph, createNodeProps } from '@sigma/document';
import type { NodeId } from '@sigma/shared';
import type { PresenceServerMessage } from '@sigma/validation';
import { Y, bindGraph, decodeUpdate, encodeUpdate, graphFromYDoc } from '@sigma/collab';
import { CollabRoomsService } from '../src/collaboration/collab-rooms.service';
import { PresenceGateway } from '../src/collaboration/presence.gateway';
import { adminClient, createApp, userClient, ORIGIN } from './helpers';
import type { Client } from './helpers';

type Sock = {
  ws: WebSocket;
  next: (type?: PresenceServerMessage['type']) => Promise<PresenceServerMessage>;
};

function connect(port: number, cookie: string): Promise<Sock> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/presence`, {
      headers: { cookie, origin: ORIGIN },
    });
    const queue: PresenceServerMessage[] = [];
    const waiters: { type?: string; resolve: (m: PresenceServerMessage) => void }[] = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as PresenceServerMessage;
      const i = waiters.findIndex((w) => !w.type || w.type === m.type);
      if (i >= 0) waiters.splice(i, 1)[0]!.resolve(m);
      else queue.push(m);
    });
    ws.on('open', () =>
      resolve({
        ws,
        next: (type) =>
          new Promise((r) => {
            const i = queue.findIndex((m) => !type || m.type === type);
            if (i >= 0) r(queue.splice(i, 1)[0]!);
            else waiters.push({ type, resolve: r });
          }),
      }),
    );
    ws.on('error', reject);
  });
}

/** A participant: a graph bound to a Y.Doc seeded from the server's sync, sending its updates. */
function participant(sock: Sock, state: string) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, decodeUpdate(state), 'server');
  const graph = graphFromYDoc(doc);
  const binding = bindGraph(graph, doc);
  doc.on('update', (u: Uint8Array, origin: unknown) => {
    if (origin === binding.origin)
      sock.ws.send(JSON.stringify({ type: 'update', update: encodeUpdate(u) }));
  });
  return { doc, graph, binding };
}

describe('realtime co-editing', () => {
  let app: INestApplication;
  let admin: Client;
  let editor: Client & { id: string; email: string };
  let viewer: Client & { id: string; email: string };
  let docId: string;
  let port: number;
  beforeAll(async () => {
    app = await createApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    app.get(PresenceGateway).attach();
    admin = await adminClient(app);
    const ws = (await admin.get('/workspaces')).body[0];
    editor = await userClient(app, admin, 'Eve');
    viewer = await userClient(app, admin, 'Vic');
    await admin.post(`/workspaces/${ws.id}/members`, { email: editor.email, role: 'EDITOR' });
    await admin.post(`/workspaces/${ws.id}/members`, { email: viewer.email, role: 'VIEWER' });
    const project = (await admin.post(`/workspaces/${ws.id}/projects`, { name: 'P' })).body;
    docId = (await admin.post(`/projects/${project.id}/documents`, { name: 'Live' })).body.id;
  });
  afterAll(() => app.close());

  it('syncs edits between participants, persists them with a new revision, and rejects viewer edits', async () => {
    const a = await connect(port, admin.cookie);
    const e = await connect(port, editor.cookie);
    a.ws.send(JSON.stringify({ type: 'join', documentId: docId }));
    e.ws.send(JSON.stringify({ type: 'join', documentId: docId }));
    const syncA = (await a.next('sync')) as Extract<PresenceServerMessage, { type: 'sync' }>;
    const syncE = (await e.next('sync')) as Extract<PresenceServerMessage, { type: 'sync' }>;
    expect(syncA.revision).toBe(0);
    expect(syncE.state).toBe(syncA.state);

    const pa = participant(a, syncA.state);
    const pe = participant(e, syncE.state);
    const page = pa.graph.pageIds[0] as NodeId;
    const rect = pa.graph.insertNode(createNodeProps('RECTANGLE', { name: 'Live rect' }), page);

    const upd = (await e.next('update')) as Extract<PresenceServerMessage, { type: 'update' }>;
    Y.applyUpdate(pe.doc, decodeUpdate(upd.update), 'remote');
    expect(pe.graph.getNode(rect)?.name).toBe('Live rect');

    // The editor edits it back; the admin sees it.
    pe.graph.updateNode(rect, { name: 'Renamed live' });
    const upd2 = (await a.next('update')) as Extract<PresenceServerMessage, { type: 'update' }>;
    Y.applyUpdate(pa.doc, decodeUpdate(upd2.update), 'remote');
    expect(pa.graph.getNode(rect)?.name).toBe('Renamed live');

    // Persisted after the debounce: both get `saved`, HTTP readers see the content.
    const saved = (await a.next('saved')) as Extract<PresenceServerMessage, { type: 'saved' }>;
    expect(saved.revision).toBeGreaterThanOrEqual(1);
    await app.get(CollabRoomsService).flush(docId);
    const stored = (await admin.get(`/documents/${docId}`)).body;
    expect(stored.revision).toBeGreaterThanOrEqual(1);
    const names = stored.content.pages[0].children.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Renamed live']);
    expect(stored.thumbnailUrl).toMatch(/^data:image\/png;base64,/);

    // Viewers receive state but cannot write.
    const v = await connect(port, viewer.cookie);
    v.ws.send(JSON.stringify({ type: 'join', documentId: docId }));
    const syncV = (await v.next('sync')) as Extract<PresenceServerMessage, { type: 'sync' }>;
    expect(
      graphFromYDoc(
        (() => {
          const d = new Y.Doc();
          Y.applyUpdate(d, decodeUpdate(syncV.state));
          return d;
        })(),
      ).getNode(rect)?.name,
    ).toBe('Renamed live');
    v.ws.send(JSON.stringify({ type: 'update', update: syncV.state }));
    const err = await v.next('error');
    expect(err).toMatchObject({ type: 'error', message: expect.stringContaining('role') });

    // Restoring over HTTP (e.g. a version restore) replaces the room: everyone gets a fresh sync.
    const fresh = SceneGraph.createEmpty('Live').toJSON();
    const current = (await admin.get(`/documents/${docId}`)).body.revision as number;
    const put = await admin.put(`/documents/${docId}/content`, {
      content: fresh,
      baseRevision: current,
    });
    expect(put.status).toBe(200);
    const resync = (await e.next('sync')) as Extract<PresenceServerMessage, { type: 'sync' }>;
    expect(resync.revision).toBe(current + 1);
    pe.binding.reset(decodeUpdate(resync.state));
    expect(pe.graph.hasNode(rect)).toBe(false);
    expect(pe.graph.pageIds).toHaveLength(1);

    for (const s of [a, e, v]) s.ws.close();
  });
});
