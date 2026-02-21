import * as esbuild from 'esbuild';
import { cpSync } from 'fs';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
};

async function build() {
  // Copy index.html to output
  cpSync('src/index.html', 'index.html');

  if (watch) {
    const mainCtx = await esbuild.context({
      ...shared,
      entryPoints: ['src/visualizer/main.ts'],
      outfile: 'main.js',
    });
    const workerCtx = await esbuild.context({
      ...shared,
      entryPoints: ['src/sim/worker.ts'],
      outfile: 'worker.js',
    });
    await Promise.all([mainCtx.watch(), workerCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([
      esbuild.build({
        ...shared,
        entryPoints: ['src/visualizer/main.ts'],
        outfile: 'main.js',
      }),
      esbuild.build({
        ...shared,
        entryPoints: ['src/sim/worker.ts'],
        outfile: 'worker.js',
      }),
    ]);
    console.log('Build complete.');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
