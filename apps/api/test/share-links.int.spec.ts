import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp, userClient, ORIGIN } from './helpers';
import type { Client } from './helpers';

describe('share links', () => {
  let app: INestApplication;
  let admin: Client;
  let viewer: Client & { id: string; email: string };
  let outsider: Client & { id: string; email: string };
  let docId: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    const ws = (await admin.get('/workspaces')).body[0];
    viewer = await userClient(app, admin, 'Vic');
    outsider = await userClient(app, admin, 'Oscar');
    await admin.post(`/workspaces/${ws.id}/members`, { email: viewer.email, role: 'VIEWER' });
    const project = (await admin.post(`/workspaces/${ws.id}/projects`, { name: 'P' })).body;
    docId = (await admin.post(`/projects/${project.id}/documents`, { name: 'Shared' })).body.id;
  });
  afterAll(() => app.close());

  it('editors create links; anyone with the token reads the document; viewers cannot create links', async () => {
    expect((await viewer.post(`/documents/${docId}/share-links`, { role: 'VIEWER' })).status).toBe(
      403,
    );
    const created = await admin.post(`/documents/${docId}/share-links`, { role: 'COMMENTER' });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(created.body.url).toContain(`/share/${created.body.token}`);

    // Anonymous read through the token, no cookie at all.
    const anon = await request(app.getHttpServer()).get(`/api/v1/share/${created.body.token}`);
    expect(anon.status).toBe(200);
    expect(anon.body).toMatchObject({ id: docId, name: 'Shared', role: 'COMMENTER' });
    expect(anon.body.content.pages).toHaveLength(1);

    // Exports work with the token as well, so previews and PNGs can be embedded elsewhere.
    const png = await request(app.getHttpServer()).get(
      `/api/v1/share/${created.body.token}/export.png?scale=1`,
    );
    expect(png.status).toBe(200);
    expect(png.headers['content-type']).toBe('image/png');

    // The token never grants writes.
    const doc = anon.body;
    const put = await request(app.getHttpServer())
      .put(`/api/v1/documents/${docId}/content`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${created.body.token}`)
      .send({ content: doc.content, baseRevision: doc.revision });
    expect(put.status).toBe(401);

    // Members list and revoke links; non-members get 404.
    const list = await admin.get(`/documents/${docId}/share-links`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].token).toBeUndefined(); // listing never re-exposes secrets
    expect((await outsider.get(`/documents/${docId}/share-links`)).status).toBe(404);
    expect((await admin.delete(`/share-links/${list.body[0].id}`)).status).toBe(204);
    expect(
      (await request(app.getHttpServer()).get(`/api/v1/share/${created.body.token}`)).status,
    ).toBe(404);
  });

  it('expired links are refused and the expiry is validated', async () => {
    const bad = await admin.post(`/documents/${docId}/share-links`, {
      role: 'VIEWER',
      expiresInHours: 0,
    });
    expect(bad.status).toBe(400);
    const created = await admin.post(`/documents/${docId}/share-links`, {
      role: 'VIEWER',
      expiresInHours: 1,
    });
    expect(created.status).toBe(201);
    // Force the expiry into the past directly in the database.
    const prisma = (await import('../src/prisma/prisma.service')).PrismaService;
    await app.get(prisma).shareToken.update({
      where: { id: created.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await request(app.getHttpServer()).get(`/api/v1/share/${created.body.token}`)).status,
    ).toBe(404);
  });
});
