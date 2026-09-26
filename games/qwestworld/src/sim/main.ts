// main.ts — the sim daemon. Runs the world forever, saves it, and answers anyone who looks in.
//
// No rendering here, and no static files: viewers are separate processes (or
// separate machines) that connect over HTTP and can come and go freely.

import express from 'express';
import path from 'path';
import { World } from './world.js';
import { Court, resolveBrain } from './court.js';
import { saveWorld, loadWorld } from './persist.js';
import { MetaResponse, MAP_W, MAP_H } from '../shared/types.js';

const PORT = parseInt(process.env.PORT ?? '4200', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const TPS = parseFloat(process.env.TICKS_PER_SEC ?? '12');
const DATA = process.env.DATA_DIR ?? path.resolve('data');
const SAVE_FILE = path.join(DATA, 'world.json');
// One brain per founding realm: 'script', 'qwen', 'llama', or any Ollama model name
const BRAINS = (process.env.KINGS ?? 'qwen,qwen,llama,llama,qwen3:1.7b,script').split(',').map(resolveBrain);
const REBEL_BRAIN = resolveBrain(process.env.REBEL_BRAIN ?? 'llama');
const OPTS = { brains: BRAINS, rebelBrain: REBEL_BRAIN };
const SLOW_WHILE_WAITING = 8; // when a mind is overdue, time runs this many times slower

let world: World = loadWorld(SAVE_FILE, OPTS) ?? freshWorld(parseInt(process.env.SEED ?? `${Date.now() % 100000}`, 10), 1);
const court = new Court(() => world);
let paused = false;
let stepMs = 0;

console.log(`[sim] Age ${world.age}, seed ${world.map.seed}, ${world.map.settlements.length} settlements, day ${Math.floor(world.tick / 24)}`);
console.log(`[sim] rulers: ${world.realms.map(r => `${world.ruler(r.id)} (${r.brain})`).join(', ')}`);

function freshWorld(seed: number, age: number): World {
  const w = new World(seed, age, OPTS);
  w.populate();
  return w;
}

// ---------------------------------------------------------------- the loop

let beat = 0;
setInterval(() => {
  if (paused) return;
  // Time slows, rather than stops, while the world waits on a mind
  if (court.stalledBy() && beat++ % SLOW_WHILE_WAITING !== 0) { court.tick(); return; }
  const t0 = performance.now();
  world.step();
  court.tick();
  stepMs = stepMs * 0.95 + (performance.now() - t0) * 0.05;

  if (world.endsAt >= 0 && world.tick >= world.endsAt) {
    // Keep the old age's history: its save, chronicle and annals, before a new world replaces it
    try { saveWorld(world, path.join(DATA, `age-${world.age}.json`)); } catch (e: any) { console.error('[sim] could not archive the age', e.message); }
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
        w: MAP_W, h: MAP_H, seed: m.seed, age: world.age,
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
app.get('/api/state', (_req, res) => res.json(world.view(court.stalledBy())));
app.get('/api/history', (_req, res) => res.json({
  realms: world.realms.map(r => ({ id: r.id, name: r.name, color: r.color })),
  samples: world.history,
}));
// Chronicle since a moment, for viewers catching up. ?since=<tick>&limit=<n>
app.get('/api/chronicle', (req, res) => {
  const since = parseInt(String(req.query.since ?? '0'), 10) || 0;
  const limit = Math.min(1000, parseInt(String(req.query.limit ?? '300'), 10) || 300);
  const entries = world.chronicle.filter(e => e.tick > since).slice(-limit)
    .map(({ tick, text, faction }) => ({ tick, text, faction }));
  res.json({ tick: world.tick, seed: world.map.seed, age: world.age, oldest: world.chronicle[0]?.tick ?? 0, entries });
});
app.get('/api/annals', (_req, res) => res.json(world.annals));
app.get('/api/soldiers.bin', (_req, res) => res.type('application/octet-stream').send(world.soldiersBinary()));
app.get('/api/health', (_req, res) => res.json({
  tick: world.tick, age: world.age, paused, stalledBy: court.stalledBy(),
  soldiers: world.high - 0, stepMs: +stepMs.toFixed(2), tps: TPS,
}));
app.get('/api/kings/:id/context', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!(id >= 0 && id < world.realms.length)) return res.status(404).json({ error: 'no such king' });
  res.json(court.contextFor(id));
});
app.options('/api/control', (_req, res) => res.sendStatus(204));
app.post('/api/control', (req, res) => {
  const { action, realm, brain } = req.body ?? {};
  if (action === 'pause') paused = true;
  else if (action === 'resume') paused = false;
  else if (action === 'brain') {
    // Hand a realm to a different mind (or to the script) without resetting the world
    const r = world.realms[Number(realm)];
    if (!r || typeof brain !== 'string') return res.status(400).json({ error: 'brain needs realm (id) and brain' });
    const was = r.brain;
    r.brain = resolveBrain(brain);
    r.turns = []; // a new mind does not inherit the old one's memory
    r.stats = undefined;
    console.log(`[sim] ${world.ruler(r.id)} of the ${r.name}: ${was} -> ${r.brain}`);
    return res.json({ realm: r.id, brain: r.brain });
  } else if (action === 'whisper') {
    // A voice from outside the world, heard at the ruler's next council
    const r = world.realms[Number(realm)];
    const text = String(req.body?.text ?? '').trim().slice(0, 300);
    if (!r || !r.alive || !text) return res.status(400).json({ error: 'whisper needs a living realm and text' });
    r.inbox.push(`A stranger at court whispers to you: “${text}”`);
    world.log(-1, [], `A cloaked stranger is seen at the court of ${world.ruler(r.id)}.`);
    console.log(`[sim] whisper to ${world.ruler(r.id)}: ${text}`);
    return res.json({ realm: r.id, queued: true });
  } else if (action === 'new-age') {
    // End this age now; the loop raises a new continent a few days later
    world.log(-1, [], `The gods tire of this age. The Age ${world.age} ends in ash and silence.`);
    world.endsAt = world.tick + 24 * 3;
    console.log('[sim] a new age was called for by a viewer');
    return res.json({ endsAt: world.endsAt });
  } else return res.status(400).json({ error: 'action must be pause, resume, brain, whisper or new-age' });
  console.log(`[sim] ${action}d by a viewer`);
  res.json({ paused });
});

app.listen(PORT, HOST, () => console.log(`[sim] listening on http://${HOST}:${PORT}`));
