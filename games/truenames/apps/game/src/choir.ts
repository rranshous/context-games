// A choir: this sanctum's membership at one altar (a sanctum may belong to several: home, a church's, a friend's).
// Members see each other's presence, talk, share signs, and call rounds ("the Dark, descent 3, at dungeon X"). A
// shared sign lands in the Name Book like a find: a church handing down a being. Talk, signs and calls from others
// are sanctum events, so an actant tending this sanctum reviews when they arrive. Sealed in transit.
import type { Activity, AltarServerMsg, ChoirMember } from '@truenames/protocol';
import type { SealedSocket } from '@truenames/channel';
import { spiritAt } from '@truenames/universe';
import type { World } from '@truenames/dungeon/protocol';
import { persist, rememberSpirit, type SaveData } from './save.ts';
import type { Services } from './services.ts';
import { addHistory } from './plan.ts';
import { spiritName, magnitudeTitle } from './lore.ts';
import { openSealed } from './round.ts';
import { worldDescentName } from '@truenames/dungeon/balance';

export interface ChoirLine { at: number; from: string; text: string; mine: boolean; sign?: string }
const WORLDS: readonly string[] = ['dark', 'racer', 'bastion', 'council'];

export class Choir {
  /** The altar's own name (from its roster), or its address until it answers. */
  name: string;
  members: ChoirMember[] = [];
  lines: ChoirLine[] = [];
  connected = false;
  /** Why the last connection failed, if it did (a changed key, no answer). */
  trouble: string | null = null;
  private ws: SealedSocket | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private retry = 2000;
  private stopped = false;

  constructor(readonly address: string, private save: SaveData, private S: Services) {
    this.name = address.split('#')[0]!.replace(/^ws:\/\//, '');
  }

  connect() {
    if (!this.save.aura || this.ws || this.stopped) return;
    let ws: SealedSocket;
    try { ws = openSealed(this.address, 5193); } catch { return this.later(); }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.trouble = null;
      this.retry = 2000;
      ws.send({ t: 'join', aura: this.save.aura!.pub, handle: this.S.handle, element: this.save.aura!.element });
      this.presence();
      this.presenceTimer = setInterval(() => this.presence(), 10_000);
      this.S.choirChanged();
    };
    ws.onmessage = (m) => this.heard(m as AltarServerMsg);
    ws.onclose = (why) => {
      this.connected = false;
      this.ws = null;
      if (why) this.trouble = why;
      if (this.presenceTimer) clearInterval(this.presenceTimer);
      this.members = [];
      this.S.choirChanged();
      this.later();
    };
  }

  /** Leave this altar for good (the sanctum dropped it). */
  stop() { this.stopped = true; this.ws?.close(); }

  /** Reconnect (e.g. after the handle changes). */
  reconnect() {
    if (this.ws) this.ws.close(); // onclose reconnects
    else this.connect();
  }

  private later() {
    if (this.stopped) return;
    setTimeout(() => this.connect(), this.retry);
    this.retry = Math.min(60_000, this.retry * 2);
  }

  private presence() {
    const S = this.S;
    const words = S.graspedWords();
    this.ws?.send({ t: 'presence', presence: { hum: Math.round(S.pool.rate()), words: words.length, beings: Object.keys(this.save.spirits).length, truest: Math.max(0, ...words.map((k) => S.strength(k))), actant: S.actant.config.on ? S.actant.status : 'none' } });
  }

  /** Tell this choir what you are doing right now (live): typing, heard, thinking, or nothing. */
  activity(what: Activity) {
    this.ws?.send({ t: 'activity', what });
  }

  say(text: string) {
    const t = text.trim();
    if (t) this.ws?.send({ t: 'say', text: t });
  }

  /** Share a being's sign with this choir. */
  share(cell: string, note?: string) {
    this.ws?.send({ t: 'share', cell, ...(note ? { note } : {}) });
  }

  /** Call a shared round you opened: the choir hears where (the dungeon's shareable address) and can walk in. */
  call(world: World, level: number, dungeon: string, closesIn: number) {
    this.ws?.send({ t: 'call', world, level, dungeon, closesIn });
  }

  private heard(m: AltarServerMsg) {
    const me = this.save.aura?.pub;
    if (m.t === 'roster') {
      this.members = m.members;
      this.name = m.name || this.name;
    } else if (m.t === 'said') {
      const mine = m.from.aura === me;
      this.lines.push({ at: m.at, from: m.from.handle, text: m.text, mine });
      if (!mine) this.S.events.emit({ kind: 'chat', text: `${m.from.handle} says at ${this.name}: "${m.text}"` });
    } else if (m.t === 'shared') {
      const mine = m.from.aura === me;
      const sp = spiritAt(m.cell);
      if (!sp) return; // not a being: a bad sign, ignored
      this.lines.push({ at: m.at, from: m.from.handle, text: `shared the sign of ${spiritName(sp)}, ${magnitudeTitle(sp.magnitude)}${m.note ? `: ${m.note}` : ''}`, mine, sign: m.cell });
      if (!mine && rememberSpirit(this.save, sp, 'shared')) {
        const text = `${m.from.handle} shared at ${this.name} the sign of ${spiritName(sp)}, ${magnitudeTitle(sp.magnitude)} (might ${sp.magnitude}), sign ${m.cell}`;
        addHistory(this.save, { kind: 'find', by: 'sanctum', text });
        persist(this.save);
        this.S.events.emit({ kind: 'find', text });
      }
    } else if (m.t === 'called') {
      if (!WORLDS.includes(m.world)) return;
      const world = m.world as World;
      const mine = m.from.aura === me;
      const what = world === 'racer' ? `opened a race at ${worldDescentName('racer', m.level)}` : `walked into the dark at ${worldDescentName(world, m.level)}`;
      this.lines.push({ at: m.at, from: m.from.handle, text: `${what}, at ${m.dungeon.split('#')[0]}; it begins within ${m.closesIn}s`, mine });
      if (!mine) this.S.calledRound(world, m.level, m.dungeon, m.from.aura);
    } else return;
    if (this.lines.length > 200) this.lines.splice(0, this.lines.length - 200);
    this.S.choirChanged();
  }
}
