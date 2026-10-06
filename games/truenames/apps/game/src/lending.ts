// Lent meditation: one sanctum meditates on behalf of another, between full installs gathered at the same altar.
//
// A word is a hash of (being, the aura's PUBLIC key, nonce), so a lender searches nonces against the other's public
// key and never needs their secret. What it finds is useless to anyone else, and the receiver recomputes each find
// (one hash) and signs it itself. What needs protecting is the cells (where beings dwell), which the orders reveal:
// everything between the two travels in boxes only the pair can open (packages/channel/box), relayed by the altar
// unread. The lender does learn the cells, so lending is consented to: the lender offers, the receiver accepts (once;
// an accepted lender is remembered).
//
//   lender → receiver   offer {share}            receiver → lender   accept | decline | stop
//   receiver → lender   orders {names}           lender → receiver   found {cell, nonce, strength, facet}, rate {hps}
import { hexToBytes, wordOf } from '@truenames/universe';
import { pairKey, sealBox, openBox } from '@truenames/channel/box';
import type { NameTask } from '@truenames/meditation';
import type { Speaker } from '@truenames/protocol';
import { persist, type SaveData } from './save.ts';
import type { Services } from './services.ts';
import type { Choir } from './choir.ts';
import { addHistory } from './plan.ts';

type LendMsg =
  | { k: 'offer'; share: number }
  | { k: 'accept' }
  | { k: 'decline' }
  | { k: 'stop' }
  | { k: 'orders'; names: { cell: string; facets: number; bests: number[] }[] }
  | { k: 'found'; cell: string; nonce: string; strength: number; facet: number }
  | { k: 'rate'; hps: number };

/** Someone who meditates for us (receiver's view), or an offer we haven't answered. */
export interface Lender { aura: string; handle: string; altar: Choir; share: number; hps: number; finds: number; accepted: boolean }
/** Whom we meditate for (lender's view). */
export interface Lending { aura: string; handle: string; altar: Choir; share: number; state: 'offered' | 'lending'; finds: number; cells: string[] }

const ORDERS_EVERY_MS = 8_000;
const RATE_EVERY_MS = 5_000;
const MAX_ORDERS = 8;

export class Lend {
  /** Those meditating for us, and offers waiting for an answer, by aura. */
  lenders = new Map<string, Lender>();
  /** Whom we meditate for (one at a time). */
  lending: Lending | null = null;
  private keys = new Map<string, Uint8Array>();
  private lastOrders = new Map<string, string>();
  private lastHashes = 0;

  constructor(private save: SaveData, private S: Services) {
    setInterval(() => this.sendOrders(), ORDERS_EVERY_MS);
    setInterval(() => this.sendRate(), RATE_EVERY_MS);
  }

  private get lend() { return (this.save.lend ??= { accepted: [] }); }

  private key(other: string): Uint8Array | null {
    const a = this.save.aura;
    if (!a) return null;
    let k = this.keys.get(other);
    if (!k) { k = pairKey(hexToBytes(a.secret), hexToBytes(a.pub), hexToBytes(other)); this.keys.set(other, k); }
    return k;
  }

  private send(altar: Choir, to: string, m: LendMsg) {
    const k = this.key(to);
    if (k) altar.relay(to, sealBox(k, m));
  }

  // ---------- as the lender ----------

  /** Offer to meditate for a member of one of our altars (`share`: how much of our hum, 1–8 like an aim's share). */
  offer(altar: Choir, to: Speaker, share = 4) {
    if (this.lending && this.lending.aura !== to.aura) this.stop();
    this.lending = { aura: to.aura, handle: to.handle, altar, share, state: 'offered', finds: 0, cells: [] };
    this.lend.to = { aura: to.aura, handle: to.handle, altar: altar.address, share };
    persist(this.save);
    this.send(altar, to.aura, { k: 'offer', share });
    this.S.choirChanged();
  }

