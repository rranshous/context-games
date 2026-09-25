import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const serverConfig = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  platform: 'node',
  entryPoints: ['src/sim/main.ts'],
  outfile: 'dist/sim.js',
  packages: 'external',
  banner: {
    js: `import { createRequire } from 'module';const require = createRequire(import.meta.url);`,
  },
};

const viewServerConfig = {
  ...serverConfig,
  entryPoints: ['src/view/serve.ts'],
  outfile: 'dist/view.js',
};

const cliConfig = {
  ...serverConfig,
  entryPoints: ['src/cli/qw.ts'],
  outfile: 'dist/qw.js',
};

const benchConfig = {
  ...serverConfig,
  entryPoints: ['src/sim/bench.ts'],
  outfile: 'dist/bench.js',
};

const clientConfig = {
  bundle: true,
  sourcemap: true,
  target: 'es2022',
  format: 'esm',
  platform: 'browser',
  entryPoints: ['src/view/client/main.ts'],
  outfile: 'dist/client/main.js',
};

async function build() {
  if (watch) {
    for (const cfg of [serverConfig, viewServerConfig, cliConfig, clientConfig]) {
      await (await esbuild.context(cfg)).watch();
    }
    console.log('Watching sim + view for changes...');
  } else {
    await Promise.all([serverConfig, viewServerConfig, cliConfig, benchConfig, clientConfig].map(c => esbuild.build(c)));
    console.log('Build complete (sim + view).');
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
