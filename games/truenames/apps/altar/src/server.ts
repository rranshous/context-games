// An altar as its own process (development): `corepack pnpm altar`, or with the game and a dungeon via `pnpm dev`.
import { fileURLToPath } from 'node:url';
import { loadKey } from '@truenames/channel/node';
import { startAltar } from './altar.ts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
await startAltar({
  port: Number(process.env.ALTAR_PORT ?? 5193),
  key: loadKey(process.env.ALTAR_KEY ?? root('.keys/altar.key')),
  name: process.env.ALTAR_NAME ?? 'the dev altar',
  // issues reported by actants and the explorer land here (gitignored), for whoever is building the game
  issues: process.env.TRUENAMES_ISSUES ?? root('actant-issues.jsonl'),
});
