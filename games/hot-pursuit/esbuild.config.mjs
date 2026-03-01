import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
};

async function build() {
  if (watch) {
    const ctx = await esbuild.context({
      ...shared,
      entryPoints: ['src/main.ts'],
      outfile: 'main.js',
    });
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build({
      ...shared,
      entryPoints: ['src/main.ts'],
      outfile: 'main.js',
    });
    console.log('Build complete.');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
