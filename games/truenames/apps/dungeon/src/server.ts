// The dungeon as its own process (development): `corepack pnpm dungeon`, or with the game via `pnpm dev`.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startDungeon } from './host.ts';

const require = createRequire(import.meta.url);
const vkey = JSON.parse(readFileSync(require.resolve('@truenames/proofs/artifacts/name.vkey.json'), 'utf8'));
await startDungeon({ port: Number(process.env.DUNGEON_PORT ?? 5192), vkey });
