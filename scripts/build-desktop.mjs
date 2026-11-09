#!/usr/bin/env node
/* global process, console */
// Builds the SIGMA desktop installer for the current operating system.
//   pnpm desktop:build            → installers in apps/desktop/release
//   pnpm desktop:build --dir      → unpacked app only (fast, for checking)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const desktop = join(root, 'apps/desktop');
const stage = join(desktop, 'stage');
const run = (cmd, cwd = root) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// 1. Build the web client and the server bundle.
run('pnpm --filter @sigma/web build');
run('pnpm --filter @sigma/api build');

// 2. Self-contained copies with flat node_modules (no workspace symlinks) for packaging.
run(
  `pnpm --filter @sigma/api deploy --prod --legacy --config.node-linker=hoisted "${join(stage, 'api')}"`,
);
run(
  `pnpm --filter @sigma/desktop deploy --prod --legacy --config.node-linker=hoisted "${join(stage, 'app')}"`,
);

// 3. Keep only what the running app needs from the server copy.
for (const extra of [
  'src',
  'test',
  'Dockerfile',
  'docker-entrypoint.sh',
  'vite.config.mts',
  'vitest.config.mts',
  'vitest.integration.config.mts',
  'nest-cli.json',
])
  rmSync(join(stage, 'api', extra), { recursive: true, force: true });
if (!existsSync(join(stage, 'api/dist/embedded.cjs')))
  throw new Error('Server bundle missing from the staged copy');
if (!existsSync(join(stage, 'api/prisma/migrations')))
  cpSync(join(root, 'apps/api/prisma/migrations'), join(stage, 'api/prisma/migrations'), {
    recursive: true,
  });

// 4. The packaged app's manifest: version from the workspace, no dev tooling.
const pkg = JSON.parse(readFileSync(join(stage, 'app/package.json'), 'utf8'));
delete pkg.devDependencies;
delete pkg.scripts;
pkg.name = 'sigma-desktop';
pkg.productName = 'SIGMA';
pkg.author = 'SIGMA contributors';
pkg.homepage = 'https://github.com/atreyakamat/sigma';
writeFileSync(join(stage, 'app/package.json'), JSON.stringify(pkg, null, 2));
for (const extra of [
  'test',
  'stage',
  'release',
  '.tmp',
  '.tmp-app',
  'electron-builder.yml',
  'eslint.config.mjs',
  'vitest.config.mjs',
])
  rmSync(join(stage, 'app', extra), { recursive: true, force: true });

// 5. Package.
const args = process.argv.slice(2).join(' ');
run(`pnpm dlx electron-builder@26.18.0 --config electron-builder.yml ${args}`, desktop);
console.log(`\nDone. Output: ${join(desktop, 'release')}`);
