// Lent meditation: one sanctum meditates on behalf of another, between full installs gathered at the same altar.
//
// A word is a hash of (being, the aura's PUBLIC key, nonce), so a lender searches nonces against the other's public
// key and never needs their secret. What it finds is useless to anyone else, and the receiver recomputes each find
// (one hash) and signs it itself. What needs protecting is the cells (where beings dwell), which the orders reveal:
// everything between the two travels in boxes only the pair can open (packages/channel/box), relayed by the altar
// unread. The lender does learn the cells, so lending is consented to: the lender offers, the receiver accepts (once;
// an accepted lender is remembered).
//
// Two layers of keys. The handshake is sealed with the pair key (from the two auras): it carries each side's fresh
// session key, vouched for by its aura. Everything after travels in that session (packages/channel/box Session):
// forward secret (the fresh secrets are wiped once the session is made, so a recording can't be opened later, even
// with a stolen aura) and counted (a replayed box is refused). A side that loses its session (a restart) asks to renew.
//
//   handshake (pair key)  lender → offer {eph}      receiver → accept {eph, offer} | decline {offer}      either → renew
//   session               receiver → orders {names}  lender → found {cell, nonce, strength, facet}, rate {hps}
//                         either → stop
import { hexToBytes, wordOf } from '@truenames/universe';
import { b64u, unb64u } from '@truenames/channel';
import { pairKey, sealBox, openBox, freshKey, Session, type Fresh } from '@truenames/channel/box';
import type { NameTask } from '@truenames/meditation';
import type { Speaker } from '@truenames/protocol';
import { persist, type SaveData } from './save.ts';
import type { Services } from './services.ts';
import type { Choir } from './choir.ts';
import { addHistory } from './plan.ts';

/** Sealed with the pair key: the handshake. */
type Hello =
  | { k: 'offer'; share: number; eph: string }
  | { k: 'accept'; eph: string; offer: string }
  | { k: 'decline'; offer: string }
  | { k: 'renew' };
/** Sealed in a session: the work. */
type Work =
  | { k: 'stop' }
  | { k: 'orders'; names: { cell: string; facets: number; bests: number[] }[] }
  | { k: 'found'; cell: string; nonce: string; strength: number; facet: number }
  | { k: 'rate'; hps: number };

/** Someone who meditates for us (receiver's view), or an offer we haven't answered. */
export interface Lender { aura: string; handle: string; altar: Choir; share: number; hps: number; finds: number; accepted: boolean; offer: string; session: Session | null }
/** Whom we meditate for (lender's view). */
export interface Lending { aura: string; handle: string; altar: Choir; share: number; state: 'offered' | 'lending'; finds: number; cells: string[]; fresh: Fresh | null; session: Session | null; /** history already says we meditate for them (a renewed session doesn't repeat it) */ told: boolean }

const ORDERS_EVERY_MS = 8_000;
const RATE_EVERY_MS = 5_000;
const RENEW_GAP_MS = 10_000;
const MAX_ORDERS = 8;
// envelopes say which layer a box belongs to (not secret: the contents are)
const HELLO = 'h.', WORK = 'w.';

export class Lend {
  /** Those meditating for us, and offers waiting for an answer, by aura. */
  lenders = new Map<string, Lender>();
  /** Whom we meditate for (one at a time). */
  lending: Lending | null = null;
  private keys = new Map<string, Uint8Array>();
  private lastOrders = new Map<string, string>();
  private lastRenew = new Map<string, number>();
  private lastHashes = 0;

  constructor(private save: SaveData, private S: Services) {
    setInterval(() => this.sendOrders(), ORDERS_EVERY_MS);
    setInterval(() => this.sendRate(), RATE_EVERY_MS);
  }

  private get lend() { return (this.save.lend ??= { accepted: [] }); }

  private pair(other: string): Uint8Array | null {
    const a = this.save.aura;
    if (!a) return null;
    let k = this.keys.get(other);
    if (!k) { k = pairKey(hexToBytes(a.secret), hexToBytes(a.pub), hexToBytes(other)); this.keys.set(other, k); }
    return k;
  }

  private hello(altar: Choir, to: string, m: Hello) {
    const k = this.pair(to);
    if (k) altar.relay(to, HELLO + sealBox(k, m));
  }
  private work(altar: Choir, to: string, session: Session | null, m: Work) {
    if (session) altar.relay(to, WORK + session.seal(m));
  }

  // ---------- as the lender ----------

  /** Offer to meditate for a member of one of our altars (`share`: how much of our hum, 1–8 like an aim's share). */
  offer(altar: Choir, to: Speaker, share = 4) {
    if (this.lending && this.lending.aura !== to.aura) this.stop();
    const fresh = freshKey();
    const same = this.lending?.aura === to.aura ? this.lending : null;
    this.lending = { aura: to.aura, handle: to.handle, altar, share, state: 'offered', finds: same?.finds ?? 0, cells: same?.cells ?? [], fresh, session: null, told: same?.told ?? false };
    this.lend.to = { aura: to.aura, handle: to.handle, altar: altar.address, share };
    persist(this.save);
    this.hello(altar, to.aura, { k: 'offer', share, eph: b64u(fresh.pub) });
    this.S.choirChanged();
  }

  /** Stop meditating for whoever we lend to. */
  stop() {
    const l = this.lending;
    if (!l) return;
    this.work(l.altar, l.aura, l.session, { k: 'stop' });
    this.end();
  }

  private end() {
    this.dropOrders();
    this.lending = null; // the session (and any fresh secret) goes with it
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
    this.work(l.altar, l.aura, l.session, { k: 'found', cell: t.cell, nonce: nonce.toString(), strength, facet });
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
    this.work(l.altar, l.aura, l.session, { k: 'rate', hps: Math.round(hps) });
  }

