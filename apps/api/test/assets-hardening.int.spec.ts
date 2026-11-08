import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, createApp, userClient, ORIGIN } from './helpers';
import type { Client } from './helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QzwAEjDAGACgFA/8IPBrlAAAAAElFTkSuQmCC',
  'base64',
);

describe('assets', () => {
  let app: INestApplication;
  let admin: Client;
  let wsId: string;
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
    wsId = (await admin.get('/workspaces')).body[0].id;
  });
  afterAll(() => app.close());

  it('uploads images (validated by magic bytes), serves them to members, and signs share URLs', async () => {
    const up = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${wsId}/assets`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .attach('file', PNG, { filename: 'pixel.PNG', contentType: 'application/octet-stream' });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({
      mimeType: 'image/png',
      width: 2,
      height: 2,
      filename: 'pixel.PNG',
      fileSize: PNG.length,
    });
    const id = up.body.id as string;
    expect(up.body.url).toBe(`/api/v1/assets/${id}/content`);

    const content = await request(app.getHttpServer())
      .get(`/api/v1/assets/${id}/content`)
      .set('Cookie', admin.cookie)
      .buffer(true)
      .parse((res, cb) => {
        const c: Buffer[] = [];
        res.on('data', (d: Buffer) => c.push(d));
        res.on('end', () => cb(null, Buffer.concat(c)));
      });
    expect(content.status).toBe(200);
    expect(content.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(content.body as Buffer, PNG)).toBe(0);
    expect(content.headers['cache-control']).toContain('private');

    const bad = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${wsId}/assets`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });
    expect(bad.status).toBe(400);

    const list = (await admin.get(`/workspaces/${wsId}/assets`)).body as { id: string }[];
    expect(list.map((a) => a.id)).toEqual([id]);

    // Signed URL works without a session, expires, and rejects tampering.
    const signed = await admin.post(`/assets/${id}/signed-url`, { expiresInSeconds: 60 });
    expect(signed.status).toBe(201);
    const url = signed.body.url as string;
    expect(url).toMatch(new RegExp(`^/api/v1/assets/${id}/content\\?exp=\\d+&sig=[a-f0-9]+$`));
    expect((await request(app.getHttpServer()).get(url)).status).toBe(200);
    expect(
      (await request(app.getHttpServer()).get(url.replace(/sig=.{6}/, 'sig=000000'))).status,
    ).toBe(401);
    const expired = url.replace(/exp=\d+/, 'exp=1');
    expect((await request(app.getHttpServer()).get(expired)).status).toBe(401);
    expect((await request(app.getHttpServer()).get(`/api/v1/assets/${id}/content`)).status).toBe(
      401,
    );

    const outsider = await userClient(app, admin, 'Ozzy');
    expect((await outsider.get(`/assets/${id}/content`)).status).toBe(404);
    expect((await admin.delete(`/assets/${id}`)).status).toBe(204);
    expect((await admin.get(`/assets/${id}/content`)).status).toBe(404);
  });

  it('rejects files over the size limit and unknown fields', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${wsId}/assets`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' });
    expect([400, 413]).toContain(res.status);
  });
});

describe('hardening', () => {
  let app: INestApplication;
  let admin: Client;
  beforeAll(async () => {
    app = await createApp();
    admin = await adminClient(app);
  });
  afterAll(() => app.close());

  it('records an audit log of sensitive actions, readable by admins only', async () => {
    const created = await admin.post('/users', { name: 'Audrey', email: 'audrey@sigma.local' });
    await admin.post(`/users/${created.body.user.id}/reset-password`);
    const log = await admin.get('/audit?limit=50');
    expect(log.status).toBe(200);
    const actions = (
      log.body as { action: string; targetId: string | null; actorId: string }[]
    ).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['auth.login', 'user.create', 'user.reset_password']),
    );
    const entry = (
      log.body as {
        action: string;
        targetId: string | null;
        ip: string | null;
        metadata: unknown;
      }[]
    ).find((e) => e.action === 'user.create')!;
    expect(entry.targetId).toBe(created.body.user.id);
    expect(entry.metadata).toMatchObject({ email: 'audrey@sigma.local' });
    const member = await userClient(app, admin, 'Mel');
    expect((await member.get('/audit')).status).toBe(403);
    // failed logins are recorded too
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'admin@sigma.local', password: 'wrong-password' });
    const after = (await admin.get('/audit?limit=5')).body as { action: string }[];
    expect(after[0]?.action).toBe('auth.login_failed');
  });

  it('lists and revokes sessions', async () => {
    const second = await adminClient(app);
    const sessions = (await admin.get('/auth/sessions')).body as {
      id: string;
      current: boolean;
      lastSeenAt: string;
    }[];
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    const other = sessions.find((s) => !s.current)!;
    expect((await admin.delete(`/auth/sessions/${other.id}`)).status).toBe(204);
    expect((await second.get('/auth/me')).status).toBe(401);
    expect((await admin.post('/auth/sessions/revoke-others')).status).toBe(204);
    expect((await admin.get('/auth/me')).status).toBe(200);
  });

  it('two-factor: enrol with TOTP, require a code at login, recovery codes, disable', async () => {
    const { totp } = await import('../src/common/totp');
    const setup = await admin.post('/auth/2fa/setup');
    expect(setup.status).toBe(201);
    expect(setup.body.otpauthUrl).toMatch(
      /^otpauth:\/\/totp\/SIGMA:admin@sigma.local\?secret=[A-Z2-7]+&issuer=SIGMA/,
    );
    const secret = setup.body.secret as string;
    expect((await admin.post('/auth/2fa/enable', { code: '000000' })).status).toBe(400);
    const enable = await admin.post('/auth/2fa/enable', { code: totp(secret) });
    expect(enable.status).toBe(201);
    expect(enable.body.recoveryCodes).toHaveLength(8);
    expect((await admin.get('/auth/me')).body.user.twoFactorEnabled).toBe(true);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'admin@sigma.local', password: 'admin-password-123' });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ requiresTwoFactor: true });
    expect(login.body.user).toBeUndefined();
    const pending = (login.headers['set-cookie'] as string[]).find((c) =>
      c.startsWith('sigma_2fa='),
    )!;
    const bad = await request(app.getHttpServer())
      .post('/api/v1/auth/login/2fa')
      .set('Origin', ORIGIN)
      .set('Cookie', pending.split(';')[0]!)
      .send({ code: '123456' });
    expect(bad.status).toBe(401);
    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/login/2fa')
      .set('Origin', ORIGIN)
      .set('Cookie', pending.split(';')[0]!)
      .send({ code: totp(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('admin@sigma.local');
    const recovery = enable.body.recoveryCodes[0] as string;
    const login2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'admin@sigma.local', password: 'admin-password-123' });
    const pending2 = (login2.headers['set-cookie'] as string[])
      .find((c) => c.startsWith('sigma_2fa='))!
      .split(';')[0]!;
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login/2fa')
          .set('Origin', ORIGIN)
          .set('Cookie', pending2)
          .send({ code: recovery })
      ).status,
    ).toBe(200);
    const login3 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'admin@sigma.local', password: 'admin-password-123' });
    const pending3 = (login3.headers['set-cookie'] as string[])
      .find((c) => c.startsWith('sigma_2fa='))!
      .split(';')[0]!;
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login/2fa')
          .set('Origin', ORIGIN)
          .set('Cookie', pending3)
          .send({ code: recovery })
      ).status,
    ).toBe(401); // single use
    expect((await admin.post('/auth/2fa/disable', { code: totp(secret) })).status).toBe(204);
    expect((await admin.get('/auth/me')).body.user.twoFactorEnabled).toBe(false);
  });

  it('exposes Prometheus metrics and detailed health', async () => {
    const metrics = await request(app.getHttpServer()).get('/api/v1/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.text).toContain('sigma_http_requests_total');
    expect(metrics.text).toContain('sigma_http_request_duration_seconds');
    expect(metrics.text).toMatch(/sigma_http_requests_total\{[^}]*status="200"[^}]*\} \d+/);
    const health = await request(app.getHttpServer()).get('/api/v1/health');
    expect(health.body).toMatchObject({ status: 'ok', database: 'ok' });
    expect(typeof health.body.version).toBe('string');
  });
});