  /** Stop meditating for whoever we lend to. */
  stop() {
    const l = this.lending;
    if (!l) return;
    this.send(l.altar, l.aura, { k: 'stop' });
    this.dropOrders();
    this.lending = null;
    delete this.lend.to;
    persist(this.save);
    this.S.choirChanged();
  }

  /** On reconnecting to an altar, renew a standing offer (an accepted lender is re-accepted at once). */
  resume(altar: Choir) {
    const to = this.lend.to;
    if (to && to.altar === altar.address && (!this.lending || this.lending.altar === altar)) this.offer(altar, { aura: to.aura, handle: to.handle }, to.share);
  }

  /** The pool found a better word for the one we lend to: it goes to them (they check it and sign it). */
  found(t: NameTask, nonce: bigint, strength: number, facet: number) {
    const l = this.lending;
    if (!l || l.state !== 'lending' || t.aura !== l.aura) return;
    l.finds++;
    this.send(l.altar, l.aura, { k: 'found', cell: t.cell, nonce: nonce.toString(), strength, facet });
    this.S.choirChanged();
  }

  /** Our meditations for them follow their orders: one name task per being, sharing `share` of the hum between them. */
  private follow(names: { cell: string; facets: number; bests: number[] }[]) {
    const l = this.lending;
    if (!l) return;
    const want = names.slice(0, MAX_ORDERS).filter((n) => /^[0-7]{12,24}$/.test(n.cell) && n.facets >= 1 && n.facets <= 8);
    const ids = new Set(want.map((n) => 'lend:' + n.cell));
    for (const t of this.S.pool.list()) if (t.id.startsWith('lend:') && !ids.has(t.id)) this.S.pool.remove(t.id);
    for (const n of want) {
      const id = 'lend:' + n.cell;
      const t = this.S.pool.get(id);
      const bests = Array.from({ length: n.facets }, (_, f) => Math.max(0, Number(n.bests[f]) | 0));
      if (t?.kind === 'name') { for (let f = 0; f < bests.length; f++) t.bests[f] = Math.max(t.bests[f] ?? 0, bests[f]!); }
      else this.S.pool.addName({ id, cell: n.cell, aura: l.aura, facets: n.facets, bests, label: `for ${l.handle}` });
      this.S.pool.setWeight(id, l.share / want.length);
    }
    l.cells = want.map((n) => n.cell);
  }

  private dropOrders() {
    for (const t of this.S.pool.list()) if (t.id.startsWith('lend:')) this.S.pool.remove(t.id);
  }

  private sendRate() {
    const l = this.lending;
    if (!l || l.state !== 'lending') return;
    let h = 0;
    for (const t of this.S.pool.list()) if (t.id.startsWith('lend:') && t.kind === 'name') h += t.hashes;
    const hps = Math.max(0, (h - this.lastHashes) / (RATE_EVERY_MS / 1000));
    this.lastHashes = h;
    this.send(l.altar, l.aura, { k: 'rate', hps: Math.round(hps) });
  }

  // ---------- as the receiver ----------

  /** Accept someone's offer: they will learn which beings we meditate on (sent to them, sealed). */
  accept(aura: string) {
    const x = this.lenders.get(aura);
    if (!x) return;
    x.accepted = true;
    if (!this.lend.accepted.includes(aura)) this.lend.accepted.push(aura);
    persist(this.save);
    addHistory(this.save, { kind: 'plan', by: 'player', text: `${x.handle} meditates for this sanctum (share ${x.share})` });
    this.send(x.altar, aura, { k: 'accept' });
    this.lastOrders.delete(aura);
    this.sendOrders();
    this.S.choirChanged();
  }

  /** Decline an offer, or stop someone meditating for us (and forget that we accepted them). */
  release(aura: string) {
    const x = this.lenders.get(aura);
    if (!x) return;
    this.send(x.altar, aura, { k: x.accepted ? 'stop' : 'decline' });
    this.lenders.delete(aura);
    this.lend.accepted = this.lend.accepted.filter((a) => a !== aura);
    persist(this.save);
    this.S.choirChanged();
  }