  // ---------- as the receiver ----------

  /** Accept someone's offer: a fresh session; they will learn which beings we meditate on (sent to them, sealed). */
  accept(aura: string) {
    const x = this.lenders.get(aura);
    const k = this.pair(aura);
    if (!x || !k) return;
    const first = !x.accepted;
    const fresh = freshKey();
    x.session = Session.make(k, fresh, unb64u(x.offer)); // our fresh secret is wiped here
    x.accepted = true;
    if (!this.lend.accepted.includes(aura)) this.lend.accepted.push(aura);
    persist(this.save);
    if (first) addHistory(this.save, { kind: 'plan', by: 'player', text: `${x.handle} meditates for this sanctum (share ${x.share})` });
    this.hello(x.altar, aura, { k: 'accept', eph: b64u(fresh.pub), offer: x.offer });
    this.lastRenew.set(aura, Date.now()); // boxes still in flight under the old session will fail: that's not a reason to renew again
    this.lastOrders.delete(aura);
    this.sendOrders();
    this.S.choirChanged();
  }

  /** Decline an offer, or stop someone meditating for us (and forget that we accepted them). */
  release(aura: string) {
    const x = this.lenders.get(aura);
    if (!x) return;
    if (x.session) this.work(x.altar, aura, x.session, { k: 'stop' });
    else this.hello(x.altar, aura, { k: 'decline', offer: x.offer });
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
      if (!x.accepted || !x.session) continue;
      const names = this.orders();
      const json = JSON.stringify(names);
      if (this.lastOrders.get(x.aura) === json) continue;
      this.lastOrders.set(x.aura, json);
      this.work(x.altar, x.aura, x.session, { k: 'orders', names });
    }
  }

  /** Check a lent find (one hash, against our own public key) and take it like our own. */
  private take(x: Lender, m: Extract<Work, { k: 'found' }>) {
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
    if (box.startsWith(HELLO)) return this.heardHello(altar, from, box.slice(HELLO.length));
    if (box.startsWith(WORK)) return this.heardWork(altar, from, box.slice(WORK.length));
  }

  private heardHello(altar: Choir, from: Speaker, box: string) {
    const k = this.pair(from.aura);
    if (!k) return;
    let m: Hello;
    try { m = openBox(k, box) as Hello; } catch { return; } // not for us, or not really from them
    const l = this.lending;
    switch (m.k) {
      case 'offer': {
        const share = Math.max(1, Math.min(8, Number(m.share) | 0));
        const prev = this.lenders.get(from.aura);
        this.lenders.set(from.aura, { aura: from.aura, handle: from.handle, altar, share, hps: 0, finds: prev?.finds ?? 0, accepted: false, offer: String(m.eph), session: null });
        if (this.lend.accepted.includes(from.aura)) this.accept(from.aura); // remembered: a fresh session at once
        else {
          this.S.events.emit({ kind: 'chat', text: `${from.handle} offers at ${altar.name} to meditate for you (they would learn which beings you meditate on)` });
          this.S.choirChanged();
        }
        return;
      }
      case 'accept': {
        // only an answer to the offer we have open counts (an old accept, replayed, makes nothing)
        if (!l || l.aura !== from.aura || !l.fresh || m.offer !== b64u(l.fresh.pub)) return;
        l.session = Session.make(k, l.fresh, unb64u(m.eph)); // our fresh secret is wiped here
        l.fresh = null;
        l.state = 'lending';
        if (!l.told) { l.told = true; addHistory(this.save, { kind: 'plan', by: 'sanctum', text: `meditating for ${from.handle}` }); persist(this.save); }
        this.S.choirChanged();
        return;
      }
      case 'decline':
        if (l && l.aura === from.aura && l.fresh && m.offer === b64u(l.fresh.pub)) {
          this.end();
          this.S.events.emit({ kind: 'chat', text: `${from.handle} declined your meditation` });
        }
        return;
      case 'renew':
        // they lost our session (a restart): offer afresh
        if (l && l.aura === from.aura) this.offer(l.altar, { aura: l.aura, handle: l.handle }, l.share);
        return;
    }
  }

  private heardWork(altar: Choir, from: Speaker, box: string) {
    const l = this.lending?.aura === from.aura ? this.lending : null;
    const x = this.lenders.get(from.aura);
    const session = l?.session ?? x?.session ?? null;
    let m: Work;
    try {
      if (!session) throw new Error('no session');
      m = session.open(box) as Work;
    } catch {
      // a box from a session we don't have (we restarted) or a replay: if we work together, ask to renew (not too often)
      const wanted = this.lend.accepted.includes(from.aura) || l;
      const last = this.lastRenew.get(from.aura) ?? 0;
      if (wanted && Date.now() - last > RENEW_GAP_MS) { this.lastRenew.set(from.aura, Date.now()); this.hello(altar, from.aura, { k: 'renew' }); }
      return;
    }
    switch (m.k) {
      case 'stop':
        if (l) { this.end(); this.S.events.emit({ kind: 'chat', text: `${from.handle} no longer wants your meditation` }); }
        if (x) { this.lenders.delete(from.aura); this.S.choirChanged(); }
        return;
      case 'orders':
        if (l && l.state === 'lending' && Array.isArray(m.names)) { this.follow(m.names); this.S.choirChanged(); }
        return;
      case 'found':
        if (x?.accepted) { this.take(x, m); this.S.choirChanged(); }
        return;
      case 'rate':
        if (x) { x.hps = Math.max(0, Number(m.hps) || 0); this.S.choirChanged(); }
        return;
    }
  }
}
