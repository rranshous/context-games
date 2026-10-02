// The game side of the threshold: a link to a dungeon process. It knows nothing of the sanctum.
// The dungeon issues a context, receives proofs bound to it, runs the round, and reports what happened.
import type { ZkNameClaim } from '@truenames/proofs';
import type { Fighter } from '@truenames/dungeon/fighting';
import type { ClientMsg, ServerMsg, Snapshot, BastionSnapshot, CouncilView, CouncilTarget, RacerSnapshot, RoundResultMsg, MoveCmd, DriveCmd, WireTraits, World } from '@truenames/dungeon/protocol';

/** Issued by the dungeon when a round is opened. Proofs must be bound to its context. */
export interface RoundTicket {
  context: bigint;
  level: number;
  world: World;
}

/** What the sanctum hands the game: public identity, cosmetics, and zero-knowledge proofs. No secrets. */
export interface Journey {
  ticket: RoundTicket;
  aura: string; // hex public key
  element: number; // cosmetic: the aura's chosen element
  newcomer: boolean; // show the controls hint
  bundle: { slot: number; claim: ZkNameClaim }[];
  /** How to draw your own names (true name, seal). Stays in this browser: never sent to the dungeon. */
  cosmetics: ({ element: number; magnitude: number; traits: WireTraits } | null)[];
  /** An actant's driving code: when set, it drives the car (Dark Racer) instead of the keyboard. */
  pilot?: Pilot;
  /** An actant's fighting code: when set, it moves, aims and speaks (the Dark) instead of the keyboard and mouse. */
  fighter?: Fighter;
}

export type RoundResult = RoundResultMsg;

/** What a pilot sees each frame of a race (its own car, the road, the others, its words). */
export interface PilotView {
  car: { x: number; y: number; vx: number; vy: number; a: number; spin: number; slide: number; slow: number; top: number; hint: number };
  track: { pts: { x: number; y: number }[]; halfWidth: number };
  others: { x: number; y: number; vx: number; vy: number; place: number; ahead: boolean; dist: number }[];
  slots: ({ index: number; form: string; ready: number; vessel: number; cap: number } | null)[];
  place: number;
  lap: number;
  laps: number;
  /** Your heat: every word spoken adds strain; past capacity a word can answer with backlash (a spin). */
  strain: number;
  capacity: number;
  /** Seconds since the race screen opened. */
  time: number;
  /** Yours to keep anything in between frames (fresh each race). */
  memory: Record<string, unknown>;
}
/** A pilot's order for this frame: throttle and steer (-1..1), and optionally a word (slot index) to speak. */
export interface PilotOrder { throttle: number; steer: number; cast?: number | null }
export type Pilot = (view: PilotView) => PilotOrder;
export type { FightView, FightOrder, Fighter } from '@truenames/dungeon/fighting';
export type Welcome = Extract<ServerMsg, { t: 'welcome' }>;
export type DarkWelcome = Extract<Welcome, { world: 'dark' }>;
export type BastionWelcome = Extract<Welcome, { world: 'bastion' }>;
export type CouncilWelcome = Extract<Welcome, { world: 'council' }>;
export type RacerWelcome = Extract<Welcome, { world: 'racer' }>;

/** How a round talks back to whoever launched it. */
export interface RoundHost {
  report(result: RoundResult): { unlocked: boolean };
  leave(): void;
  toast(html: string, color?: string): void;
}

/** Dev-only: ?lag=150 asks the dungeon to simulate that much round-trip latency. */
export const DEV_LAG = Number(new URLSearchParams(location.search).get('lag') ?? 0) || 0;

/** This machine's own dungeon: the desktop app passes it as ?dungeon=…; in development it's port 5192. */
export const LOCAL_DUNGEON = (() => {
  const q = new URLSearchParams(location.search).get('dungeon');
  return q ?? `ws://${location.hostname || 'localhost'}:5192`;
})();

