// The Council: a turn-based duel where each proven name is a card.
// Two seats. Seat 0 is the player; seat 1 is a Warden (AI) holding public ancients. A second
// player could take seat 1 without changing the rules. Every play goes through the authority:
//  - a card's power is what the play actually drew (truths × generosity, limited by the patron's vessel)
//  - vessels refill between turns, so a mighty patron can be played again sooner
//  - strain is aura-wide and ebbs between turns; past capacity, backlash hits your own face
// Pure: no DOM, no timers. Each seat gets its own view: you never see the other seat's hand.
import { LocalAuthority, spiritStats, TUNABLES, type ProofVerifier } from '@truenames/authority';
import { spiritAt, wordBar } from '@truenames/universe';
import { CHARTED } from './world.ts';
import type { ZkNameClaim } from '@truenames/proofs';
import { admitNames, publicSlots, wireTraits } from './admission.ts';
import { BALANCE as B, COUNCIL as C, councilPower } from './balance.ts';
import type { ClientMsg, CouncilCard, CouncilCreature, CouncilEvent, CouncilSeatView, CouncilTarget, CouncilView, RoundResultMsg, ServerMsg, SlotInfo } from './protocol.ts';

const FORM = { bolt: 0, ring: 1, ward: 2, lance: 3, nova: 4, summon: 5, hex: 6, blink: 7 } as const;
const needsTarget = (form: number) => form === FORM.bolt || form === FORM.lance || form === FORM.hex;

interface Card extends CouncilCard { spirit: string; facet: number; generosity: number }

interface Seat {
  seat: number;
  aura: string;
  life: number;
  lifeMax: number;
  shield: number;
  voice: number;
  voiceMax: number;
  deck: Card[];
  hand: Card[];
  discard: Card[];
  hex: { dps: number; turns: number }[];
  nova: number; // damage waiting to burst at the start of this seat's next turn
  ai: boolean;
}

export interface CouncilOptions {
  level: number;
  context: bigint;
  verifier: ProofVerifier;
  rng?: () => number;
}

export class CouncilSim {
  readonly world = 'council' as const;
  readonly level: number;
  private auth: LocalAuthority;
  private random: () => number;
  private seats: Seat[] = [];
  private board: CouncilCreature[] = [];
  private events: CouncilEvent[] = [];
  private nextId = 1;
  private turn = 0;
  private active = 0;
  private kills = 0;
  private dirty = true;
  paused = false;
  started = false;
  over: null | 'won' | 'lost' = null; // from seat 0's point of view

  constructor(opts: CouncilOptions) {
    this.level = opts.level;
    this.random = opts.rng ?? Math.random;
    this.auth = new LocalAuthority({ proofs: opts.verifier, context: opts.context, seed: (this.random() * 2 ** 31) | 0 });
  }

  // ---------- host interface ----------

  async admit(aura: string, bundle: { slot: number; claim: ZkNameClaim }[]): Promise<{ slots: (SlotInfo | null)[]; refused: string[] }> {
    const { slots, refused } = await admitNames(this.auth, aura, bundle, C.deckMax);
    const deck: Card[] = [];
    slots.forEach((s, slot) => {
      if (!s) return;
      deck.push({ id: this.nextId++, slot, element: s.element, magnitude: s.magnitude, form: s.form, traits: s.traits, strength: s.strength, cost: 0, spirit: s.spirit, facet: s.facet, generosity: s.generosity });
    });
    // the Warden is a peer: its words resonate as far beyond their bars as your deck's median, less wardenLag
    const res = deck.map((c) => c.strength - wordBar(c.magnitude)).sort((a, b) => a - b);
    this.table = Math.max(0, (res.length ? res[res.length >> 1]! : 0) - C.wardenLag);
    for (const c of deck) c.cost = this.costOf(c.form, c.magnitude);
    this.seats[0] = this.newSeat(0, aura, deck, false);
    this.seats[1] = this.wardenSeat();
    return { slots: publicSlots(slots), refused };
  }

  welcome(you: string, slots: (SlotInfo | null)[], refused: string[]): ServerMsg {
    return { t: 'welcome', world: 'council', you, level: this.level, seat: 0, slots, refused };
  }

