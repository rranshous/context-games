// The sanctum side of the threshold: the only place secrets meet the game.
// For each bound name, prove it in zero knowledge (in a worker) against the round's context.
import type { App } from './main.ts';
import type { Journey, RoundTicket } from './round.ts';
import type { ZkNameClaim } from '@truenames/proofs';
import { spiritOf, splitWord } from './save.ts';
import { facetForm } from '@truenames/universe';
import { SLOTS, COUNCIL } from '@truenames/dungeon/balance';
import { spiritName, type SpiritLike } from './lore.ts';
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
const queue: { job: ProveJob; res: (r: ProveReply) => void; started?: () => void }[] = [];
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
    const { job, res, started } = queue.shift()!;
    slot.busy = true;
    started?.();
    waiting.set(job.id, res);
    slot.w.postMessage(job);
  }
}

function prove(job: Omit<ProveJob, 'id'>, started?: () => void): Promise<ProveReply> {
  return new Promise((res) => {
    queue.push({ job: { ...job, id: ++seq }, res, started });
    pump();
  });
}

/** Which words this world carries: the four-slot loadout, or the Council deck (word keys, `cell#facet`). */
function boundFor(app: App, world: RoundTicket['world']): { key: string; cell: string; facet: number; slot: number }[] {
  const keys = world === 'council' ? (app.save.councilDeck ?? []).slice(0, COUNCIL.deckMax) : app.save.loadout.slice(0, SLOTS.length);
  return keys
    .map((key, slot) => ({ key, slot }))
    .filter((b): b is { key: string; slot: number } => !!b.key && app.services.learned(b.key))
    .map((b) => { const w = splitWord(b.key); return { ...b, cell: w.cell, facet: w.facet ?? 0 }; });
}

/** How long one proof takes here, remembered across walks (a proof reports no progress, so the wait is estimated). */
const EST_KEY = 'truenames-prove-ms';
let estMs = (() => { try { return Number(localStorage.getItem(EST_KEY)) || 6000; } catch { return 6000; } })();
export const proofEstimateMs = () => estMs;

export type ThresholdEvent =
  | { t: 'begin'; names: { slot: number; name: string; spirit: SpiritLike }[] }
  | { t: 'start'; slot: number }
  | { t: 'done'; slot: number; ok: boolean };

/** Prove every learned name this world carries. Names are locked in as of now. */
export async function prepareJourney(app: App, ticket: RoundTicket, onEvent: (e: ThresholdEvent) => void): Promise<Journey> {
  const save = app.save;
  const aura = save.aura!;
  const bound = boundFor(app, ticket.world);
  const bundle: Journey['bundle'] = [];
  onEvent({ t: 'begin', names: bound.map((b) => { const sp = spiritOf(save, b.cell)!; return { slot: b.slot, name: spiritName(sp), spirit: sp }; }) });
  await Promise.all(bound.map(async (b) => {
    const rec = save.names[b.key]!;
    const sp = spiritOf(save, b.cell)!;
    const r = await prove({
      cell: b.cell,
      nonce: rec.claim.nonce,
      secret: aura.secret,
      magnitude: sp.magnitude,
      strength: rec.strength,
      context: ticket.context.toString(),
    }, () => onEvent({ t: 'start', slot: b.slot }));
    if (r.ok) {
      bundle.push({ slot: b.slot, claim: r.claim });
      estMs = estMs * 0.7 + r.ms * 0.3;
      try { localStorage.setItem(EST_KEY, String(Math.round(estMs))); } catch { /* estimate only */ }
    } else app.toast(`A word would not be spoken: ${r.error}`, '#ff7a6b');
    onEvent({ t: 'done', slot: b.slot, ok: r.ok });
  }));
  bundle.sort((a, b) => a.slot - b.slot);
  const cosmetics: Journey['cosmetics'] = Array.from({ length: Math.max(SLOTS.length, bound.length) }, () => null);
  for (const b of bound) {
    const sp = spiritOf(save, b.cell)!;
    // the facet's own form; the being's name and seal from its flavor (local only)
    cosmetics[b.slot] = { element: sp.element, magnitude: sp.magnitude, traits: { ...sp.traits, form: facetForm(sp.traits, b.facet), formStep: 0, flavor: sp.traits.flavor.toString() } };
  }
  return { ticket, aura: aura.pub, element: aura.element, newcomer: save.runs.length < 2, bundle, cosmetics };
}
