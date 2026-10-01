// Builds the desktop app: the game (Vite) into ./game, and the main process (esbuild) into ./dist/main.cjs.
// Everything the main process needs is bundled, so the packaged app carries no node_modules.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);

// 1. the game, built for production (the same client the browser runs)
rmSync(`${here}game`, { recursive: true, force: true });
execFileSync(`${root}node_modules/.bin/vite`, ['build', 'apps/game', '--outDir', `${here}game`, '--emptyOutDir'], { cwd: root, stdio: 'inherit' });

// 2. the main process: Electron shell + the dungeon, one CommonJS bundle
mkdirSync(`${here}dist`, { recursive: true });
await build({
  entryPoints: [`${here}src/main.ts`],
  outfile: `${here}dist/main.cjs`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'bufferutil', 'utf-8-validate'],
  logLevel: 'info',
});
copyFileSync(require.resolve('@truenames/proofs/artifacts/name.vkey.json', { paths: [`${root}apps/dungeon`] }), `${here}dist/name.vkey.json`);
console.log('[desktop] built: game/ and dist/main.cjs');
