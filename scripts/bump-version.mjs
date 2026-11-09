#!/usr/bin/env node
/* global process, console */
// Sets the version of every workspace package (and the root) to the given semver string.
// Usage: node scripts/bump-version.mjs 0.1.0
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/bump-version.mjs <x.y.z[-pre]>');
  process.exit(1);
}
const roots = [
  '.',
  ...['apps', 'packages', 'tests'].flatMap((d) => readdirSync(d).map((n) => join(d, n))),
];
let count = 0;
for (const dir of roots) {
  const file = join(dir, 'package.json');
  try {
    if (!statSync(file).isFile()) continue;
  } catch {
    continue;
  }
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (!pkg.version) continue;
  pkg.version = version;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  count++;
}
console.log(`Set ${count} package versions to ${version}`);
