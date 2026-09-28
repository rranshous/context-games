// Builds the name-claim circuit: generate .circom → compile (circom2, WASM) → dev Groth16 ceremony.
// DEV CEREMONY: the toxic waste is random and discarded, but a single local party ran it.
// Fine for a local game; a shared world needs a real multi-party ceremony (or a transparent system).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, statSync, rmSync, renameSync, realpathSync, cpSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { circuitSource } from './gen-circuit.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const art = `${root}artifacts/`;
const bin = (n: string) => `${root}node_modules/.bin/${n}`;
const run = (cmd: string, args: string[]) => {
  console.log(`$ ${cmd.split('/').pop()} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], cwd: root });
};

export function buildCircuit(opts: { power?: number } = {}) {
  mkdirSync(`${root}circuits`, { recursive: true });
  mkdirSync(art, { recursive: true });
  writeFileSync(`${root}circuits/name.circom`, circuitSource());
  // circom2 runs under WASI and only sees the working directory: vendor circomlib's circuits there
  cpSync(`${realpathSync(`${root}node_modules/circomlib`)}/circuits`, `${root}circuits/vendor/circomlib/circuits`, { recursive: true });
  run(bin('circom2'), ['circuits/name.circom', '--r1cs', '--wasm', '-l', 'circuits/vendor', '-o', 'artifacts']);
  // circom writes artifacts/name_js/name.wasm
  renameSync(`${art}name_js/name.wasm`, `${art}name.wasm`);
  rmSync(`${art}name_js`, { recursive: true, force: true });
  run(bin('snarkjs'), ['r1cs', 'info', 'artifacts/name.r1cs']);
  const power = opts.power ?? 15;
  const e = () => randomBytes(32).toString('hex');
  run(bin('snarkjs'), ['powersoftau', 'new', 'bn128', String(power), 'artifacts/pot0.ptau']);
  run(bin('snarkjs'), ['powersoftau', 'contribute', 'artifacts/pot0.ptau', 'artifacts/pot1.ptau', '-n=dev', `-e=${e()}`]);
  run(bin('snarkjs'), ['powersoftau', 'prepare', 'phase2', 'artifacts/pot1.ptau', 'artifacts/pot.ptau']);
  run(bin('snarkjs'), ['groth16', 'setup', 'artifacts/name.r1cs', 'artifacts/pot.ptau', 'artifacts/name0.zkey']);
  run(bin('snarkjs'), ['zkey', 'contribute', 'artifacts/name0.zkey', 'artifacts/name.zkey', '-n=dev', `-e=${e()}`]);
  run(bin('snarkjs'), ['zkey', 'export', 'verificationkey', 'artifacts/name.zkey', 'artifacts/name.vkey.json']);
  for (const f of ['pot0.ptau', 'pot1.ptau', 'pot.ptau', 'name0.zkey', 'name.r1cs']) rmSync(art + f, { force: true });
  for (const f of ['name.wasm', 'name.zkey', 'name.vkey.json']) console.log(`${f}: ${(statSync(art + f).size / 1024).toFixed(0)} KB`);
}

export function artifactsExist() {
  return ['name.wasm', 'name.zkey', 'name.vkey.json'].every((f) => existsSync(art + f));
}
