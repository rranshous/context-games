// A worker of the parallel engine (src/par.ts): holds a whole replica of the world, runs
// the turns and upkeeps it's dealt, sends what they changed, and applies everyone else's.
import { parentPort, workerData } from 'node:worker_threads';
import { applyBatch, Batch, Recorder, relabel } from './sim/replica';
import { planUpkeep, Share } from './sim/schedule';
import { loadWorld } from './sim/save';
import { World } from './sim/world';

const { k: me, K, bytes } = workerData as { k: number; K: number; bytes: Uint8Array };
const world: World = loadWorld(bytes);
const rec = new Recorder(world, me);
world.track = rec;
const port = parentPort!;
const debug = process.env.PAR_DEBUG ? (...a: unknown[]) => console.error(`[w${me} t${world.t} p${phase}]`, ...a) : () => {};

let phase = -1, done = 0, base = 0;
const applied = new Int32Array(K);
let births: number[] = [];
let wake: (() => void) | null = null;

function send(b: Batch) {
  if (b.births.length) births = births.concat(b.births);
  port.postMessage({ type: 'batch', b }, [b.cells.buffer as ArrayBuffer]);
}

/** Run my share of a phase: each one after the remote turns it overlaps are in. */
async function run(share: Share, upkeep: boolean) {
  const { ids, pos, waitOff, waitK, waitPos, flush } = share;
  for (let j = 0; j < ids.length; j++) {
    for (let q = waitOff[j]; q < waitOff[j + 1]; q++) {
      if (applied[waitK[q]] < waitPos[q]) debug('wait', waitK[q], waitPos[q], 'have', applied[waitK[q]]);
      while (applied[waitK[q]] < waitPos[q]) await new Promise<void>((r) => { wake = r; });
    }
    const p = pos[j], wr = world.warriors[ids[j]];
    rec.pos = p;
    if (wr.alive) {
      rec.body(wr.id);
      if (upkeep) world.upkeep(wr); else world.turn(wr);
      rec.after(p);
    }
    if (flush[j]) send(rec.flush(phase, p, false));
  }
  send(rec.flush(phase, 1 << 30, true));
  finished();
}

/** One more worker (maybe me) is through the phase; when all are, move on. */
function finished() {
  debug('finished', done + 1, 'of', K);
  if (++done < K) return;
  if (phase % 2 === 0) {
    relabel(world, base, births);
    startUpkeep();
  } else {
    world.checkOver();
  }
}

function startPhase(p: number) {
  phase = p; done = 0; births = []; applied.fill(-1);
}

function startUpkeep() {
  world.track = undefined; // (the plan reads the world; then upkeeps are tracked again)
  const plan = planUpkeep(world, world.living().slice(), K);
  world.track = rec;
  startPhase(plan.phase);
  rec.begin(0, 0);
  void run(plan.shares[me], true);
}

port.on('message', (m: { type: string; [k: string]: unknown }) => {
  if (m.type === 'serial') {
    debug('serial'); world.track = undefined; world.tick(); world.track = rec; world.events.length = 0; debug('serial done'); port.postMessage({ type: 'ok', t: world.t }); return; }
  if (m.type === 'begin') {
    world.track = undefined;
    if (world.beginTick()) { world.regrow(); world.drift(); }
    world.track = rec;
    world.events.length = 0;
    return;
  }
  if (m.type === 'turns') {
    const slots = m.slots as Int32Array;
    base = m.base as number;
    const end = slots[slots.length - 1];
    for (let i = world.warriors.length; i < end; i++) world.warriors.push(null as never);
    startPhase(m.phase as number);
    rec.begin(slots[me * 2], slots[me * 2 + 1]);
    debug('turns', (m.share as Share).ids.length);
    void run(m.share as Share, false);
    return;
  }
  if (m.type === 'batch') {
    const b = m.b as Batch;
    debug('batch from', b.from, 'phase', b.phase, 'upTo', b.upTo, b.done ? 'done' : '');
    if (b.phase !== phase) throw new Error(`par worker ${me}: batch for phase ${b.phase} during ${phase}`);
    applyBatch(world, b);
    if (b.births.length) births = births.concat(b.births);
    applied[b.from] = b.upTo;
    if (wake) { const w = wake; wake = null; w(); }
    if (b.done) finished();
  }
});
port.postMessage({ type: 'ready' });
