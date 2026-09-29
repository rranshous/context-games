// The sanctum side of the threshold: the only place secrets meet the game.
// For each bound name, prove it in zero knowledge (in a worker) against the round's context.
import type { App } from './main.ts';
import type { Journey, RoundTicket } from './round.ts';
import type { ZkNameClaim } from '@truenames/proofs';
import { spiritOf } from './save.ts';
import { SLOTS, COUNCIL } from '@truenames/dungeon/balance';
import { spiritName } from './lore.ts';
import ProverWorker from './prover.worker.ts?worker';

export interface ProveJob {
  id: number;
  cell: string;
  nonce: string;
  secret: string; // hex; stays on this machine (worker is same-origin)
  magnitude: number;
  strength: number;
  context: string;
}

export type ProveReply = { id: number; ok: true; claim: ZkNameClaim; ms: number } | { id: number; ok: false; error: string };

// A small pool of prover workers: names are proven in parallel (a Council deck can hold twelve).
const PROVERS = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
const workers: { w: Worker; busy: boolean }[] = [];
const queue: { job: ProveJob; res: (r: ProveReply) => void }[] = [];
let seq = 0;
const waiting = new Map<number, (r: ProveReply) => void>();

function pump() {
  while (workers.length < PROVERS) {
    const w = new ProverWorker();
    const slot = { w, busy: false };
    w.onmessage = (e: MessageEvent<ProveReply>) => {
      slot.busy = false;
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
      pump();
    };
    workers.push(slot);
  }
  for (const slot of workers) {
    if (slot.busy || !queue.length) continue;
    const { job, res } = queue.shift()!;
    slot.busy = true;
    waiting.set(job.id, res);
    slot.w.postMessage(job);
  }
}

function prove(job: Omit<ProveJob, 'id'>): Promise<ProveReply> {
  return new Promise((res) => {
    queue.push({ job: { ...job, id: ++seq }, res });
    pump();
  });
}

/** Which names this world carries: the four-slot loadout, or the Council deck. */
function boundFor(app: App, world: RoundTicket['world']): { cell: string; slot: number }[] {
  const cells = world === 'council' ? (app.save.councilDeck ?? []).slice(0, COUNCIL.deckMax) : app.save.loadout.slice(0, SLOTS.length);
  return cells.map((cell, slot) => ({ cell, slot })).filter((b): b is { cell: string; slot: number } => !!b.cell && app.services.learned(b.cell));
}

/** Prove every learned name this world carries. Names are locked in as of now. */
export async function prepareJourney(app: App, ticket: RoundTicket, onProgress: (done: number, total: number, name?: string) => void): Promise<Journey> {
  const save = app.save;
  const aura = save.aura!;
  const bound = boundFor(app, ticket.world);
  const bundle: Journey['bundle'] = [];
  let done = 0;
  onProgress(0, bound.length);
  await Promise.all(bound.map(async (b) => {
    const rec = save.names[b.cell]!;
    const sp = spiritOf(save, b.cell)!;
    const r = await prove({
      cell: b.cell,
      nonce: rec.claim.nonce,
      secret: aura.secret,
      magnitude: sp.magnitude,
      strength: rec.strength,
      context: ticket.context.toString(),
    });
    if (r.ok) bundle.push({ slot: b.slot, claim: r.claim });
    else app.toast(`A name would not be spoken: ${r.error}`, '#ff7a6b');
    onProgress(++done, bound.length, spiritName(sp));
  }));
  bundle.sort((a, b) => a.slot - b.slot);
  const cosmetics: Journey['cosmetics'] = Array.from({ length: Math.max(SLOTS.length, bound.length) }, () => null);
  for (const b of bound) {
    const sp = spiritOf(save, b.cell)!;
    cosmetics[b.slot] = { element: sp.element, magnitude: sp.magnitude, traits: { ...sp.traits, flavor: sp.traits.flavor.toString() } };
  }
  return { ticket, aura: aura.pub, element: aura.element, newcomer: save.runs.length < 2, bundle, cosmetics };
}
