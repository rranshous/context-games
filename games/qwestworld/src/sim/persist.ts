// persist.ts — save/load the living world. The land itself regenerates from the seed.

import fs from 'fs';
import path from 'path';
import { World, WorldOptions } from './world.js';

const VERSION = 2;

const b64 = (a: ArrayBufferView, bytes: number) => Buffer.from(a.buffer, a.byteOffset, bytes).toString('base64');

function into(target: ArrayBufferView, s: string) {
  const buf = Buffer.from(s, 'base64');
  const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
  bytes.set(buf.subarray(0, Math.min(buf.length, bytes.length)));
}

export function saveWorld(w: World, file: string) {
  const n = w.high;
  const data = {
    version: VERSION,
    seed: w.map.seed,
    settlements: w.map.settlements.length,
    age: w.age,
    tick: w.tick,
    endsAt: w.endsAt,
    high: n,
    soldiers: {
      x: b64(w.sx, n * 4), y: b64(w.sy, n * 4), f: b64(w.sf, n),
      army: b64(w.sArmy, n * 4), home: b64(w.sHome, n * 2), speed: b64(w.sSpeed, n * 4),
    },
    owner: Array.from(w.owner),
    siege: Array.from(w.siege),
    siegeBy: Array.from(w.siegeBy),
    takenAt: Array.from(w.takenAt),
    realms: w.realms.map(r => ({ ...r, thinking: false })),
    war: b64(w.war, w.war.byteLength),
    treaty: b64(w.treaty, w.treaty.byteLength),
    warSince: b64(w.warSince, w.warSince.byteLength),
    peaceOffers: w.peaceOffers,
    allied: b64(w.allied, w.allied.byteLength),
    allianceOffers: w.allianceOffers,
    envoys: w.envoys,
    caravans: w.caravans,
    armies: [...w.armies.values()],
    nextArmyId: w.nextArmyId,
    orders: w.orders,
    chronicle: w.chronicle,
    history: w.history,
    annals: w.annals,
    names: [...w.names.used],
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export function loadWorld(file: string, opts: WorldOptions): World | null {
  if (!fs.existsSync(file)) return null;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.version !== VERSION) {
    const old = `${file}.v${d.version ?? 1}.bak`;
    fs.renameSync(file, old);
    console.log(`[sim] save is from an older world (v${d.version ?? 1}); set aside as ${path.basename(old)}, starting fresh`);
    return null;
  }
  process.env.SETTLEMENTS = String(d.settlements);
  const w = new World(d.seed, d.age, { ...opts, brains: d.realms.map((r: any) => r.brain) });
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
  if (d.takenAt) w.takenAt.set(d.takenAt);
  w.realms = d.realms;
  // Older saves could carry a ruler named like "Halis 49" from an exhausted name pool
  for (const r of w.realms) r.ruler.name = r.ruler.name.replace(/ \d+$/, '');
  into(w.war, d.war);
  into(w.treaty, d.treaty);
  if (d.warSince) into(w.warSince, d.warSince);
  w.peaceOffers = d.peaceOffers;
  if (d.allied) into(w.allied, d.allied);
  w.allianceOffers = d.allianceOffers ?? [];
  w.envoys = d.envoys;
  w.caravans = d.caravans ?? [];
  for (const a of d.armies) w.armies.set(a.id, a);
  w.nextArmyId = d.nextArmyId;
  w.orders = d.orders;
  w.chronicle = d.chronicle;
  w.history = d.history ?? [];
  w.annals = d.annals ?? [];
  for (const n of d.names ?? []) w.names.used.add(n);
  w.rebuildDerived();
  // A council that was mid-thought when we stopped gets called again
  for (const r of w.realms) if (r.nextCouncil < w.tick) r.nextCouncil = w.tick;
  return w;
}
