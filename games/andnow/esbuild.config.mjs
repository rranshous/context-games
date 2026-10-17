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
  { ...shared, entryPoints: ['src/check.ts'], outfile: 'dist/check.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/map-elites.ts'], outfile: 'dist/map.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/petri.ts'], outfile: 'dist/petri.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/probe.ts'], outfile: 'dist/probe.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/dishes.ts'], outfile: 'dist/dishes.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/safari.ts'], outfile: 'dist/safari.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/look.ts'], outfile: 'dist/look.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/bake.ts'], outfile: 'dist/bake.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/bench.ts'], outfile: 'dist/bench.mjs', platform: 'node' },
  { ...shared, entryPoints: ['src/diet.ts'], outfile: 'dist/diet.mjs', platform: 'node' },
  // Potluck task module: runs in browsers, so no Node built-ins and no source map comment.
  { ...shared, sourcemap: false, entryPoints: ['src/farm-task.ts'], outfile: 'dist/farm-task.mjs', platform: 'browser' },
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
