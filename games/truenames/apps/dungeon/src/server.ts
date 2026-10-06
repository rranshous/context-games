// The dungeon as its own process (development): `corepack pnpm dungeon`, or with the game via `pnpm dev`.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadKey } from '@truenames/channel/node';
import { startDungeon } from './host.ts';

const require = createRequire(import.meta.url);
const vkey = JSON.parse(readFileSync(require.resolve('@truenames/proofs/artifacts/name.vkey.json'), 'utf8'));
const key = loadKey(process.env.DUNGEON_KEY ?? fileURLToPath(new URL('../../../.keys/dungeon.key', import.meta.url)));
await startDungeon({ port: Number(process.env.DUNGEON_PORT ?? 5192), vkey, key });
