// The sanctum side of the threshold: the only place secrets meet the game.
// For each bound name, prove it in zero knowledge (in a worker) against the round's context.
import type { App } from './main.ts';
import type { Journey, RoundTicket } from './round.ts';
import type { ZkNameClaim } from '@truenames/proofs';
import { spiritOf } from './save.ts';
import { SLOTS } from '@truenames/dungeon/balance';
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

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: ProveReply) => void>();

function prover(): Worker {
  if (!worker) {
    worker = new ProverWorker();
    worker.onmessage = (e: MessageEvent<ProveReply>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  }
  return worker;
}

function prove(job: Omit<ProveJob, 'id'>): Promise<ProveReply> {
  const id = ++seq;
  return new Promise((res) => {
    waiting.set(id, res);
    prover().postMessage({ ...job, id });
  });
}

/** Prove every learned, bound name for this round. Names are locked in as of now. */
export async function prepareJourney(app: App, ticket: RoundTicket, onProgress: (done: number, total: number, name?: string) => void): Promise<Journey> {
  const save = app.save;
  const aura = save.aura!;
  const bound = save.loadout
    .slice(0, SLOTS.length)
    .map((cell, slot) => ({ cell, slot }))
    .filter((b): b is { cell: string; slot: number } => !!b.cell && app.services.learned(b.cell));
  const bundle: Journey['bundle'] = [];
  onProgress(0, bound.length);
  for (const [i, b] of bound.entries()) {
    const rec = save.names[b.cell]!;
    const sp = spiritOf(save, b.cell)!;
    onProgress(i, bound.length, spiritName(sp));
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
    onProgress(i + 1, bound.length);
  }
  const cosmetics: Journey['cosmetics'] = SLOTS.map(() => null);
  for (const b of bound) {
    const sp = spiritOf(save, b.cell)!;
    cosmetics[b.slot] = { element: sp.element, magnitude: sp.magnitude, traits: { ...sp.traits, flavor: sp.traits.flavor.toString() } };
  }
  return { ticket, aura: aura.pub, element: aura.element, newcomer: save.runs.length < 2, bundle, cosmetics };
}
