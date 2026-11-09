// SIGMA desktop: Electron shell around the in-process runtime (bundled PostgreSQL + SIGMA server).
const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { startRuntime } = require('./runtime.cjs');

const packaged = app.isPackaged;
const resources = packaged ? process.resourcesPath : path.resolve(__dirname, '..', '..');
const apiDir = process.env.SIGMA_API_DIR ?? path.join(resources, 'api');
const webRoot =
  process.env.SIGMA_WEB_ROOT ??
  (packaged ? path.join(resources, 'web') : path.join(resources, 'web', 'dist'));
// Tests and power users can point the app at another data folder.
if (process.env.SIGMA_DATA_DIR) app.setPath('userData', process.env.SIGMA_DATA_DIR);

let runtime = null;
let win = null;
let quitting = false;
let stopped = false;

const logFile = () => path.join(app.getPath('userData'), 'sigma.log');
function log(message) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* logging must never crash the app */
  }
}

const secrets = () =>
  safeStorage.isEncryptionAvailable() && !process.env.SIGMA_PLAIN_CONFIG
    ? {
        protect: (s) => `safe:${safeStorage.encryptString(s).toString('base64')}`,
        reveal: (s) =>
          s.startsWith('safe:') ? safeStorage.decryptString(Buffer.from(s.slice(5), 'base64')) : s,
      }
    : {};

function splash(text) {
  const html = `<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#16161a;color:#e7e7ea;font-family:system-ui,sans-serif"><div style="font-size:28px;font-weight:700;letter-spacing:2px">SIGMA</div><div id="s" style="margin-top:14px;font-size:13px;color:#9a9aa5">${text}</div></body>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function buildMenu() {
  const sharing = runtime?.sharing ?? false;
  const template = [
    {
      label: 'SIGMA',
      submenu: [
        { label: 'Open SIGMA', click: () => (win ? win.show() : createWindow()) },
        {
          label: 'Open in browser',
          enabled: !!runtime,
          click: () => shell.openExternal(runtime.url),
        },
        { type: 'separator' },
        {
          label: 'Share on this network',
          type: 'checkbox',
          checked: sharing,
          enabled: !!runtime,
          click: (item) => void toggleSharing(item.checked),
        },
        {
          label: 'Copy link for teammates',
          enabled: !!runtime?.shareUrl,
          click: () => clipboard.writeText(runtime.shareUrl),
        },
        { type: 'separator' },
        { label: 'Back up now…', enabled: !!runtime, click: () => void backupNow() },
        { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { role: 'quit', label: 'Quit SIGMA' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function toggleSharing(on) {
  try {
    await runtime.setSharing(on);
    buildMenu();
    await win?.loadURL(runtime.url);
    if (on) {
      const link = runtime.shareUrl;
      await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Sharing is on',
        message: link
          ? `Teammates on the same network can open:\n\n${link}`
          : 'Sharing is on, but this computer has no network address right now.',
        detail: link
          ? 'The link was copied. Create accounts for them under your name (top right) → Users. Your firewall may ask to allow SIGMA.'
          : 'Connect to Wi-Fi or a network cable and try again.',
      });
      if (link) clipboard.writeText(link);
    }
  } catch (e) {
    log(`sharing failed: ${e.stack ?? e}`);
    dialog.showErrorBox('SIGMA', `Could not change sharing: ${e.message}`);
  }
}

async function backupNow() {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Choose where to save the backup',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (pick.canceled || !pick.filePaths[0]) return;
  try {
    const out = await runtime.backup(pick.filePaths[0]);
    await win?.loadURL(runtime.url);
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Backup complete',
      message: 'Your designs and images were saved to:',
      detail: out,
    });
  } catch (e) {
    log(`backup failed: ${e.stack ?? e}`);
    dialog.showErrorBox('SIGMA', `The backup did not complete: ${e.message}`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#16161a',
    title: 'SIGMA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Only the local app may load in this window; every other link opens in the system browser.
  const isLocal = (url) => !!runtime && url.startsWith(runtime.url);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) void shell.openExternal(url);
    return { action: isLocal(url) ? 'allow' : 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isLocal(url) && !url.startsWith('data:')) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.on('closed', () => (win = null));
  return win;
}

async function boot() {
  buildMenu();
  createWindow();
  await win.loadURL(splash('Starting…'));
  try {
    runtime = await startRuntime({
      dataDir: app.getPath('userData'),
      apiDir,
      webRoot,
      ...secrets(),
      log: (m) => {
        log(m);
        win?.webContents
          .executeJavaScript(
            `document.getElementById('s') && (document.getElementById('s').textContent = ${JSON.stringify(m)})`,
          )
          .catch(() => undefined);
      },
    });
    log(`SIGMA running at ${runtime.url}`);
    buildMenu();
    await win?.loadURL(runtime.url);
  } catch (e) {
    log(`startup failed: ${e.stack ?? e}`);
    dialog.showErrorBox(
      'SIGMA could not start',
      `${e.message}\n\nDetails were written to:\n${logFile()}`,
    );
    app.exit(1);
  }
}

ipcMain.handle('sigma:status', () => ({
  url: runtime?.url ?? null,
  sharing: runtime?.sharing ?? false,
  shareUrl: runtime?.shareUrl ?? null,
  version: app.getVersion(),
}));
ipcMain.handle('sigma:set-sharing', (_e, on) => toggleSharing(!!on));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(boot);
  app.on('activate', () => {
    if (!win && runtime) createWindow().loadURL(runtime.url);
  });
  app.on('window-all-closed', () => {
    if (!quitting) app.quit();
  });
  // Stop the server and the database cleanly before the process exits.
  app.on('before-quit', (e) => {
    if (stopped || !runtime) return;
    // Hold every quit request until the server and database have stopped.
    e.preventDefault();
    if (quitting) return;
    quitting = true;
    // Close the window first so its connections do not hold the server open, and never let a
    // stuck shutdown keep the app alive.
    for (const w of BrowserWindow.getAllWindows()) w.destroy();
    log('Quitting…');
    const hardStop = setTimeout(() => app.exit(0), 20_000);
    runtime
      .stop()
      .catch((err) => log(`shutdown: ${err}`))
      .finally(() => {
        clearTimeout(hardStop);
        stopped = true;
        app.exit(0);
      });
  });
}
