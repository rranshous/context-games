// Truenames as a desktop app: one window holding the game, with its own dungeon running in-process.
// No server required. Friends on the LAN can walk into this machine's worlds (the dungeon listens on every
// interface), and this window can walk into theirs (the sanctum's "worlds" field).
//
// Profiles: `--profile=<name>` gives an instance its own save (aura, words) and its own ports, so several can
// run on one machine (later: one per chorister). The page's origin must be stable per profile, because the
// save lives in that origin's IndexedDB; so the ports are fixed per profile, not "any free port".
import { app, BrowserWindow, shell } from 'electron';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { startDungeon } from '../../dungeon/src/host.ts';

// Linux: Ubuntu 24.04+ restricts the user namespaces Chromium's sandbox needs, and Chromium checks before this script
// runs, so `--no-sandbox` must be a launch argument: `pnpm desktop` passes it, and electron-builder's AppImage launcher
// adds it when the sandbox can't work. Acceptable here: the window only ever loads this app's own pages (127.0.0.1).

const profile = (process.argv.find((a) => a.startsWith('--profile='))?.slice('--profile='.length) || 'default').replace(/[^\w-]/g, '');
app.setPath('userData', join(app.getPath('appData'), 'Truenames', profile === 'default' ? 'default' : `profile-${profile}`));

/** Fixed ports per profile: the default instance uses 47190/47191; others hash their name into the range above. */
function portsFor(name: string): { ui: number; dungeon: number } {
  if (name === 'default') return { ui: 47190, dungeon: 47191 };
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const base = 47200 + (h % 400) * 2;
  return { ui: base, dungeon: base + 1 };
}
const PORTS = portsFor(profile);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.zkey': 'application/octet-stream',
};

/** Serve the built game from this app's files, on 127.0.0.1 only. */
function serveGame(dir: string, port: number): Promise<void> {
  return new Promise((res, rej) => {
    const server = createServer((req, reply) => {
      const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(/^(\.\.[/\\])+/, '');
      let file = join(dir, path);
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
      reply.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      createReadStream(file).pipe(reply);
    });
    server.once('error', rej);
    server.listen(port, '127.0.0.1', () => res());
  });
}

/** The address LAN friends would type to walk into this machine's worlds. */
function lanAddress(port: number): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) return `${i.address}:${port}`;
  }
  return null;
}

if (!app.requestSingleInstanceLock()) {
  // this profile is already open: focus it instead of opening a second window onto the same save
  app.quit();
} else {
  let win: BrowserWindow | null = null;
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    const gameRoot = join(__dirname, '..', 'game'); // inside app.asar when packaged (Electron's fs reads it)
    const vkey = JSON.parse(readFileSync(join(__dirname, 'name.vkey.json'), 'utf8'));
    let dungeonOk = true;
    try {
      await startDungeon({ port: PORTS.dungeon, vkey });
    } catch (e) {
      dungeonOk = false;
      console.error('[desktop] the dungeon could not start', e);
    }
    await serveGame(gameRoot, PORTS.ui);
    win = new BrowserWindow({
      width: 1440, height: 900, backgroundColor: '#07060c', autoHideMenuBar: true,
      title: profile === 'default' ? 'Truenames' : `Truenames · ${profile}`,
    });
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    const lan = lanAddress(PORTS.dungeon);
    const q = new URLSearchParams({ dungeon: `ws://127.0.0.1:${PORTS.dungeon}`, ...(lan && dungeonOk ? { lan } : {}), ...(profile !== 'default' ? { profile } : {}) });
    await win.loadURL(`http://127.0.0.1:${PORTS.ui}/?${q}`);
  });
  app.on('window-all-closed', () => app.quit());
}
