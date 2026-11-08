import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp } from './helpers';
import type { Client } from './helpers';

describe('documents', () => {
  let app: INestApplication;
  let admin: Client;
  let projectId: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    const ws = (await admin.get('/workspaces')).body[0];
    projectId = (await admin.post(`/workspaces/${ws.id}/projects`, { name: 'P' })).body.id;
  });
  afterAll(() => app.close());

  it('creates an empty document with a valid schema and lists summaries without content', async () => {
    const created = await admin.post(`/projects/${projectId}/documents`, { name: 'Landing' });
    expect(created.status).toBe(201);
    expect(created.body.content).toMatchObject({
      schemaVersion: 1,
      name: 'Landing',
      pages: [{ type: 'PAGE', name: 'Page 1', children: [] }],
    });
    expect(created.body.content.id).toBe(created.body.id);
    expect(created.body).toMatchObject({ revision: 0, nodeCount: 1, role: 'OWNER' });
    const list = await admin.get(`/projects/${projectId}/documents`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].content).toBeUndefined();
  });

  it('saves content with optimistic concurrency and validates the schema', async () => {
    const d = (await admin.post(`/projects/${projectId}/documents`, { name: 'Doc' })).body;
    const content = {
      ...d.content,
      pages: [
        {
          ...d.content.pages[0],
          children: [{ id: 'r1', type: 'RECTANGLE', name: 'R', size: { width: 10, height: 10 } }],
        },
      ],
    };
    const save = await admin.put(`/documents/${d.id}/content`, {
      content,
      baseRevision: 0,
      thumbnail: 'data:image/png;base64,AAAA',
    });
    expect(save.status).toBe(200);
    expect(save.body.revision).toBe(1);
    const stale = await admin.put(`/documents/${d.id}/content`, { content, baseRevision: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.revision).toBe(1);
    const invalid = await admin.put(`/documents/${d.id}/content`, {
      content: { ...content, pages: [] },
      baseRevision: 1,
    });
    expect(invalid.status).toBe(400);
    const unknownKey = await admin.put(`/documents/${d.id}/content`, {
      content: { ...content, bogus: true },
      baseRevision: 1,
    });
    expect(unknownKey.status).toBe(400);
    const got = await admin.get(`/documents/${d.id}`);
    expect(got.body).toMatchObject({
      revision: 1,
      nodeCount: 2,
      thumbnailUrl: 'data:image/png;base64,AAAA',
    });
    expect(got.body.content.pages[0].children[0].style.opacity).toBe(1); // defaults applied
  });

  it('renames (also inside content), soft-deletes and hides deleted documents', async () => {
    const d = (await admin.post(`/projects/${projectId}/documents`, { name: 'Old' })).body;
    const renamed = await admin.patch(`/documents/${d.id}`, { name: 'New' });
    expect(renamed.body.name).toBe('New');
    expect((await admin.get(`/documents/${d.id}`)).body.content.name).toBe('New');
    expect((await admin.delete(`/documents/${d.id}`)).status).toBe(204);
    expect((await admin.get(`/documents/${d.id}`)).status).toBe(404);
    expect(
      (await admin.put(`/documents/${d.id}/content`, { content: d.content, baseRevision: 0 }))
        .status,
    ).toBe(404);
    const list = (await admin.get(`/projects/${projectId}/documents`)).body as { id: string }[];
    expect(list.some((x) => x.id === d.id)).toBe(false);
  });

  it('accepts imported content and rejects malformed ids', async () => {
    const d = (await admin.post(`/projects/${projectId}/documents`, { name: 'Src' })).body;
    const imported = await admin.post(`/projects/${projectId}/documents`, {
      name: 'Copy',
      content: d.content,
    });
    expect(imported.status).toBe(201);
    expect(imported.body.content.id).toBe(imported.body.id);
    expect((await admin.get('/documents/not-a-uuid')).status).toBe(400);
  });
});
