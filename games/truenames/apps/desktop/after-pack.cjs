// electron-builder afterPack hook (Linux): wrap the binary in a launcher that passes --no-sandbox.
// Ubuntu 24.04+ blocks Chromium's sandbox for apps that aren't installed system-wide, and Chromium checks before
// the app's own code runs, so the flag must be on the command line. The window only loads the app's own pages.
const { renameSync, writeFileSync, chmodSync, existsSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'linux') return;
  const bin = join(ctx.appOutDir, 'truenames');
  if (!existsSync(bin)) return;
  renameSync(bin, `${bin}-bin`);
  writeFileSync(bin, '#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/truenames-bin" --no-sandbox "$@"\n');
  chmodSync(bin, 0o755);
};
