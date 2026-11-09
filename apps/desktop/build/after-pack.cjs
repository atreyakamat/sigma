// electron-builder leaves node_modules out of extraResources, but the SIGMA server in
// resources/api needs its dependencies next to it. Copy them in after packing.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : path.join(context.appOutDir, 'resources');
  const from = path.join(context.packager.projectDir, 'stage', 'api', 'node_modules');
  const to = path.join(resources, 'api', 'node_modules');
  if (!fs.existsSync(from)) throw new Error(`Staged server dependencies not found at ${from}`);
  fs.cpSync(from, to, { recursive: true, dereference: true });
  // Tooling the running app never loads: the Prisma CLI and its engines/studio (migrations are
  // applied by SIGMA's own runner), type packages, and transitive UI libraries of that tooling.
  const unused = [
    'prisma',
    '@prisma/studio-core',
    '@prisma/engines',
    '@prisma/dev',
    '@prisma/fetch-engine',
    '@prisma/get-platform',
    '@prisma/engines-version',
    '@prisma/streams-local',
    '@electric-sql',
    'effect',
    'react',
    'react-dom',
    'scheduler',
    '@types',
    'typescript',
  ];
  for (const name of unused) fs.rmSync(path.join(to, name), { recursive: true, force: true });
  fs.rmSync(path.join(resources, 'api', 'prisma', 'generated'), { recursive: true, force: true });
  // SIGMA only talks to PostgreSQL: drop the query compilers for other databases, and source maps.
  const runtime = path.join(to, '@prisma', 'client', 'runtime');
  if (fs.existsSync(runtime))
    for (const f of fs.readdirSync(runtime))
      if (/\.(mysql|sqlite|sqlserver|cockroachdb)\./.test(f))
        fs.rmSync(path.join(runtime, f), { force: true });
  const dropMaps = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) dropMaps(p);
      else if (e.name.endsWith('.map')) fs.rmSync(p, { force: true });
    }
  };
  dropMaps(path.join(resources, 'api'));
  for (const junk of [
    'Dockerfile.dockerignore',
    'eslint.config.mjs',
    'tsconfig.json',
    'tsconfig.build.json',
    'prisma.config.ts',
  ])
    fs.rmSync(path.join(resources, 'api', junk), { force: true });
  console.log(`  • copied server dependencies → ${path.relative(context.appOutDir, to)}`);
};
