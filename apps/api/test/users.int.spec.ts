import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp, userClient } from './helpers';

describe('users administration', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('only system admins can manage users', async () => {
    const admin = await adminClient(app);
    const member = await userClient(app, admin, 'Mia');
    expect((await member.get('/users')).status).toBe(403);
    expect((await member.post('/users', { name: 'X', email: 'x@sigma.local' })).status).toBe(403);
    expect((await admin.get('/users')).body).toHaveLength(2);
  });

  it('creates users with generated or supplied passwords, resets and updates them', async () => {
    const admin = await adminClient(app);
    const dup = await admin.post('/users', { name: 'Mia', email: 'mia@sigma.local' });
    expect(dup.status).toBe(409);
    const bad = await admin.post('/users', {
      name: 'Bad',
      email: 'bad@sigma.local',
      password: 'short',
      extra: 1,
    });
    expect(bad.status).toBe(400);

    const created = await admin.post('/users', {
      name: 'Sam',
      email: 'SAM@Sigma.local',
      systemRole: 'MEMBER',
    });
    expect(created.status).toBe(201);
    expect(created.body.user.email).toBe('sam@sigma.local');
    const id = created.body.user.id as string;

    const reset = await admin.post(`/users/${id}/reset-password`);
    expect(reset.status).toBe(201);
    expect(reset.body.temporaryPassword).not.toBe(created.body.temporaryPassword);
    expect((await admin.get(`/users/${id}`)).body.mustChangePassword).toBe(true);

    const promoted = await admin.patch(`/users/${id}`, { systemRole: 'ADMIN', name: 'Samuel' });
    expect(promoted.body).toMatchObject({ systemRole: 'ADMIN', name: 'Samuel' });
    expect((await admin.patch(`/users/${id}`, { systemRole: 'MEMBER' })).status).toBe(200);
  });

  it('protects the last administrator and the actor', async () => {
    const admin = await adminClient(app);
    const me = (await admin.get('/auth/me')).body.user.id as string;
    expect((await admin.patch(`/users/${me}`, { systemRole: 'MEMBER' })).status).toBe(400);
    expect((await admin.patch(`/users/${me}`, { active: false })).status).toBe(400);
    expect((await admin.delete(`/users/${me}`)).status).toBe(400);
  });

  it('deleting a workspace owner transfers ownership to an admin member or deletes the workspace', async () => {
    const admin = await adminClient(app);
    const owner = await userClient(app, admin, 'Olly');
    const heir = await userClient(app, admin, 'Hana');
    const ws = (await owner.post('/workspaces', { name: 'Olly space' })).body;
    expect(
      (await owner.post(`/workspaces/${ws.id}/members`, { email: heir.email, role: 'ADMIN' }))
        .status,
    ).toBe(201);
    const lonely = (await owner.post('/workspaces', { name: 'Lonely' })).body;

    expect((await admin.delete(`/users/${owner.id}`)).status).toBe(204);
    const heirWorkspaces = (await heir.get('/workspaces')).body as { id: string; role: string }[];
    expect(heirWorkspaces.find((w) => w.id === ws.id)?.role).toBe('OWNER');
    expect((await admin.get(`/workspaces/${lonely.id}`)).status).toBe(404);
    expect((await owner.get('/auth/me')).status).toBe(401);
  });
});
