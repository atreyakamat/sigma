#!/usr/bin/env node
// SIGMA command-line client. Needs SIGMA_URL (e.g. http://localhost:3000) and SIGMA_TOKEN (a personal
// API token from Account → API tokens). Node 20+ (built-in fetch).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = (process.env.SIGMA_URL ?? '').replace(/\/$/, '');
const token = process.env.SIGMA_TOKEN ?? '';
const [command, ...args] = process.argv.slice(2);

const USAGE = `sigma — SIGMA command line

Usage:
  sigma frames <documentId> [--approved]              List frames (id, name, size, review state)
  sigma export <documentId> <out.svg|out.png> [--frame <id>] [--scale <n>] [--approved]
  sigma export-all <documentId> <dir> [--format png|svg] [--scale <n>] [--approved]
  sigma tokens <documentId> [--css] [> file]          Design tokens as JSON (or CSS)
  sigma checkpoint <documentId> "<label>"             Save a named version
  sigma versions <documentId>                         List versions
  sigma me                                            Show the token's user

Environment: SIGMA_URL, SIGMA_TOKEN`;

function flag(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

async function api(path, init = {}) {
  if (!url || !token) throw new Error('Set SIGMA_URL and SIGMA_TOKEN');
  const res = await fetch(`${url}/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      msg = `${res.status}: ${Array.isArray(body.message) ? body.message.join('; ') : body.message}`;
    } catch {
      /* non-JSON error */
    }
    throw new Error(msg);
  }
  return res;
}

const approvedQuery = () => (flag('approved') ? '&approved=true' : '');

async function main() {
  switch (command) {
    case 'me': {
      const { user } = await (await api('/auth/me')).json();
      console.log(`${user.name} <${user.email}> (${user.systemRole})`);
      return;
    }
    case 'frames': {
      const [doc] = args;
      const frames = await (await api(`/documents/${doc}/frames?x=1${approvedQuery()}`)).json();
      for (const f of frames)
        console.log(`${f.id}\t${f.width}×${f.height}\t${f.review?.state ?? 'DRAFT'}\t${f.name}`);
      return;
    }
    case 'export': {
      const [doc, out] = args;
      if (!doc || !out) throw new Error(USAGE);
      const ext = out.endsWith('.png') ? 'png' : 'svg';
      const frame = flag('frame');
      const scale = flag('scale', '1');
      const q = `?scale=${scale}${frame ? `&frame=${frame}` : ''}`;
      const res = await api(`/documents/${doc}/export.${ext}${q}`);
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      console.log(`wrote ${out}`);
      return;
    }
    case 'export-all': {
      const [doc, dir] = args;
      if (!doc || !dir) throw new Error(USAGE);
      const format = flag('format', 'png');
      const scale = flag('scale', '1');
      mkdirSync(dir, { recursive: true });
      const frames = await (await api(`/documents/${doc}/frames?x=1${approvedQuery()}`)).json();
      for (const f of frames) {
        const res = await api(`/documents/${doc}/export.${format}?scale=${scale}&frame=${f.id}`);
        const file = join(dir, `${f.name.replace(/[^\w.-]+/g, '_')}.${format}`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        console.log(`wrote ${file}`);
      }
      return;
    }
    case 'tokens': {
      const [doc] = args;
      const css = flag('css');
      const res = await api(
        `/documents/${doc}/tokens.${css ? 'css' : 'json'}?x=1${approvedQuery()}`,
      );
      process.stdout.write(await res.text());
      if (!css) process.stdout.write('\n');
      return;
    }
    case 'checkpoint': {
      const [doc, label] = args;
      if (!doc || !label) throw new Error(USAGE);
      const v = await (
        await api(`/documents/${doc}/versions`, { method: 'POST', body: JSON.stringify({ label }) })
      ).json();
      console.log(`version ${v.id} "${v.label}" at revision ${v.revision}`);
      return;
    }
    case 'versions': {
      const [doc] = args;
      const list = await (await api(`/documents/${doc}/versions`)).json();
      for (const v of list)
        console.log(
          `${v.id}\tr${v.revision}\t${v.createdAt}\t${v.createdByName}\t${v.label ?? '(automatic)'}`,
        );
      return;
    }
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
