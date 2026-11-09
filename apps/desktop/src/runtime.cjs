// SIGMA desktop runtime, independent of Electron so it can be tested with plain Node:
// settings, the bundled PostgreSQL, migrations, and the in-process SIGMA server.
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

/**
 * Folder with the bundled PostgreSQL executables for a platform package. The package is a
 * dependency of embedded-postgres, so it is resolved from there rather than from this file.
 */
function platformBinDir(platform) {
  const { createRequire } = require('node:module');
  const fromLibrary = createRequire(require.resolve('embedded-postgres'));
  const entry = fromLibrary.resolve(`@embedded-postgres/${platform}`);
  return path.resolve(path.dirname(entry), '..', 'native', 'bin');
}

/** Picks a free TCP port on this machine. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function portIsFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, host, () => srv.close(() => resolve(true)));
  });
}

const DEFAULT_PORT = 3387;

/**
 * Loads the settings file, creating it on first run. `protect` / `reveal` let the Electron shell
 * encrypt the secrets with the OS keychain (safeStorage); tests pass nothing and store them plain.
 */
function loadConfig(dataDir, { protect = (s) => s, reveal = (s) => s } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'config.json');
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...raw,
      sessionSecret: reveal(raw.sessionSecret),
      dbPassword: reveal(raw.dbPassword),
      file,
    };
  }
  const config = {
    version: 1,
    port: DEFAULT_PORT,
    sharing: false,
    sessionSecret: crypto.randomBytes(36).toString('base64url'),
    dbPassword: crypto.randomBytes(24).toString('base64url'),
  };
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...config,
        sessionSecret: protect(config.sessionSecret),
        dbPassword: protect(config.dbPassword),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return { ...config, file };
}

