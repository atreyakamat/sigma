import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, Client, ORIGIN, adminClient, createApp } from './helpers';

describe('auth', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('bootstraps an admin and a default workspace', async () => {
    const admin = await adminClient(app);
    const me = await admin.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({
      email: ADMIN.email,
      systemRole: 'ADMIN',
      mustChangePassword: false,
      name: 'Root Admin',
    });
    const ws = await admin.get('/workspaces');
    expect(ws.body).toHaveLength(1);
    expect(ws.body[0]).toMatchObject({ name: 'Workspace', slug: 'workspace', role: 'OWNER' });
  });

  it('rejects bad credentials, unknown users and unauthenticated access', async () => {
    const c = new Client(app);
    expect((await c.get('/health')).status).toBe(200);
    expect((await c.login(ADMIN.email, 'wrong')).status).toBe(401);
    expect((await c.login('nobody@sigma.local', 'whatever-123')).status).toBe(401);
    expect((await c.get('/auth/me')).status).toBe(401);
    expect((await c.get('/workspaces')).status).toBe(401);
    expect((await new Client(app).login('not-an-email', 'x')).status).toBe(400);
  });

  it('logout invalidates the session cookie', async () => {
    const admin = await adminClient(app);
    expect((await admin.post('/auth/logout')).status).toBe(204);
    expect((await admin.get('/auth/me')).status).toBe(401);
  });

  it('rejects state-changing requests without a matching Origin (CSRF)', async () => {
    const admin = await adminClient(app);
    const noOrigin = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', admin.cookie)
      .send({ name: 'X' });
    expect(noOrigin.status).toBe(403);
    const evil = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Cookie', admin.cookie)
      .set('Origin', 'https://evil.example')
      .send({ name: 'X' });
    expect(evil.status).toBe(403);
    const ok = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Cookie', admin.cookie);
    expect(ok.status).toBe(200);
    void ORIGIN;
  });

  it('change-password requires the current password and clears mustChangePassword', async () => {
    const admin = await adminClient(app);
    const created = await admin.post('/users', { name: 'Pat', email: 'pat@sigma.local' });
    expect(created.status).toBe(201);
    const temp = created.body.temporaryPassword as string;
    expect(temp).toHaveLength(16);
    expect(created.body.user.mustChangePassword).toBe(true);

    const pat = new Client(app);
    expect((await pat.login('pat@sigma.local', temp)).status).toBe(200);
    expect(
      (
        await pat.post('/auth/change-password', {
          currentPassword: 'nope',
          newPassword: 'a-brand-new-password',
        })
      ).status,
    ).toBe(401);
    expect(
      (await pat.post('/auth/change-password', { currentPassword: temp, newPassword: 'short' }))
        .status,
    ).toBe(400);
    expect(
      (
        await pat.post('/auth/change-password', {
          currentPassword: temp,
          newPassword: 'a-brand-new-password',
        })
      ).status,
    ).toBe(204);
    expect((await pat.get('/auth/me')).body.user.mustChangePassword).toBe(false);
    const again = new Client(app);
    expect((await again.login('pat@sigma.local', temp)).status).toBe(401);
    expect((await again.login('pat@sigma.local', 'a-brand-new-password')).status).toBe(200);
  });

  it('deactivated users cannot log in and lose their sessions', async () => {
    const admin = await adminClient(app);
    const created = await admin.post('/users', {
      name: 'Dee',
      email: 'dee@sigma.local',
      password: 'dee-password-123',
    });
    const dee = new Client(app);
    expect((await dee.login('dee@sigma.local', 'dee-password-123')).status).toBe(200);
    expect((await admin.patch(`/users/${created.body.user.id}`, { active: false })).status).toBe(
      200,
    );
    expect((await dee.get('/auth/me')).status).toBe(401);
    expect((await new Client(app).login('dee@sigma.local', 'dee-password-123')).status).toBe(403);
  });
});