const HOST_KEY = 'truenames-world-host';
/** Where worlds are hosted: a friend's dungeon (an address the player entered) or our own. */
export function worldHost(): string {
  try { return localStorage.getItem(HOST_KEY) || LOCAL_DUNGEON; } catch { return LOCAL_DUNGEON; }
}
/** Point at a friend's dungeon ("192.168.1.20" or "ws://host:port"), or back to our own (empty). */
export function setWorldHost(addr: string) {
  const a = addr.trim();
  const url = !a ? '' : /^wss?:\/\//.test(a) ? a : `ws://${a}${/:\d+$/.test(a) ? '' : `:${new URL(LOCAL_DUNGEON).port || 5192}`}`;
  try { if (url) localStorage.setItem(HOST_KEY, url); else localStorage.removeItem(HOST_KEY); } catch { /* per-session only */ }
}

/** A live connection to one round in a dungeon process. */
export class DungeonLink {
  private ws: WebSocket;
  private ready: Promise<void>;
  private waiters: ((m: ServerMsg) => boolean)[] = [];
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onBastion: ((s: BastionSnapshot) => void) | null = null;
  onCouncil: ((v: CouncilView) => void) | null = null;
  onRacer: ((s: RacerSnapshot) => void) | null = null;
  onEnd: ((r: RoundResult) => void) | null = null;
  onClose: (() => void) | null = null;
  closed = false;

  constructor(url = worldHost()) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error(`the dungeon at ${url} does not answer`));
    });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      if (m.t === 'snap') return this.onSnapshot?.(m);
      if (m.t === 'bsnap') return this.onBastion?.(m);
      if (m.t === 'cview') return this.onCouncil?.(m);
      if (m.t === 'rsnap') return this.onRacer?.(m);
      if (m.t === 'end') return this.onEnd?.(m.result);
      if (m.t === 'error') console.warn('[dungeon]', m.message);
      this.waiters = this.waiters.filter((w) => !w(m));
    };
    this.ws.onclose = () => { this.closed = true; this.onClose?.(); };
  }

  private send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private next<T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> {
    return new Promise((res, rej) => {
      this.waiters.push((m) => {
        if (m.t === t) { res(m as Extract<ServerMsg, { t: T }>); return true; }
        if (m.t === 'error') { rej(new Error(m.message)); return true; }
        return false;
      });
    });
  }

  /** Ask the dungeon for a round; it answers with a fresh context. */
  async open(level: number, world: World = 'dark'): Promise<RoundTicket> {
    await this.ready;
    const reply = this.next('ticket');
    this.send({ t: 'open', level, world, ...(DEV_LAG ? { lag: DEV_LAG } : {}) });
    const m = await reply;
    return { context: BigInt(m.context), level: m.level, world: m.world };
  }

  /** Present the journey's proofs. The dungeon verifies them and describes the round. */
  async enter(journey: Journey): Promise<Welcome> {
    const reply = this.next('welcome');
    this.send({ t: 'journey', aura: journey.aura, bundle: journey.bundle });
    return reply;
  }

  cmds(cmds: MoveCmd[]) { this.send({ t: 'cmds', cmds }); }
  cast(slot: number, ax: number, ay: number) { this.send({ t: 'cast', slot, ax, ay }); }
  build(slot: number, gx: number, gy: number) { this.send({ t: 'build', slot, gx, gy }); }
  sell(id: number) { this.send({ t: 'sell', id }); }
  callWave() { this.send({ t: 'call' }); }
  play(card: number, target?: CouncilTarget) { this.send({ t: 'play', card, ...(target ? { target } : {}) }); }
  pass() { this.send({ t: 'pass' }); }
  drive(cmds: DriveCmd[]) { this.send({ t: 'drive', cmds }); }
  go() { this.send({ t: 'go' }); }
  pause(on: boolean) { this.send({ t: 'pause', on }); }
  abandon() { this.send({ t: 'abandon' }); }
  close() { this.ws.close(); }
}
