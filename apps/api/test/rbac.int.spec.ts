import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from './helpers';
import { adminClient, createApp, userClient } from './helpers';

type Named = Client & { id: string; email: string };

describe('workspace RBAC', () => {
  let app: INestApplication;
  let admin: Client;
  let owner: Named;
  let wsAdmin: Named;
  let editor: Named;
  let viewer: Named;
  let outsider: Named;
  let ws: { id: string };
  let project: { id: string };
  let doc: { id: string; revision: number };

  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    owner = await userClient(app, admin, 'Owen');
    wsAdmin = await userClient(app, admin, 'Ada');
    editor = await userClient(app, admin, 'Eli');
    viewer = await userClient(app, admin, 'Vera');
    outsider = await userClient(app, admin, 'Oscar');
    ws = (await owner.post('/workspaces', { name: 'Team' })).body;
    for (const [c, role] of [
      [wsAdmin, 'ADMIN'],
      [editor, 'EDITOR'],
      [viewer, 'VIEWER'],
    ] as const) {
      expect(
        (await owner.post(`/workspaces/${ws.id}/members`, { email: c.email, role })).status,
      ).toBe(201);
    }
    project = (await owner.post(`/workspaces/${ws.id}/projects`, { name: 'App' })).body;
    doc = (await owner.post(`/projects/${project.id}/documents`, { name: 'Home' })).body;
  });
  afterAll(() => app.close());

  it('reports each member role and hides the workspace from outsiders', async () => {
    expect((await viewer.get(`/workspaces/${ws.id}`)).body.role).toBe('VIEWER');
    expect((await editor.get(`/workspaces/${ws.id}`)).body.role).toBe('EDITOR');
    expect((await outsider.get(`/workspaces/${ws.id}`)).status).toBe(404);
    expect((await outsider.get(`/projects/${project.id}`)).status).toBe(404);
    expect((await outsider.get(`/documents/${doc.id}`)).status).toBe(404);
    expect((await outsider.get(`/workspaces/${ws.id}/members`)).status).toBe(404);
    const members = (await viewer.get(`/workspaces/${ws.id}/members`)).body as { role: string }[];
    expect(members.map((m) => m.role).sort()).toEqual(['ADMIN', 'EDITOR', 'OWNER', 'VIEWER']);
  });

  it('viewer: read only', async () => {
    expect((await viewer.get(`/projects/${project.id}/documents`)).status).toBe(200);
    expect((await viewer.get(`/documents/${doc.id}`)).body.role).toBe('VIEWER');
    expect((await viewer.post(`/workspaces/${ws.id}/projects`, { name: 'Nope' })).status).toBe(403);
    expect((await viewer.post(`/projects/${project.id}/documents`, { name: 'Nope' })).status).toBe(
      403,
    );
    expect((await viewer.patch(`/documents/${doc.id}`, { name: 'Nope' })).status).toBe(403);
    const current = (await viewer.get(`/documents/${doc.id}`)).body;
    expect(
      (
        await viewer.put(`/documents/${doc.id}/content`, {
          content: current.content,
          baseRevision: current.revision,
        })
      ).status,
    ).toBe(403);
    expect((await viewer.delete(`/documents/${doc.id}`)).status).toBe(403);
    expect((await viewer.patch(`/workspaces/${ws.id}`, { name: 'Nope' })).status).toBe(403);
    expect(
      (await viewer.post(`/workspaces/${ws.id}/members`, { email: outsider.email, role: 'VIEWER' }))
        .status,
    ).toBe(403);
  });

  it('editor: creates and edits content, cannot manage members or the workspace', async () => {
    const p = await editor.post(`/workspaces/${ws.id}/projects`, { name: 'Editor project' });
    expect(p.status).toBe(201);
    const d = await editor.post(`/projects/${p.body.id}/documents`, { name: 'Draft' });
    expect(d.status).toBe(201);
    expect((await editor.patch(`/documents/${d.body.id}`, { name: 'Draft 2' })).status).toBe(200);
    expect((await editor.delete(`/documents/${d.body.id}`)).status).toBe(204);
    expect((await editor.delete(`/projects/${p.body.id}`)).status).toBe(403);
    expect((await editor.patch(`/workspaces/${ws.id}`, { name: 'Nope' })).status).toBe(403);
    expect(
      (await editor.post(`/workspaces/${ws.id}/members`, { email: outsider.email, role: 'VIEWER' }))
        .status,
    ).toBe(403);
    expect((await editor.delete(`/workspaces/${ws.id}`)).status).toBe(403);
  });

  it('workspace admin: manages members (not admins) and projects, cannot delete the workspace', async () => {
    expect(
      (
        await wsAdmin.post(`/workspaces/${ws.id}/members`, {
          email: outsider.email,
          role: 'VIEWER',
        })
      ).status,
    ).toBe(201);
    expect(
      (await wsAdmin.patch(`/workspaces/${ws.id}/members/${outsider.id}`, { role: 'EDITOR' }))
        .status,
    ).toBe(200);
    expect(
      (await wsAdmin.patch(`/workspaces/${ws.id}/members/${outsider.id}`, { role: 'ADMIN' }))
        .status,
    ).toBe(403);
    expect((await wsAdmin.delete(`/workspaces/${ws.id}/members/${outsider.id}`)).status).toBe(204);
    expect(
      (await wsAdmin.patch(`/workspaces/${ws.id}/members/${owner.id}`, { role: 'VIEWER' })).status,
    ).toBe(400);
    expect((await wsAdmin.delete(`/workspaces/${ws.id}/members/${owner.id}`)).status).toBe(400);
    expect((await wsAdmin.patch(`/workspaces/${ws.id}`, { name: 'Team Renamed' })).status).toBe(
      200,
    );
    const p = (await wsAdmin.post(`/workspaces/${ws.id}/projects`, { name: 'Temp' })).body;
    expect((await wsAdmin.delete(`/projects/${p.id}`)).status).toBe(204);
    expect((await wsAdmin.delete(`/workspaces/${ws.id}`)).status).toBe(403);
  });

  it('owner: full control; members can leave', async () => {
    expect(
      (await owner.post(`/workspaces/${ws.id}/members`, { email: outsider.email, role: 'ADMIN' }))
        .status,
    ).toBe(201);
    expect((await outsider.delete(`/workspaces/${ws.id}/members/${outsider.id}`)).status).toBe(204);
    expect((await outsider.get(`/workspaces/${ws.id}`)).status).toBe(404);
    expect(
      (
        await owner.post(`/workspaces/${ws.id}/members`, {
          email: 'ghost@sigma.local',
          role: 'VIEWER',
        })
      ).status,
    ).toBe(404);
    expect(
      (await owner.post(`/workspaces/${ws.id}/members`, { email: viewer.email, role: 'VIEWER' }))
        .status,
    ).toBe(409);
  });

  it('system admin sees all workspaces but still needs membership to edit', async () => {
    const all = (await admin.get('/workspaces?all=true')).body as { id: string }[];
    expect(all.some((w) => w.id === ws.id)).toBe(true);
    expect((await admin.get(`/workspaces/${ws.id}`)).status).toBe(200);
    expect((await admin.get(`/documents/${doc.id}`)).status).toBe(404);
    expect((await admin.post(`/workspaces/${ws.id}/projects`, { name: 'Nope' })).status).toBe(404);
  });

  it('owner can delete the workspace, cascading projects and documents', async () => {
    expect((await owner.delete(`/workspaces/${ws.id}`)).status).toBe(204);
    expect((await owner.get(`/documents/${doc.id}`)).status).toBe(404);
    expect((await editor.get(`/workspaces/${ws.id}`)).status).toBe(404);
  });
});
