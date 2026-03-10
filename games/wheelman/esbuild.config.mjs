import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  outfile: 'dist/main.js',
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(config);
  console.log('Build complete.');
}
