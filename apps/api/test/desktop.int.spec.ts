import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from '../src/common/migrate';
import { startSigma } from '../src/embedded';
import type { RunningSigma } from '../src/embedded';
import { truncateAll } from './helpers';

const BASE = new URL(process.env['DATABASE_URL'] as string);
const adminUrl = () => {
  const u = new URL(BASE.toString());
  u.pathname = '/postgres';
  return u.toString();
};
const scratchUrl = (name: string) => {
  const u = new URL(BASE.toString());
  u.pathname = `/${name}`;
  return u.toString();
};
async function recreate(name: string) {
  const c = new Client({ connectionString: adminUrl() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${name}"`);
  await c.end();
}

describe('migration runner (used by the desktop app instead of the Prisma CLI)', () => {
  const db = 'sigma_migrate_test';
  beforeAll(() => recreate(db));

  it('applies every migration once on an empty database and is a no-op afterwards', async () => {
    const first = await applyMigrations(scratchUrl(db), join(__dirname, '../prisma/migrations'));
    expect(first.applied.length).toBeGreaterThanOrEqual(6);
    expect(first.applied[0]).toBe('0001_init');
    const again = await applyMigrations(scratchUrl(db), join(__dirname, '../prisma/migrations'));
    expect(again.applied).toEqual([]);
    const c = new Client({ connectionString: scratchUrl(db) });
    await c.connect();
    const tables = await c.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    expect(tables.rows.map((r: { table_name: string }) => r.table_name)).toEqual(
      expect.arrayContaining(['users', 'documents', 'ai_providers', '_sigma_migrations']),
    );
    await c.end();
  });

  it('rolls a failing migration back completely and reports which one failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigma-mig-'));
    const mk = (n: string, sql: string) => {
      const d = join(dir, n);
      require('node:fs').mkdirSync(d);
      writeFileSync(join(d, 'migration.sql'), sql);
    };
    mk('9001_ok', 'CREATE TABLE "mig_ok" (id INT);');
    mk('9002_bad', 'CREATE TABLE "mig_half" (id INT); SELECT * FROM table_that_does_not_exist;');
    await expect(applyMigrations(scratchUrl(db), dir)).rejects.toThrow(/9002_bad/);
    const c = new Client({ connectionString: scratchUrl(db) });
    await c.connect();
    const t = await c.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('mig_ok','mig_half')",
    );
    expect(t.rows.map((r: { table_name: string }) => r.table_name)).toEqual(['mig_ok']);
    await c.end();
  });
});

describe('embedded server (desktop mode)', () => {
  let sigma: RunningSigma;
  let origin: string;
  beforeAll(async () => {
    await truncateAll();
    const webRoot = mkdtempSync(join(tmpdir(), 'sigma-web-'));
    writeFileSync(
      join(webRoot, 'index.html'),
      '<!doctype html><title>SIGMA</title><div id="root"></div>',
    );
    writeFileSync(join(webRoot, 'app.js'), 'console.log("app")');
    sigma = await startSigma({
      databaseUrl: process.env['DATABASE_URL'] as string,
      dataDir: mkdtempSync(join(tmpdir(), 'sigma-data-')),
      sessionSecret: 'desktop-test-secret-0123456789abcdef',
      port: 0,
      host: '127.0.0.1',
      webRoot,
      desktop: true,
    });
    origin = sigma.url;
  });
  afterAll(() => sigma.close());

  it('serves the web client, client-side routes and the API from one port with security headers', async () => {
    const home = await fetch(`${origin}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('<div id="root">');
    expect(home.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(await (await fetch(`${origin}/file/abc/preview`)).text()).toContain('<div id="root">');
    expect((await fetch(`${origin}/app.js`)).headers.get('content-type')).toMatch(/javascript/);
    expect(await (await fetch(`${origin}/api/v1/health`)).json()).toMatchObject({
      status: 'ok',
      database: 'ok',
    });
    expect((await fetch(`${origin}/api/v1/nope`)).status).toBe(404);
  });

  it('first-run setup creates the owner once, signs them in and prepares a starter file', async () => {
    expect(await (await fetch(`${origin}/api/v1/setup/status`)).json()).toEqual({
      desktop: true,
      needsSetup: true,
    });
    const weak = await fetch(`${origin}/api/v1/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ name: 'Asha', email: 'asha@example.com', password: 'short' }),
    });
    expect(weak.status).toBe(400);
    const res = await fetch(`${origin}/api/v1/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        name: 'Asha',
        email: 'asha@example.com',
        password: 'Tangerine-Harbour-42',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      user: { email: string; systemRole: string; mustChangePassword: boolean };
      documentId: string;
    };
    expect(body.user).toMatchObject({
      email: 'asha@example.com',
      systemRole: 'ADMIN',
      mustChangePassword: false,
    });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect(cookie).toMatch(/^sigma_session=/);
    const doc = await fetch(`${origin}/api/v1/documents/${body.documentId}`, {
      headers: { Cookie: cookie },
    });
    expect(doc.status).toBe(200);
    expect(await (await fetch(`${origin}/api/v1/setup/status`)).json()).toEqual({
      desktop: true,
      needsSetup: false,
    });
    const again = await fetch(`${origin}/api/v1/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        name: 'Eve',
        email: 'eve@example.com',
        password: 'Tangerine-Harbour-43',
      }),
    });
    expect(again.status).toBe(409);
  });
});
