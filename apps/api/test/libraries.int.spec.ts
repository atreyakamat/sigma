import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp, userClient } from './helpers';
import type { Client } from './helpers';

describe('component libraries', () => {
  let app: INestApplication;
  let admin: Client;
  let wsId: string;
  let docId: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    wsId = (await admin.get('/workspaces')).body[0].id;
    const project = (await admin.post(`/workspaces/${wsId}/projects`, { name: 'DS' })).body;
    const doc = (await admin.post(`/projects/${project.id}/documents`, { name: 'Design system' }))
      .body;
    docId = doc.id;
    const content = {
      ...doc.content,
      pages: [
        {
          ...doc.content.pages[0],
          children: [
            {
              id: 'btn',
              type: 'COMPONENT',
              name: 'Button',
              description: 'Primary action',
              size: { width: 100, height: 40 },
              children: [
                { id: 'bg', type: 'RECTANGLE', name: 'bg', size: { width: 100, height: 40 } },
              ],
            },
            {
              id: 'plain',
              type: 'FRAME',
              name: 'Not a component',
              size: { width: 10, height: 10 },
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

  it('publishes components, lists them per workspace, bumps versions and serves content', async () => {
    const published = await admin.post(`/documents/${docId}/library/publish`, {
      componentIds: ['btn'],
    });
    expect(published.status).toBe(201);
    expect(published.body[0]).toMatchObject({
      name: 'Button',
      description: 'Primary action',
      version: 1,
      componentId: 'btn',
      documentId: docId,
    });
    const again = await admin.post(`/documents/${docId}/library/publish`, {
      componentIds: ['btn'],
    });
    expect(again.body[0].version).toBe(2);
    const list = (await admin.get(`/workspaces/${wsId}/library`)).body;
    expect(list).toHaveLength(1);
    const full = await admin.get(`/library/${list[0].id}`);
    expect(full.body.content).toMatchObject({
      type: 'COMPONENT',
      children: [{ type: 'RECTANGLE' }],
    });
    expect(
      (await admin.post(`/documents/${docId}/library/publish`, { componentIds: ['plain'] })).status,
    ).toBe(400);
    expect(
      (await admin.post(`/documents/${docId}/library/publish`, { componentIds: [] })).status,
    ).toBe(400);
  });

  it('viewers can read the library but not publish; outsiders see nothing', async () => {
    const viewer = await userClient(app, admin, 'Val');
    await admin.post(`/workspaces/${wsId}/members`, { email: viewer.email, role: 'VIEWER' });
    expect((await viewer.get(`/workspaces/${wsId}/library`)).status).toBe(200);
    expect(
      (await viewer.post(`/documents/${docId}/library/publish`, { componentIds: ['btn'] })).status,
    ).toBe(403);
    const outsider = await userClient(app, admin, 'Ollie');
    expect((await outsider.get(`/workspaces/${wsId}/library`)).status).toBe(404);
    const id = (await admin.get(`/workspaces/${wsId}/library`)).body[0].id;
    expect((await outsider.get(`/library/${id}`)).status).toBe(404);
    expect((await admin.delete(`/library/${id}`)).status).toBe(204);
    expect((await admin.get(`/workspaces/${wsId}/library`)).body).toHaveLength(0);
  });
});
