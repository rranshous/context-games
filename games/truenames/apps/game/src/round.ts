// The game side of the threshold: a link to a dungeon process. It knows nothing of the sanctum.
// The dungeon issues a context, receives proofs bound to it, runs the round, and reports what happened.
import type { ZkNameClaim } from '@truenames/proofs';
import type { ClientMsg, ServerMsg, Snapshot, RoundResultMsg, MoveCmd, WireTraits } from '@truenames/dungeon/protocol';

/** Issued by the dungeon when a round is opened. Proofs must be bound to its context. */
export interface RoundTicket {
  context: bigint;
  level: number;
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
}

export type RoundResult = RoundResultMsg;
export type Welcome = Extract<ServerMsg, { t: 'welcome' }>;

/** How a round talks back to whoever launched it. */
export interface RoundHost {
  report(result: RoundResult): { unlocked: boolean };
  leave(): void;
  toast(html: string, color?: string): void;
}

/** Dev-only: ?lag=150 asks the dungeon to simulate that much round-trip latency. */
export const DEV_LAG = Number(new URLSearchParams(location.search).get('lag') ?? 0) || 0;

export const DUNGEON_URL = (() => {
  const q = new URLSearchParams(location.search).get('dungeon');
  return q ?? `ws://${location.hostname || 'localhost'}:5192`;
})();

/** A live connection to one round in a dungeon process. */
export class DungeonLink {
  private ws: WebSocket;
  private ready: Promise<void>;
  private waiters: ((m: ServerMsg) => boolean)[] = [];
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onEnd: ((r: RoundResult) => void) | null = null;
  onClose: (() => void) | null = null;
  closed = false;

  constructor(url = DUNGEON_URL) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error(`the dungeon at ${url} does not answer`));
    });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMsg;
      if (m.t === 'snap') return this.onSnapshot?.(m);
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
  async open(level: number): Promise<RoundTicket> {
    await this.ready;
    const reply = this.next('ticket');
    this.send({ t: 'open', level, ...(DEV_LAG ? { lag: DEV_LAG } : {}) });
    const m = await reply;
    return { context: BigInt(m.context), level: m.level };
  }

  /** Present the journey's proofs. The dungeon verifies them and describes the round. */
  async enter(journey: Journey): Promise<Welcome> {
    const reply = this.next('welcome');
    this.send({ t: 'journey', aura: journey.aura, bundle: journey.bundle });
    return reply;
  }

  cmds(cmds: MoveCmd[]) { this.send({ t: 'cmds', cmds }); }
  cast(slot: number, ax: number, ay: number) { this.send({ t: 'cast', slot, ax, ay }); }
  pause(on: boolean) { this.send({ t: 'pause', on }); }
  abandon() { this.send({ t: 'abandon' }); }
  close() { this.ws.close(); }
}
