import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  loader: { '.warrior': 'text' },
};

const targets = [
  { ...shared, entryPoints: ['src/main.ts'], outfile: 'dist/main.js', platform: 'browser' },
  { ...shared, entryPoints: ['src/headless.ts'], outfile: 'dist/headless.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/evolve.ts'], outfile: 'dist/evolve.mjs', platform: 'node' },
];

async function build() {
  if (watch) {
    for (const t of targets) await (await esbuild.context(t)).watch();
    console.log('Watching for changes...');
  } else {
    await Promise.all(targets.map((t) => esbuild.build(t)));
    console.log('Build complete.');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
