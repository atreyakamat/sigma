import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp, userClient } from './helpers';
import type { Client } from './helpers';

describe('versions, exports, API tokens and frame locks', () => {
  let app: INestApplication;
  let admin: Client;
  let docId: string;
  let content: Record<string, unknown>;
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    const ws = (await admin.get('/workspaces')).body[0];
    const project = (await admin.post(`/workspaces/${ws.id}/projects`, { name: 'P' })).body;
    const doc = (await admin.post(`/projects/${project.id}/documents`, { name: 'Handoff' })).body;
    docId = doc.id;
    content = {
      ...doc.content,
      pages: [
        {
          ...doc.content.pages[0],
          children: [
            {
              id: 'frame-1',
              type: 'FRAME',
              name: 'Home',
              size: { width: 200, height: 100 },
              metadata: {
                review: {
                  state: 'APPROVED',
                  byId: 'x',
                  byName: 'Admin',
                  at: '2026-01-01T00:00:00Z',
                },
              },
              style: { fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] },
              children: [
                {
                  id: 'btn',
                  type: 'RECTANGLE',
                  name: 'Primary button',
                  transform: { x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 },
                  size: { width: 80, height: 30 },
                  style: {
                    fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.4, b: 1, a: 1 } }],
                    cornerRadius: 6,
                  },
                },
                {
                  id: 'txt',
                  type: 'TEXT',
                  name: 'Title',
                  characters: 'Hello',
                  textStyle: { fontSize: 24, fontWeight: 700 },
                  size: { width: 100, height: 30 },
                },
              ],
            },
            {
              id: 'frame-2',
              type: 'FRAME',
              name: 'Draft',
              size: { width: 50, height: 50 },
              children: [],
            },
          ],
        },
      ],
    };
    expect(
      (await admin.put(`/documents/${docId}/content`, { content, baseRevision: 0 })).status,
    ).toBe(200);
  });
  afterAll(() => app.close());

  it('creates, lists, reads and restores versions; saves create hourly automatic versions', async () => {
    let list = (await admin.get(`/documents/${docId}/versions`)).body as {
      automatic: boolean;
      label: string | null;
    }[];
    expect(list.filter((v) => v.automatic)).toHaveLength(1); // first save created an automatic checkpoint
    const created = await admin.post(`/documents/${docId}/versions`, { label: 'v1 approved' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      label: 'v1 approved',
      automatic: false,
      revision: 1,
      nodeCount: 5,
    });
    const full = await admin.get(`/documents/${docId}/versions/${created.body.id}`);
    expect(full.body.content.pages[0].children).toHaveLength(2);

    const edited = {
      ...content,
      pages: [{ ...(content.pages as { children: unknown[] }[])[0], children: [] }],
    };
    expect(
      (await admin.put(`/documents/${docId}/content`, { content: edited, baseRevision: 1 })).status,
    ).toBe(200);
    expect((await admin.get(`/documents/${docId}`)).body.nodeCount).toBe(1);

    const restored = await admin.post(`/documents/${docId}/versions/${created.body.id}/restore`);
    expect(restored.status).toBe(201);
    expect(restored.body.revision).toBe(3);
    const after = (await admin.get(`/documents/${docId}`)).body;
    expect(after.nodeCount).toBe(5);
    expect(after.revision).toBe(3);
    list = (await admin.get(`/documents/${docId}/versions`)).body;
    expect(list.some((v) => v.label?.startsWith('Before restoring'))).toBe(true);
    expect((await admin.post(`/documents/${docId}/versions`, { label: '' })).status).toBe(400);
  });

  it('renders SVG and PNG server-side and exports design tokens', async () => {
    const svg = await request(app.getHttpServer())
      .get(`/api/v1/documents/${docId}/export.svg?frame=frame-1`)
      .set('Cookie', admin.cookie)
      .buffer(true)
      .parse((res, cb) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => (text += c));
        res.on('end', () => cb(null, text));
      });
    expect(svg.status).toBe(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.body as string).toContain('<svg');
    expect(svg.body as string).toContain('Hello');
    const png = await request(app.getHttpServer())
      .get(`/api/v1/documents/${docId}/export.png?frame=frame-1&scale=2`)
      .set('Cookie', admin.cookie)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');
    expect((png.body as Buffer).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect((png.body as Buffer).length).toBeGreaterThan(200);
    expect((await admin.get(`/documents/${docId}/export.svg?frame=nope`)).status).toBe(404);
    expect((await admin.get(`/documents/${docId}/export.png?scale=99`)).status).toBe(400);

    const tokens = await admin.get(`/documents/${docId}/tokens.json`);
    expect(tokens.body.colors.some((c: { name: string }) => c.name === 'primary-button')).toBe(
      true,
    );
    expect(tokens.body.typography[0]).toMatchObject({ name: 'title', fontSize: 24 });
    const css = await admin.get(`/documents/${docId}/tokens.css`);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.text ?? String(css.body)).toContain('--color-primary-button');
    const frames = await admin.get(`/documents/${docId}/frames?approved=true`);
    expect(frames.body).toHaveLength(1);
    expect(frames.body[0]).toMatchObject({ id: 'frame-1', name: 'Home' });
    expect((await admin.get(`/documents/${docId}/frames`)).body).toHaveLength(2);
  });

  it('personal API tokens authenticate without cookies or Origin and can be revoked', async () => {
    const created = await admin.post('/auth/tokens', { name: 'CI export', expiresInDays: 30 });
    expect(created.status).toBe(201);
    const secret = created.body.secret as string;
    expect(secret.startsWith('sgm_')).toBe(true);
    expect(created.body.token.prefix).toBe(secret.slice(0, 10));
    const server = app.getHttpServer();
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${secret}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('admin@sigma.local');
    // Mutations with a bearer token skip the CSRF origin check.
    const ver = await request(server)
      .post(`/api/v1/documents/${docId}/versions`)
      .set('Authorization', `Bearer ${secret}`)
      .send({ label: 'from CI' });
    expect(ver.status).toBe(201);
    expect(
      (await request(server).get('/api/v1/auth/me').set('Authorization', 'Bearer sgm_nope')).status,
    ).toBe(401);
    const list = (await admin.get('/auth/tokens')).body as {
      id: string;
      lastUsedAt: string | null;
    }[];
    expect(list).toHaveLength(1);
    expect(list[0]?.lastUsedAt).not.toBeNull();
    expect((await admin.delete(`/auth/tokens/${list[0]?.id}`)).status).toBe(204);
    expect(
      (await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${secret}`))
        .status,
    ).toBe(401);
    const other = await userClient(app, admin, 'Tina');
    const t2 = await other.post('/auth/tokens', { name: 'mine' });
    expect((await admin.delete(`/auth/tokens/${t2.body.token.id}`)).status).toBe(404); // not yours
  });

  it('frame locks held by another user block changes to that frame until they expire', async () => {
    const ws = (await admin.get('/workspaces')).body[0];
    const editor = await userClient(app, admin, 'Ed');
    expect(
      (await admin.post(`/workspaces/${ws.id}/members`, { email: editor.email, role: 'EDITOR' }))
        .status,
    ).toBe(201);
    const me = (await admin.get('/auth/me')).body.user;
    const current = (await admin.get(`/documents/${docId}`)).body;
    const until = new Date(Date.now() + 3600_000).toISOString();
    const lockFrame = (
      doc: typeof current.content,
      patch: (f: Record<string, unknown>) => Record<string, unknown>,
    ) => ({
      ...doc,
      pages: [
        {
          ...doc.pages[0],
          children: doc.pages[0].children.map((c: Record<string, unknown>) =>
            c.id === 'frame-1' ? patch(c) : c,
          ),
        },
      ],
    });
    const locked = lockFrame(current.content, (f) => ({
      ...f,
      metadata: { ...(f.metadata as object), lock: { userId: me.id, name: me.name, until } },
    }));
    expect(
      (
        await admin.put(`/documents/${docId}/content`, {
          content: locked,
          baseRevision: current.revision,
        })
      ).status,
    ).toBe(200);

    const theirs = (await editor.get(`/documents/${docId}`)).body;
    const moved = lockFrame(theirs.content, (f) => ({ ...f, name: 'Home renamed' }));
    const blocked = await editor.put(`/documents/${docId}/content`, {
      content: moved,
      baseRevision: theirs.revision,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('locked by');
    expect(blocked.body.lockedBy.userId).toBe(me.id);
    // Removing the lock is also a change to the locked frame → blocked.
    const unlocked = lockFrame(theirs.content, (f) => ({ ...f, metadata: {} }));
    expect(
      (
        await editor.put(`/documents/${docId}/content`, {
          content: unlocked,
          baseRevision: theirs.revision,
        })
      ).status,
    ).toBe(409);
    // Editing something else is fine.
    const elsewhere = {
      ...theirs.content,
      pages: [
        {
          ...theirs.content.pages[0],
          children: theirs.content.pages[0].children.map((c: { id: string; name: string }) =>
            c.id === 'frame-2' ? { ...c, name: 'Draft 2' } : c,
          ),
        },
      ],
    };
    const ok = await editor.put(`/documents/${docId}/content`, {
      content: elsewhere,
      baseRevision: theirs.revision,
    });
    expect(ok.body).toEqual(expect.objectContaining({ revision: theirs.revision + 1 }));
    // The lock holder can edit and unlock.
    const mine = (await admin.get(`/documents/${docId}`)).body;
    expect(
      (
        await admin.put(`/documents/${docId}/content`, {
          content: lockFrame(mine.content, (f) => ({ ...f, metadata: {} })),
          baseRevision: mine.revision,
        })
      ).status,
    ).toBe(200);
  });
});
