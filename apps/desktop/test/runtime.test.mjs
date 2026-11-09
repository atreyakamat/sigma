import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { startRuntime, loadConfig, clearStaleLock, freePort } = require('../src/runtime.cjs');

const apiDir = resolve(import.meta.dirname, '../../api');
const webRoot = resolve(import.meta.dirname, '../../web/dist');
// Database clusters are large: keep test data inside the package and remove it afterwards.
const tmpRoot = resolve(import.meta.dirname, '../.tmp');
mkdirSync(tmpRoot, { recursive: true });
const tmpdir = () => tmpRoot;
const dataDir = mkdtempSync(join(tmpdir(), 'sigma-desktop-'));
let runtime;
afterAll(async () => {
  await runtime?.stop();
  rmSync(tmpRoot, { recursive: true, force: true });
});

const post = (url, body, cookie) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: new URL(url).origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });

describe('desktop settings', () => {
  it('creates secrets once, reuses them, and can protect them at rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigma-cfg-'));
    const protect = (s) => `enc:${Buffer.from(s).toString('base64')}`;
    const reveal = (s) => Buffer.from(s.slice(4), 'base64').toString();
    const a = loadConfig(dir, { protect, reveal });
    expect(a.sessionSecret.length).toBeGreaterThan(30);
    expect(readFileSync(join(dir, 'config.json'), 'utf8')).not.toContain(a.sessionSecret);
    const b = loadConfig(dir, { protect, reveal });
    expect(b.sessionSecret).toBe(a.sessionSecret);
    expect(b.dbPassword).toBe(a.dbPassword);
    expect(b.sharing).toBe(false);
  });
  it('removes a stale database lock but leaves a live one alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigma-lock-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'postmaster.pid'), '999999999\n');
    expect(clearStaleLock(dir)).toBe(true);
    expect(existsSync(join(dir, 'postmaster.pid'))).toBe(false);
    writeFileSync(join(dir, 'postmaster.pid'), `${process.pid}\n`);
    expect(clearStaleLock(dir)).toBe(false);
  });
});

describe('desktop runtime: bundled PostgreSQL + SIGMA in one process, no Docker', () => {
  let cookie;
  let documentId;
  it('starts on an empty folder, serves the app, and completes first-run setup', async () => {
    runtime = await startRuntime({ dataDir, apiDir, webRoot, port: await freePort() });
    expect(await (await fetch(`${runtime.url}/api/v1/health`)).json()).toMatchObject({
      status: 'ok',
      database: 'ok',
    });
    expect(await (await fetch(`${runtime.url}/`)).text()).toContain('<div id="root">');
    expect(await (await fetch(`${runtime.url}/api/v1/setup/status`)).json()).toEqual({
      desktop: true,
      needsSetup: true,
    });
    const res = await post(`${runtime.url}/api/v1/setup`, {
      name: 'Asha Rao',
      email: 'asha@example.com',
      password: 'Tangerine-Harbour-42',
    });
    expect(res.status).toBe(201);
    cookie = res.headers.get('set-cookie').split(';')[0];
    documentId = (await res.json()).documentId;
    const ops = await post(
      `${runtime.url}/api/v1/documents/${documentId}/ops`,
      { ops: [{ op: 'add', type: 'RECTANGLE', name: 'Kept across restarts' }] },
      cookie,
    );
    expect((await ops.json()).applied).toBe(1);
  }, 180_000);

  it('keeps data across a restart and does not ask for setup again', async () => {
    await runtime.stop();
    runtime = await startRuntime({ dataDir, apiDir, webRoot, port: await freePort() });
    expect(await (await fetch(`${runtime.url}/api/v1/setup/status`)).json()).toEqual({
      desktop: true,
      needsSetup: false,
    });
    const outline = await (
      await fetch(`${runtime.url}/api/v1/documents/${documentId}/outline`, {
        headers: { Cookie: cookie },
      })
    ).json();
    expect(JSON.stringify(outline)).toContain('Kept across restarts');
  }, 120_000);

  it('sharing switches the server to the network interface and back', async () => {
    expect(runtime.shareUrl).toBeNull();
    await runtime.setSharing(true);
    expect(runtime.sharing).toBe(true);
    if (runtime.shareUrl)
      expect((await fetch(`${runtime.shareUrl}/api/v1/health`)).status).toBe(200);
    await runtime.setSharing(false);
    expect(runtime.shareUrl).toBeNull();
    expect((await fetch(`${runtime.url}/api/v1/health`)).status).toBe(200);
  }, 120_000);

  it('backs up the database and uploads into a folder while staying usable afterwards', async () => {
    const target = mkdtempSync(join(tmpdir(), 'sigma-backup-'));
    const out = await runtime.backup(target);
    expect(existsSync(join(out, 'pgdata', 'PG_VERSION'))).toBe(true);
    expect(existsSync(join(out, 'assets'))).toBe(true);
    expect((await fetch(`${runtime.url}/api/v1/health`)).status).toBe(200);
  }, 120_000);
});
