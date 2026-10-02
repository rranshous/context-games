// The dungeon as its own process (development): `corepack pnpm dungeon`, or with the game via `pnpm dev`.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startDungeon } from './host.ts';

const require = createRequire(import.meta.url);
const vkey = JSON.parse(readFileSync(require.resolve('@truenames/proofs/artifacts/name.vkey.json'), 'utf8'));
// issues reported by actants and the explorer land here (gitignored), for whoever is building the game
const issues = process.env.TRUENAMES_ISSUES ?? fileURLToPath(new URL('../../../actant-issues.jsonl', import.meta.url));
await startDungeon({ port: Number(process.env.DUNGEON_PORT ?? 5192), vkey, issues });
