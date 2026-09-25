// persist.ts — save/load the living world. The map itself regenerates from the seed.

import fs from 'fs';
import path from 'path';
import { DEAD } from '../shared/types.js';
import { World } from './world.js';

const b64 = (a: ArrayBufferView, n: number, bytesPer: number) =>
  Buffer.from(a.buffer, a.byteOffset, n * bytesPer).toString('base64');

function into<T extends Float32Array | Uint8Array | Int32Array | Uint16Array | Int8Array>(target: T, s: string) {
  const buf = Buffer.from(s, 'base64');
  const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
  bytes.set(buf.subarray(0, Math.min(buf.length, bytes.length)));
}

export function saveWorld(w: World, file: string) {
  const n = w.high;
  const data = {
    version: 1,
    seed: w.map.seed,
    age: w.age,
    tick: w.tick,
    endsAt: w.endsAt,
    high: n,
    soldiers: {
      x: b64(w.sx, n, 4), y: b64(w.sy, n, 4), f: b64(w.sf, n, 1),
      army: b64(w.sArmy, n, 4), home: b64(w.sHome, n, 2), speed: b64(w.sSpeed, n, 4),
    },
    owner: Array.from(w.owner),
    siege: Array.from(w.siege),
    siegeBy: Array.from(w.siegeBy),
    armies: [...w.armies.values()],
    nextArmyId: w.nextArmyId,
    orders: w.orders,
    kingdoms: w.kingdoms.map(k => ({ ...k, thinking: false })),
    chronicle: w.chronicle,
    names: [...w.names.used],
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export function loadWorld(file: string): World | null {
  if (!fs.existsSync(file)) return null;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.version !== 1) return null;
  const w = new World(d.seed, d.age);
  w.tick = d.tick;
  w.endsAt = d.endsAt;
  w.high = d.high;
  into(w.sx, d.soldiers.x);
  into(w.sy, d.soldiers.y);
  into(w.sf, d.soldiers.f);
  into(w.sArmy, d.soldiers.army);
  into(w.sHome, d.soldiers.home);
  into(w.sSpeed, d.soldiers.speed);
  w.owner.set(d.owner);
  w.siege.set(d.siege);
  w.siegeBy.set(d.siegeBy);
  for (const a of d.armies) w.armies.set(a.id, a);
  w.nextArmyId = d.nextArmyId;
  w.orders = d.orders;
  w.kingdoms = d.kingdoms.map((k: any) => ({ reign: [], turns: [], ...k, journal: undefined }));
  for (const n of d.names ?? []) w.names.used.add(n);
  for (const a of w.armies.values()) w.names.used.add(a.general);
  for (const k of w.map.kingdoms) w.names.used.add(k.king);
  w.chronicle = d.chronicle;
  for (const e of w.chronicle) for (const m of e.text.matchAll(/General (\w+)/g)) w.names.used.add(m[1]);
  w.rebuildDerived();
  // A council that was mid-thought when we stopped gets called again
  for (const k of w.kingdoms) if (k.nextCouncil < w.tick) k.nextCouncil = w.tick;
  return w;
}

export { DEAD };
