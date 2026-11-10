#!/usr/bin/env node
/* global process, console, Buffer */
// Renders the brand SVGs to the PNG, ICO and ICNS files the apps and the landing page need.
//   node scripts/make-icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { createCanvas, loadImage } = createRequire(join(root, 'apps/api/package.json'))(
  '@napi-rs/canvas',
);
const svg = (name) => readFileSync(join(root, 'brand', name));

async function render(file, width, height = width) {
  const img = await loadImage(svg(file));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvas.toBuffer('image/png');
}

/** ICO container holding PNG images (Windows Vista and later read these directly). */
function ico(pngs) {
  const head = Buffer.alloc(6 + pngs.length * 16);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const at = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, at);
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(data.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

/** ICNS container with PNG payloads (macOS 10.7 and later). */
function icns(entries) {
  const chunks = entries.map(({ type, data }) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([h, data]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...chunks]);
}

const build = join(root, 'apps/desktop/build');
mkdirSync(build, { recursive: true });
mkdirSync(join(root, 'brand/png'), { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const png = {};
for (const s of sizes) png[s] = await render('logo-mark.svg', s);

writeFileSync(join(build, 'icon.png'), png[512]);
writeFileSync(
  join(build, 'icon.ico'),
  ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: png[size] }))),
);
writeFileSync(
  join(build, 'icon.icns'),
  icns(
    [
      ['ic07', png[128]],
      ['ic08', png[256]],
      ['ic09', png[512]],
      ['ic10', png[1024]],
    ].map(([type, data]) => ({ type, data })),
  ),
);
for (const s of [32, 180, 192, 512, 1024])
  writeFileSync(
    join(root, `brand/png/logo-${s}.png`),
    s === 180 || s === 192
      ? await render('logo-mark.svg', s)
      : (png[s] ?? (await render('logo-mark.svg', s))),
  );
writeFileSync(join(root, 'brand/png/og-1200x630.png'), await render('og.svg', 1200, 630));
writeFileSync(join(root, 'brand/png/banner-1280x400.png'), await render('banner.svg', 1280, 400));
console.log('Icons written to apps/desktop/build and brand/png');
process.exitCode = 0;