  /** What we want meditated: our meditations now (the plan's and our own), weightiest first. */
  private orders() {
    const S = this.S;
    return S.pool.list()
      .filter((t): t is NameTask => t.kind === 'name' && !t.id.startsWith('lend:'))
      .map((t) => ({ t, w: S.pool.weight(t.id) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, MAX_ORDERS)
      .map(({ t }) => ({ cell: t.cell, facets: t.facets, bests: [...t.bests] }));
  }

  private sendOrders() {
    for (const x of this.lenders.values()) {
      if (!x.accepted) continue;
      const names = this.orders();
      const json = JSON.stringify(names);
      if (this.lastOrders.get(x.aura) === json) continue;
      this.lastOrders.set(x.aura, json);
      this.send(x.altar, x.aura, { k: 'orders', names });
    }
  }

  /** Check a lent find (one hash, against our own public key) and take it like our own. */
  private take(x: Lender, m: Extract<LendMsg, { k: 'found' }>) {
    const a = this.save.aura;
    if (!a || !this.orders().some((o) => o.cell === m.cell)) return; // only beings we asked for
    let nonce: bigint;
    try { nonce = BigInt(m.nonce); } catch { return; }
    const w = wordOf(m.cell, hexToBytes(a.pub), nonce);
    if (!w) return;
    x.finds++;
    this.S.takeWord(m.cell, nonce, w.strength, w.facet, x.handle); // what the hash says, not what they claimed
  }

  // ---------- both ----------

  /** A sealed box from a member of one of our altars. */
  heard(altar: Choir, from: Speaker, box: string) {
    const k = this.key(from.aura);
    if (!k) return;
    let m: LendMsg;
    try { m = openBox(k, box) as LendMsg; } catch { return; } // not for us, or not really from them
    const l = this.lending;
    switch (m.k) {
      case 'offer': {
        const share = Math.max(1, Math.min(8, Number(m.share) | 0));
        const known = this.lend.accepted.includes(from.aura);
        this.lenders.set(from.aura, { aura: from.aura, handle: from.handle, altar, share, hps: 0, finds: this.lenders.get(from.aura)?.finds ?? 0, accepted: false });
        if (known) this.accept(from.aura);
        else {
          this.S.events.emit({ kind: 'chat', text: `${from.handle} offers at ${altar.name} to meditate for you (they would learn which beings you meditate on)` });
          this.S.choirChanged();
        }
        return;
      }
      case 'accept':
        if (l && l.aura === from.aura) { l.state = 'lending'; addHistory(this.save, { kind: 'plan', by: 'sanctum', text: `meditating for ${from.handle}` }); persist(this.save); this.S.choirChanged(); }
        return;
      case 'decline':
      case 'stop':
        if (l && l.aura === from.aura) { this.dropOrders(); this.lending = null; delete this.lend.to; persist(this.save); this.S.events.emit({ kind: 'chat', text: `${from.handle} ${m.k === 'decline' ? 'declined' : 'no longer wants'} your meditation` }); }
        if (this.lenders.has(from.aura) && m.k === 'stop') this.lenders.delete(from.aura);
        this.S.choirChanged();
        return;
      case 'orders':
        if (l && l.aura === from.aura && l.state === 'lending' && Array.isArray(m.names)) { this.follow(m.names); this.S.choirChanged(); }
        return;
      case 'found': {
        const x = this.lenders.get(from.aura);
        if (x?.accepted) { this.take(x, m); this.S.choirChanged(); }
        return;
      }
      case 'rate': {
        const x = this.lenders.get(from.aura);
        if (x) { x.hps = Math.max(0, Number(m.hps) || 0); this.S.choirChanged(); }
        return;
      }
    }
  }
}