  handle(_you: string, m: ClientMsg) {
    if (this.over || this.paused || this.active !== 0) return;
    if (m.t === 'play') this.play(0, Math.floor(Number(m.card)), m.target);
    else if (m.t === 'pass') this.endTurn();
    else if (m.t === 'abandon') { this.over = 'lost'; this.dirty = true; }
  }

  start() {
    this.started = true;
    for (const s of this.seats) { this.shuffle(s.deck); for (let i = 0; i < C.startHand; i++) this.draw(s, true); }
    this.beginTurn(0);
  }

  /** Turn-based: time only matters for the Warden's pacing. */
  private aiT = 0;
  private table = 0; // peer resonance (truths beyond the bar) the Warden speaks at
  step(dt: number) {
    if (!this.started || this.paused || this.over) return;
    if (this.seats[this.active]!.ai) {
      this.aiT -= dt;
      if (this.aiT <= 0) { this.aiT = 0.9; this.aiAct(); }
    }
  }

  /** A view only when something changed (turn-based: no stream). */
  snapshot(): CouncilView | null {
    if (!this.dirty || !this.seats[0]) return null;
    this.dirty = false;
    return this.viewFor(0);
  }

  result(): RoundResultMsg {
    return { world: 'council', level: this.level, won: this.over === 'won', wave: this.turn, kills: this.kills };
  }

  viewFor(seat: number): CouncilView {
    const me = this.seats[seat]!;
    const events = this.events;
    this.events = [];
    const vessels: CouncilView['vessels'] = {};
    for (const c of [...me.hand, ...me.deck, ...me.discard]) {
      const v = this.auth.poolInfo(me.aura, c.spirit);
      if (v) vessels[c.id] = v;
    }
    return {
      t: 'cview', you: seat, turn: this.turn, active: this.active,
      seats: this.seats.map((s) => this.seatView(s)),
      hand: me.hand.map(({ spirit: _s, facet: _f, generosity: _g, ...c }) => c),
      board: this.board.map((c) => ({ ...c })),
      vessels, events,
      over: this.over === null ? null : seat === 0 ? this.over : this.over === 'won' ? 'lost' : 'won',
    };
  }

  // ---------- rules ----------

  /** Voice to speak a word: 1 + the being's might (mightier beings ask more), +1 for summon and nova. */
  private costOf(form: number, might: number) {
    return Math.min(C.voiceMax, 1 + might + (form === FORM.summon || form === FORM.nova ? 1 : 0));
  }

  private newSeat(seat: number, aura: string, deck: Card[], ai: boolean): Seat {
    return { seat, aura, life: C.life, lifeMax: C.life, shield: 0, voice: 0, voiceMax: C.voiceStart - 1, deck, hand: [], discard: [], hex: [], nova: 0, ai };
  }

  private wardenSeat(): Seat {
    const aura = 'npc:council-warden';
    const deck: Card[] = CHARTED.slice(0, C.deckMax).map((cell, slot) => {
      const sp = spiritAt(cell)!;
      const strength = wordBar(sp.magnitude) + this.table + B.descent.shamanBits * this.level;
      this.auth.grantSyntheticName(aura, cell, strength);
      return { id: this.nextId++, slot, element: sp.element, magnitude: sp.magnitude, form: sp.traits.form, traits: wireTraits(sp.traits), strength, cost: this.costOf(sp.traits.form, sp.magnitude), spirit: cell, facet: 0, generosity: spiritStats(sp).generosity };
    });
    const w = this.newSeat(1, aura, deck, true);
    w.life = w.lifeMax = C.life + C.wardenLifePerSeat * this.level;
    return w;
  }

