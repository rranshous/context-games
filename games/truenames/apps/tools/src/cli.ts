export {};
const [cmd, ...args] = process.argv.slice(2);
const cmds: Record<string, () => Promise<void> | void> = {
  bench: async () => (await import('./bench.ts')).bench(),
  'bench-wasm': async () => (await import('./bench.ts')).benchWasm(),
  'gen-wasm': async () => (await import('./gen-wasm.ts')).genWasm(),
  sim: async () => (await import('./sim.ts')).sim(),
  vectors: async () => (await import('./vectors.ts')).vectors(args),
  'god-finder': async () => (await import('./godfinder.ts')).godFinder(args),
};
if (!cmd || !cmds[cmd]) { console.log(`usage: pnpm tools <${Object.keys(cmds).join('|')}> [args]`); process.exit(1); }
await cmds[cmd]();