function saveConfig(config, patch, { protect = (s) => s } = {}) {
  const next = { ...config, ...patch };
  const { file, ...rest } = next;
  fs.writeFileSync(
    file,
    JSON.stringify(
      { ...rest, sessionSecret: protect(rest.sessionSecret), dbPassword: protect(rest.dbPassword) },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return next;
}

/** First non-internal IPv4 address, for the "share on this network" link. */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return null;
}

/** A stale postmaster.pid from a crash would block startup; remove it when that process is gone. */
function clearStaleLock(pgDir) {
  const pidFile = path.join(pgDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return false;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').split('\n')[0]);
  try {
    if (pid > 0) process.kill(pid, 0);
    return false; // still running
  } catch {
    fs.rmSync(pidFile, { force: true });
    return true;
  }
}

/**
 * A previous run that was killed can leave its PostgreSQL process running on this data folder.
 * Ask it to shut down (fast mode) and wait, so the new run can take over.
 */
async function stopOrphan(pgDir) {
  const pidFile = path.join(pgDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return false;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').split('\n')[0]);
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  if (!(pid > 0) || !alive()) return false;
  try {
    process.kill(pid, 'SIGINT');
  } catch {
    return false;
  }
  for (let i = 0; i < 100 && alive(); i++) await new Promise((r) => setTimeout(r, 100));
  if (alive()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return true;
}

const withTimeout = (promise, ms, what) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not finish within ${ms / 1000} seconds`)), ms),
    ),
  ]);

/**
 * Starts PostgreSQL, applies migrations and starts SIGMA. Returns a handle with `stop()`.
 * @param {{ dataDir: string, apiDir: string, webRoot: string, protect?: Function, reveal?: Function, quiet?: boolean, port?: number, log?: (m: string) => void }} options
 */
async function startRuntime(options) {
  const log = options.log ?? (() => {});
  const secrets = { protect: options.protect, reveal: options.reveal };
  let config = loadConfig(options.dataDir, secrets);
  const pgDir = path.join(options.dataDir, 'pgdata');
  const assetsDir = path.join(options.dataDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pgPort = await freePort();
  // The database's own output, kept so a startup failure can say why.
  const pgOutput = [];
  let pgCtl = null;
  const explain = (step) => (e) => {
    const detail =
      e && typeof e === 'object' && 'message' in e
        ? e.message
        : e === undefined || e === null
          ? 'no error given'
          : String(e);
    throw new Error(
      `${step} failed (${process.platform}${pgCtl ? ', pg_ctl' : ''}): ${detail}\n${pgOutput.slice(-15).join('\n')}`,
      { cause: e },
    );
  };
  const pg = new EmbeddedPostgres({
    databaseDir: pgDir,
    user: 'sigma',
    password: config.dbPassword,
    port: pgPort,
    persistent: true,
    onLog: (m) => pgOutput.push(String(m)),
    onError: (e) => pgOutput.push(String(e)),
  });
  const firstRun = !fs.existsSync(path.join(pgDir, 'PG_VERSION'));
  if (firstRun) {
    log('Preparing the database for first use…');
    await pg.initialise().catch(explain('Preparing the database'));
  } else {
    const tookOver = await stopOrphan(pgDir);
    if (clearStaleLock(pgDir) || tookOver) log('Recovered from an unclean shutdown.');
  }
  // On Windows the server is started through pg_ctl, which drops administrator rights the way
  // PostgreSQL requires (postgres.exe refuses to run elevated). Elsewhere the library starts it.
  if (process.platform === 'win32') {
    const binDir = platformBinDir('windows-x64');
    pgCtl = path.join(binDir, 'pg_ctl.exe');
    pgOutput.push(`pg_ctl: ${pgCtl} (exists: ${fs.existsSync(pgCtl)})`);
    const { execFile } = require('node:child_process');
    const ctl = (args) =>
      new Promise((resolve, reject) =>
        execFile(pgCtl, args, { windowsHide: true }, (err, stdout, stderr) => {
          pgOutput.push(String(stdout), String(stderr));
          if (err)
            reject(
              new Error(
                `pg_ctl ${args[args.length - 1]} exited with ${err.code ?? err.signal ?? err.message}`,
              ),
            );
          else resolve();
        }),
      );
    const serverLog = path.join(options.dataDir, 'postgres.log');
    pg.start = () =>
      ctl([
        '-D',
        pgDir,
        '-o',
        `-p ${pgPort} -c listen_addresses=127.0.0.1`,
        '-l',
        serverLog,
        '-w',
        '-t',
        '60',
        'start',
      ]);
    pg.stop = () => ctl(['-D', pgDir, '-m', 'fast', '-w', '-t', '30', 'stop']);
  }
  await withTimeout(pg.start(), 90_000, 'Starting the database').catch((e) => {
    try {
      pgOutput.push(
        fs.readFileSync(path.join(options.dataDir, 'postgres.log'), 'utf8').slice(-1500),
      );
    } catch {
      /* no server log */
    }
    return explain('Starting the database')(e);
  });
  if (firstRun) await pg.createDatabase('sigma');
  const databaseUrl = `postgresql://sigma:${encodeURIComponent(config.dbPassword)}@127.0.0.1:${pgPort}/sigma?schema=public`;

  // The API bundle and its dependencies live outside this package (workspace in development,
  // resources folder when packaged).
  const api = require(path.join(options.apiDir, 'dist', 'embedded.cjs'));
  const migrated = await api.applyMigrations(
    databaseUrl,
    path.join(options.apiDir, 'prisma', 'migrations'),
  );
  if (migrated.applied.length)
    log(
      `Database updated (${migrated.applied.length} change${migrated.applied.length === 1 ? '' : 's'}).`,
    );

  let sigma = null;
  const startServer = async () => {
    let port = options.port ?? config.port;
    if (port !== 0 && !(await portIsFree(port, config.sharing ? '0.0.0.0' : '127.0.0.1'))) {
      port = await freePort();
      log(`Port ${config.port} is in use; using ${port} this time.`);
    }
    const host = config.sharing ? '0.0.0.0' : '127.0.0.1';
    sigma = await api.startSigma({
      databaseUrl,
      dataDir: assetsDir,
      sessionSecret: config.sessionSecret,
      port,
      host,
      webRoot: options.webRoot,
      desktop: true,
      quiet: options.quiet ?? true,
    });
    return sigma;
  };
  await startServer();

  const handle = {
    get url() {
      return `http://127.0.0.1:${sigma.port}`;
    },
    get port() {
      return sigma.port;
    },
    get sharing() {
      return config.sharing;
    },
    /** Address teammates on the same network can open, or null when sharing is off. */
    get shareUrl() {
      const ip = lanAddress();
      return config.sharing && ip ? `http://${ip}:${sigma.port}` : null;
    },
    dataDir: options.dataDir,
    /** Turns network sharing on or off by restarting the HTTP server on the right interface. */
    async setSharing(on) {
      if (on === config.sharing) return handle;
      config = saveConfig(config, { sharing: on }, secrets);
      await sigma.close();
      await startServer();
      return handle;
    },
    /** Copies the database and uploads into `targetDir` (the app pauses for a moment). */
    async backup(targetDir) {
      const out = path.join(
        targetDir,
        `sigma-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
      );
      await sigma.close();
      await pg.stop();
      try {
        fs.cpSync(pgDir, path.join(out, 'pgdata'), { recursive: true });
        fs.cpSync(assetsDir, path.join(out, 'assets'), { recursive: true });
        fs.copyFileSync(config.file, path.join(out, 'config.json'));
      } finally {
        await pg.start();
        await startServer();
      }
      return out;
    },
    async stop() {
      const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
      await within(
        sigma.close().catch((e) => log(`server close: ${e}`)),
        3000,
      );
      log('Server stopped.');
      await within(
        pg.stop().catch((e) => log(`database stop: ${e}`)),
        8000,
      );
      // Make sure no database process outlives the app, whatever happened above.
      await stopOrphan(pgDir);
      log('Database stopped.');
    },
  };
  return handle;
}

module.exports = {
  stopOrphan,
  startRuntime,
  loadConfig,
  saveConfig,
  freePort,
  portIsFree,
  lanAddress,
  clearStaleLock,
  DEFAULT_PORT,
};
