// main.ts — the sim daemon. Runs the world forever, saves it, and answers anyone who looks in.
//
// No rendering here, and no static files: viewers are separate processes (or
// separate machines) that connect over HTTP and can come and go freely.

import express from 'express';
import path from 'path';
import { World } from './world.js';
import { Court, Brain } from './court.js';
import { saveWorld, loadWorld } from './persist.js';
import { MetaResponse } from '../shared/types.js';

const PORT = parseInt(process.env.PORT ?? '4200', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const TPS = parseFloat(process.env.TICKS_PER_SEC ?? '12');
const DATA = process.env.DATA_DIR ?? path.resolve('data');
const SAVE_FILE = path.join(DATA, 'world.json');
const BRAINS = (process.env.KINGS ?? 'qwen,qwen,script,script').split(',').map(s => s.trim() as Brain);

let world: World = loadWorld(SAVE_FILE) ?? freshWorld(parseInt(process.env.SEED ?? `${Date.now() % 100000}`, 10), 1);
const court = new Court(() => world, BRAINS);
let paused = false;
let stepMs = 0;

console.log(`[sim] Age ${world.age}, seed ${world.map.seed}, ${world.map.settlements.length} settlements, day ${Math.floor(world.tick / 24)}`);
console.log(`[sim] kings: ${world.map.kingdoms.map((k, i) => `${k.king} (${BRAINS[i] ?? 'script'})`).join(', ')}`);

function freshWorld(seed: number, age: number): World {
  const w = new World(seed, age);
  w.populate();
  return w;
}

// ---------------------------------------------------------------- the loop

setInterval(() => {
  if (paused) return;
  if (court.stalledBy()) { court.tick(); return; }
  const t0 = performance.now();
  world.step();
  court.tick();
  stepMs = stepMs * 0.95 + (performance.now() - t0) * 0.05;

  if (world.endsAt >= 0 && world.tick >= world.endsAt) {
    const next = freshWorld(world.map.seed + 1, world.age + 1);
    world = next;
    staticCache = null;
    console.log(`[sim] A new age dawns: Age ${world.age}, seed ${world.map.seed}`);
  }
}, 1000 / TPS);

const save = () => {
  try { saveWorld(world, SAVE_FILE); } catch (e: any) { console.error('[sim] save failed', e.message); }
};
setInterval(save, 2 * 60 * 1000);
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { save(); console.log('[sim] saved, goodbye'); process.exit(0); });
}

// ---------------------------------------------------------------- the API

let staticCache: { age: number; meta: MetaResponse; terrain: Buffer; regions: Buffer } | null = null;
function statics() {
  if (!staticCache || staticCache.age !== world.age) {
    const m = world.map;
    staticCache = {
      age: world.age,
      meta: {
        w: 1024, h: 576, seed: m.seed, age: world.age,
        settlements: m.settlements.map(s => ({ id: s.id, name: s.name, x: s.x, y: s.y, capital: s.capital })),
      },
      terrain: Buffer.concat([Buffer.from(m.terrain), Buffer.from(m.height)]),
      regions: Buffer.from(m.region.buffer, m.region.byteOffset, m.region.byteLength),
    };
  }
  return staticCache;
}

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  next();
});

app.get('/api/meta', (_req, res) => res.json(statics().meta));
app.get('/api/terrain.bin', (_req, res) => res.type('application/octet-stream').send(statics().terrain));
app.get('/api/regions.bin', (_req, res) => res.type('application/octet-stream').send(statics().regions));
app.get('/api/state', (_req, res) => res.json(world.view(court.stalledBy(), BRAINS)));
app.get('/api/soldiers.bin', (_req, res) => res.type('application/octet-stream').send(world.soldiersBinary()));
app.get('/api/health', (_req, res) => res.json({
  tick: world.tick, age: world.age, paused, stalledBy: court.stalledBy(),
  soldiers: world.high - 0, stepMs: +stepMs.toFixed(2), tps: TPS,
}));
app.get('/api/kings/:id/context', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id >= 0 && id < world.kingdoms.length)) return res.status(404).json({ error: 'no such king' });
  res.json(court.contextFor(id));
});
app.options('/api/control', (_req, res) => res.sendStatus(204));
app.post('/api/control', (req, res) => {
  const { action } = req.body ?? {};
  if (action === 'pause') paused = true;
  else if (action === 'resume') paused = false;
  else return res.status(400).json({ error: 'action must be pause or resume' });
  console.log(`[sim] ${action}d by a viewer`);
  res.json({ paused });
});

app.listen(PORT, HOST, () => console.log(`[sim] listening on http://${HOST}:${PORT}`));
