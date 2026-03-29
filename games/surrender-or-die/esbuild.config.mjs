import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const serverConfig = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  platform: 'node',
  entryPoints: ['src/server/app.ts'],
  outfile: 'dist/server.js',
  packages: 'external', // don't bundle node_modules (express, etc.)
  banner: {
    // ESM compat for __dirname
    js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`,
  },
};

const botConfig = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  platform: 'node',
  entryPoints: ['src/bot/bot.ts'],
  outfile: 'dist/bot.js',
  packages: 'external',
};

const clientConfig = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  platform: 'browser',
  entryPoints: ['src/client/main.ts'],
  outfile: 'dist/client/main.js',
};

async function build() {
  if (watch) {
    const serverCtx = await esbuild.context(serverConfig);
    const clientCtx = await esbuild.context(clientConfig);
    await serverCtx.watch();
    await clientCtx.watch();
    console.log('Watching server + client for changes...');
  } else {
    await Promise.all([
      esbuild.build(serverConfig),
      esbuild.build(clientConfig),
      esbuild.build(botConfig),
    ]);
    console.log('Build complete (server + client + bot).');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
