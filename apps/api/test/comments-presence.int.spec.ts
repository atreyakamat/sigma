import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PresenceServerMessage } from '@sigma/validation';
import { PresenceGateway } from '../src/collaboration/presence.gateway';
import { adminClient, createApp, userClient, ORIGIN } from './helpers';
import type { Client } from './helpers';

function connect(
  port: number,
  cookie: string,
  origin = ORIGIN,
): Promise<{ ws: WebSocket; next: () => Promise<PresenceServerMessage> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/presence`, {
      headers: { cookie, origin },
    });
    const queue: PresenceServerMessage[] = [];
    const waiters: ((m: PresenceServerMessage) => void)[] = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()) as PresenceServerMessage;
      const w = waiters.shift();
      if (w) w(m);
      else queue.push(m);
    });
    ws.on('open', () =>
      resolve({
        ws,
        next: () =>
          queue.length
            ? Promise.resolve(queue.shift() as PresenceServerMessage)
            : new Promise((r) => waiters.push(r)),
      }),
    );
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`ws ${res.statusCode}`)));
  });
}

describe('comments and presence', () => {
  let app: INestApplication;
  let admin: Client;
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
    viewer = await userClient(app, admin, 'Vic');
    await admin.post(`/workspaces/${ws.id}/members`, { email: viewer.email, role: 'VIEWER' });
    const project = (await admin.post(`/workspaces/${ws.id}/projects`, { name: 'P' })).body;
    docId = (await admin.post(`/projects/${project.id}/documents`, { name: 'D' })).body.id;
  });
  afterAll(() => app.close());

  it('viewers can comment and reply; only authors edit; editors resolve and delete', async () => {
    const pageId = (await admin.get(`/documents/${docId}`)).body.content.pages[0].id as string;
    const t = await viewer.post(`/documents/${docId}/comments`, {
      content: 'Looks off here',
      anchor: { pageId, nodeId: null, x: 10, y: 20 },
    });
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({ userName: 'Vic', anchor: { x: 10, y: 20 }, resolved: false });
    const r = await admin.post(`/documents/${docId}/comments`, {
      content: 'Fixed',
      parentId: t.body.id,
    });
    expect(r.status).toBe(201);
    const threads = (await viewer.get(`/documents/${docId}/comments`)).body;
    expect(threads).toHaveLength(1);
    expect(threads[0].replies).toHaveLength(1);
    expect((await admin.patch(`/comments/${t.body.id}`, { content: 'nope' })).status).toBe(403);
    expect((await viewer.patch(`/comments/${r.body.id}`, { resolved: true })).status).toBe(403);
    expect((await admin.patch(`/comments/${t.body.id}`, { resolved: true })).status).toBe(200);
    expect(
      (await viewer.patch(`/comments/${t.body.id}`, { content: 'Looks off here (edited)' })).body
        .content,
    ).toContain('edited');
    expect((await viewer.delete(`/comments/${r.body.id}`)).status).toBe(403);
    expect((await admin.delete(`/comments/${t.body.id}`)).status).toBe(204);
    expect((await admin.get(`/documents/${docId}/comments`)).body).toHaveLength(0);
    expect(
      (
        await viewer.post(`/documents/${docId}/comments`, {
          content: '',
          anchor: { pageId, x: 0, y: 0 },
        })
      ).status,
    ).toBe(400);
  });

  it('presence: join, awareness broadcast, saved notifications, auth and access checks', async () => {
    await expect(connect(port, 'sigma_session=bogus')).rejects.toThrow(/401/);
    await expect(connect(port, admin.cookie, 'https://evil.example')).rejects.toThrow(/401/);

    const a = await connect(port, admin.cookie);
    const v = await connect(port, viewer.cookie);
    a.ws.send(JSON.stringify({ type: 'join', documentId: docId }));
    expect(await a.next()).toMatchObject({ type: 'presence', users: [] });
    v.ws.send(JSON.stringify({ type: 'join', documentId: docId }));
    const vp = await v.next();
    expect(vp.type).toBe('presence');
    expect((vp as { users: { name: string }[] }).users.map((u) => u.name)).toEqual(['Root Admin']);
    expect(await a.next()).toMatchObject({ type: 'awareness', user: { name: 'Vic' } });

    v.ws.send(
      JSON.stringify({ type: 'awareness', pageId: 'p', cursor: { x: 1, y: 2 }, selection: ['n1'] }),
    );
    expect(await a.next()).toMatchObject({
      type: 'awareness',
      user: { name: 'Vic', cursor: { x: 1, y: 2 }, selection: ['n1'] },
    });

    const doc = (await admin.get(`/documents/${docId}`)).body;
    expect(
      (
        await admin.put(`/documents/${docId}/content`, {
          content: doc.content,
          baseRevision: doc.revision,
        })
      ).status,
    ).toBe(200);
    expect(await v.next()).toMatchObject({ type: 'saved', revision: 1, userName: 'Root Admin' });
    expect(await a.next()).toMatchObject({ type: 'saved', revision: 1 }); // the saver sees it too and ignores its own id
    expect(app.get(PresenceGateway).usersIn(docId)).toHaveLength(2);

    v.ws.close();
    expect(await a.next()).toMatchObject({ type: 'leave', userId: viewer.id });

    // A member of nothing cannot join.
    const outsider = await userClient(app, admin, 'Out');
    const o = await connect(port, outsider.cookie);
    o.ws.send(JSON.stringify({ type: 'join', documentId: docId }));
    expect(await o.next()).toMatchObject({ type: 'error' });
    o.ws.close();
    a.ws.close();
  });
});
