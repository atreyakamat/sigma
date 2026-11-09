#!/usr/bin/env node
/* global process, console, fetch */
// Verifies a packaged SIGMA Desktop build end to end without a UI driver:
//   node test/packaged-check.mjs <path-to-executable>
// Starts the app on a fresh data folder, waits for it to report its address, then checks the web
// client, first-run setup, an edit, and a server-side PNG render (native canvas module).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const exe = process.argv[2];
if (!exe || !existsSync(exe)) {
  console.error('Usage: node test/packaged-check.mjs <path-to-executable>');
  process.exit(2);
}
const root = resolve(import.meta.dirname, '..', '.tmp-pack');
mkdirSync(root, { recursive: true });
const dataDir = mkdtempSync(join(root, 'data-'));
const child = spawn(exe, ['--no-sandbox', '--disable-gpu'], {
  env: { ...process.env, SIGMA_DATA_DIR: dataDir, SIGMA_PLAIN_CONFIG: '1' },
  stdio: 'ignore',
});
const fail = (m) => {
  console.error(`FAILED: ${m}`);
  try {
    console.error(readFileSync(join(dataDir, 'sigma.log'), 'utf8').slice(-2000));
  } catch {
    /* no log yet */
  }
  child.kill('SIGKILL');
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let url = null;
for (let i = 0; i < 180 && !url; i++) {
  await sleep(1000);
  if (child.exitCode !== null) fail(`the app exited early with code ${child.exitCode}`);
  try {
    const log = readFileSync(join(dataDir, 'sigma.log'), 'utf8');
    if (log.includes('startup failed')) fail('startup failed');
    url = /SIGMA running at (http:\/\/\S+)/.exec(log)?.[1] ?? null;
  } catch {
    /* log not written yet */
  }
}
if (!url) fail('the app did not report its address within 3 minutes');

const json = { 'Content-Type': 'application/json', Origin: url };
const check = (cond, what) => (cond ? console.log(`ok  ${what}`) : fail(what));
check((await (await fetch(`${url}/`)).text()).includes('<div id="root">'), 'serves the web client');
check(
  (await (await fetch(`${url}/api/v1/health`)).json()).database === 'ok',
  'database is healthy',
);
const setup = await fetch(`${url}/api/v1/setup`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({
    name: 'Packaged Check',
    email: 'check@example.com',
    password: 'Tangerine-Harbour-42',
  }),
});
check(setup.status === 201, 'first-run setup creates the owner');
const cookie = setup.headers.get('set-cookie').split(';')[0];
const { documentId } = await setup.json();
const ops = await fetch(`${url}/api/v1/documents/${documentId}/ops`, {
  method: 'POST',
  headers: { ...json, Cookie: cookie },
  body: JSON.stringify({
    ops: [
      { op: 'add', type: 'FRAME', ref: 'f', name: 'Screen', width: 200, height: 120 },
      { op: 'add', type: 'TEXT', parent: '$f', text: 'Hello' },
    ],
  }),
});
check((await ops.json()).applied === 2, 'edits are applied');
const png = await fetch(`${url}/api/v1/documents/${documentId}/export.png?scale=1`, {
  headers: { Cookie: cookie },
});
check(
  png.status === 200 &&
    Buffer.from(await png.arrayBuffer())
      .subarray(1, 4)
      .toString() === 'PNG',
  'server-side PNG export works (native canvas)',
);

child.kill('SIGINT');
for (let i = 0; i < 30 && child.exitCode === null; i++) await sleep(500);
if (child.exitCode === null) child.kill('SIGKILL');
rmSync(root, { recursive: true, force: true });
console.log('Packaged build passed all checks.');