  private shuffle<T>(a: T[]) {
    for (let i = a.length - 1; i > 0; i--) { const j = (this.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j]!, a[i]!]; }
  }

  private draw(s: Seat, quiet = false) {
    if (!s.deck.length) { s.deck = s.discard; s.discard = []; this.shuffle(s.deck); } // names are never lost
    const c = s.deck.shift();
    if (!c) return;
    if (s.hand.length >= C.handMax) { s.discard.push(c); return; }
    s.hand.push(c);
    if (!quiet) this.events.push({ e: 'draw', seat: s.seat });
  }

  private tickAuthority(n: number) {
    for (let i = 0; i < n; i++) this.auth.tick(); // strain ebbs, vessels refill
  }

  private beginTurn(seat: number) {
    this.active = seat;
    this.turn++;
    const s = this.seats[seat]!;
    s.voiceMax = Math.min(C.voiceMax, s.voiceMax + 1);
    s.voice = s.voiceMax;
    this.events.push({ e: 'turn', seat, turn: this.turn });
    // what was set in motion lands now
    if (s.nova > 0) {
      const foe = this.seats[1 - seat]!;
      this.hit({ kind: 'face', seat: foe.seat }, s.nova, 'nova', -1);
      for (const c of this.board.filter((x) => x.seat === foe.seat)) this.hit({ kind: 'creature', id: c.id }, Math.round(s.nova / 2), 'nova', -1);
      s.nova = 0;
    }
    for (const h of s.hex) { this.hit({ kind: 'face', seat }, h.dps, 'hex', 6); h.turns--; }
    s.hex = s.hex.filter((h) => h.turns > 0);
    for (const c of this.board) if (c.seat === seat) c.fresh = false;
    this.draw(s);
    this.checkOver();
    this.dirty = true;
    if (s.ai) this.aiT = 1.2;
  }

  endTurn() {
    if (this.over) return;
    const seat = this.active;
    // creatures attack: the opposing front creature, else the face
    for (const c of this.board.filter((x) => x.seat === seat && !x.fresh)) {
      const front = this.board.find((x) => x.seat !== seat && x.hp > 0);
      this.hit(front ? { kind: 'creature', id: front.id } : { kind: 'face', seat: 1 - seat }, c.atk, 'creature', c.element);
      if (this.over) break;
    }
    this.tickAuthority(C.ticksPerTurn);
    this.checkOver();
    if (!this.over && this.turn >= C.turnLimit) this.over = 'lost'; // the council does not sit forever
    this.dirty = true;
    if (!this.over) this.beginTurn(1 - seat);
  }

  play(seat: number, cardId: number, target?: CouncilTarget) {
    const s = this.seats[seat]!;
    const i = s.hand.findIndex((c) => c.id === cardId);
    const refuse = (why: string) => { this.events.push({ e: 'refused', why }); this.dirty = true; };
    if (i < 0) return refuse('no such card');
    const card = s.hand[i]!;
    if (card.cost > s.voice) return refuse('not enough voice');
    if (needsTarget(card.form) && !this.validTarget(seat, target)) return refuse('choose a target');
    if (card.form === FORM.summon && this.board.filter((c) => c.seat === seat).length >= C.boardMax) return refuse('your side of the table is full');
    // speak the name
    s.voice -= card.cost;
    s.hand.splice(i, 1);
    s.discard.push(card);
    this.auth.submitCast({ aura: s.aura, spirit: card.spirit, facet: card.facet, request: B.request, target: { kind: 'self' }, tick: this.auth.currentTick() });
    const r = this.auth.tick().casts.find((x) => x.aura === s.aura);
    const grant = r?.grant ?? 0;
    const power = councilPower(grant, TUNABLES.formEfficiency[card.form]!);
    const { spirit: _s, generosity: _g, id: _id, cost: _c, ...face } = card;
    this.events.push({ e: 'play', seat, card: face, power, effective: r?.effective ?? 0, ...(target ? { target } : {}) });
    if (r?.recoil) {
      const dmg = 1 + Math.floor(r.recoil / C.recoilPerLife);
      this.events.push({ e: 'backlash', seat, amount: dmg });
      this.hit({ kind: 'face', seat }, dmg, 'backlash', card.element);
    }
    const foe = 1 - seat;
    switch (card.form) {
      case FORM.bolt: this.hit(target!, power, 'card', card.element); break;
      case FORM.lance: {
        if (target!.kind === 'creature') {
          const c = this.board.find((x) => x.id === target!.id)!;
          const over = Math.max(0, power - c.hp);
          this.hit(target!, power, 'card', card.element);
          if (over > 0) this.hit({ kind: 'face', seat: c.seat }, over, 'card', card.element);
        } else this.hit(target!, power, 'card', card.element);
        break;
      }
      case FORM.ring:
        for (const c of this.board.filter((x) => x.seat === foe)) this.hit({ kind: 'creature', id: c.id }, Math.max(1, Math.round(power * C.ringMult)), 'card', card.element);
        break;
      case FORM.ward:
        s.shield += Math.round(power * C.wardMult);
        this.events.push({ e: 'shield', seat, amount: Math.round(power * C.wardMult) });
        break;
      case FORM.nova: s.nova += Math.round(power * C.novaMult); break;
      case FORM.summon: {
        const hp = Math.max(1, Math.round(power * C.summonHp));
        const c: CouncilCreature = { id: this.nextId++, seat, element: card.element, atk: Math.max(1, Math.round(power * C.summonAtk)), hp, maxHp: hp, fresh: true };
        this.board.push(c);
        this.events.push({ e: 'summon', creature: { ...c } });
        break;
      }
      case FORM.hex: {
        const t = target!;
        const per = Math.max(1, Math.round(power / C.hexTurns));
        if (t.kind === 'face') this.seats[t.seat]!.hex.push({ dps: per, turns: C.hexTurns });
        else this.hit(t, per * C.hexTurns, 'card', card.element); // a creature takes it all at once
        break;
      }
      case FORM.blink: this.draw(s); this.draw(s); s.voice = Math.min(s.voiceMax, s.voice + 1); break;
    }
    this.checkOver();
    this.dirty = true;
  }

  private validTarget(seat: number, t?: CouncilTarget): boolean {
    if (!t) return false;
    if (t.kind === 'face') return t.seat === 0 || t.seat === 1;
    return this.board.some((c) => c.id === t.id);
  }

  private hit(t: CouncilTarget, amount: number, source: 'card' | 'creature' | 'hex' | 'nova' | 'backlash', element: number) {
    if (amount <= 0) return;
    if (t.kind === 'face') {
      const s = this.seats[t.seat]!;
      const absorbed = source === 'backlash' ? 0 : Math.min(s.shield, amount);
      s.shield -= absorbed;
      s.life -= amount - absorbed;
    } else {
      const c = this.board.find((x) => x.id === t.id);
      if (!c) return;
      c.hp -= amount;
      if (c.hp <= 0) {
        this.board = this.board.filter((x) => x !== c);
        if (c.seat === 1) this.kills++;
        this.events.push({ e: 'damage', target: t, amount, source, element });
        this.events.push({ e: 'die', id: c.id });
        return;
      }
    }
    this.events.push({ e: 'damage', target: t, amount, source, element });
  }

  private checkOver() {
    if (this.over) return;
    if (this.seats[0]!.life <= 0) this.over = 'lost';
    else if (this.seats[1]!.life <= 0) this.over = 'won';
  }

  private seatView(s: Seat): CouncilSeatView {
    const a = this.auth.auraState(s.aura);
    return {
      seat: s.seat, aura: s.aura, life: s.life, lifeMax: s.lifeMax, shield: s.shield, voice: s.voice, voiceMax: s.voiceMax,
      strain: a.strain, capacity: a.capacity, handCount: s.hand.length, deckCount: s.deck.length,
      hexes: s.hex.reduce((n, h) => n + h.turns, 0), novaPending: s.nova > 0,
    };
  }

  // ---------- the Warden (seat 1) ----------

  /** One action per call, so plays are paced and visible. A plain greedy policy. */
  private aiAct() {
    const s = this.seats[1]!;
    const foe = this.seats[0]!;
    const mine = this.board.filter((c) => c.seat === 1);
    const theirs = this.board.filter((c) => c.seat === 0);
    const playable = s.hand.filter((c) => c.cost <= s.voice && !(c.form === FORM.summon && mine.length >= C.boardMax));
    const a = this.auth.auraState(s.aura);
    if (!playable.length || a.strain > a.capacity * 0.9) return this.endTurn();
    const score = (c: Card) => {
      switch (c.form) {
        case FORM.summon: return mine.length < 3 ? 5 : 2;
        case FORM.ring: return theirs.length >= 2 ? 6 : 0.5;
        case FORM.ward: return s.life < 15 ? 5 : 1;
        case FORM.blink: return s.hand.length <= 2 ? 4 : 1;
        case FORM.nova: return 3;
        default: return 4;
      }
    };
    const c = playable.sort((x, y) => score(y) - score(x) || y.cost - x.cost)[0]!;
    let target: CouncilTarget | undefined;
    if (needsTarget(c.form)) {
      const biggest = theirs.sort((x, y) => y.atk - x.atk)[0];
      target = biggest && biggest.atk >= 3 ? { kind: 'creature', id: biggest.id } : { kind: 'face', seat: foe.seat };
    }
    this.play(1, c.id, target);
  }
}
