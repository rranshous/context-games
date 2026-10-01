// The choir: this sanctum's link to the others gathered at the same host (the instance named in the sanctum's
// "worlds" field, or our own). Members see each other's presence, talk, and share signs. A shared sign lands
// in the Name Book like a find: a church handing down a being. Chat and signs from others are sanctum events,
// so an actant tending this sanctum reviews when they arrive.
import type { ChoirMember, ServerMsg } from '@truenames/dungeon/protocol';
import { spiritAt } from '@truenames/universe';
import { persist, rememberSpirit, type SaveData } from './save.ts';
import type { Services } from './services.ts';
import { addHistory } from './plan.ts';
import { spiritName, magnitudeTitle } from './lore.ts';
import { worldHost } from './round.ts';

export interface ChoirLine { at: number; from: string; text: string; mine: boolean; sign?: string }

export class Choir {
  members: ChoirMember[] = [];
  lines: ChoirLine[] = [];
  connected = false;
  onChange: (() => void) | null = null;
  /** Called when a race gathers at the choir's host (level, the opener's aura). */
  onRace: ((level: number, by: string) => void) | null = null;
  private ws: WebSocket | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private retry = 2000;

  constructor(private save: SaveData, private S: Services) {}

  get handle(): string { return this.save.handle || (this.save.aura ? this.save.aura.pub.slice(0, 6) : 'someone'); }

  connect() {
    if (!this.save.aura || this.ws) return;
    let ws: WebSocket;
    try { ws = new WebSocket(worldHost()); } catch { return this.later(); }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 2000;
      ws.send(JSON.stringify({ t: 'choir-join', aura: this.save.aura!.pub, handle: this.handle, element: this.save.aura!.element }));
      this.presence();
      this.presenceTimer = setInterval(() => this.presence(), 10_000);
      this.onChange?.();
    };
    ws.onmessage = (e) => this.heard(JSON.parse(String(e.data)) as ServerMsg);
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.presenceTimer) clearInterval(this.presenceTimer);
      this.members = [];
      this.onChange?.();
      this.later();
    };
  }

  /** Reconnect (e.g. after the worlds host changes). */
  reconnect() {
    if (this.ws) this.ws.close(); // onclose reconnects
    else this.connect();
  }

  private later() {
    setTimeout(() => this.connect(), this.retry);
    this.retry = Math.min(60_000, this.retry * 2);
  }

  private presence() {
    const S = this.S;
    const words = S.graspedWords();
    this.send({ t: 'choir-presence', presence: { hum: Math.round(S.pool.rate()), words: words.length, beings: Object.keys(this.save.spirits).length, truest: Math.max(0, ...words.map((k) => S.strength(k))), actant: S.actant.config.on ? S.actant.status : 'none' } });
  }

  private send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  say(text: string) {
    const t = text.trim();
    if (t) this.send({ t: 'choir-say', text: t });
  }

  /** Share a being's sign with the choir. */
  share(cell: string, note?: string) {
    this.send({ t: 'choir-share', cell, ...(note ? { note } : {}) });
  }

  private heard(m: ServerMsg) {
    const me = this.save.aura?.pub;
    if (m.t === 'choir-roster') {
      this.members = m.members;
    } else if (m.t === 'choir-said') {
      const mine = m.from.aura === me;
      this.lines.push({ at: m.at, from: m.from.handle, text: m.text, mine });
      if (!mine) this.S.events.emit({ kind: 'chat', text: `${m.from.handle} says in the choir: "${m.text}"` });
    } else if (m.t === 'choir-shared') {
      const mine = m.from.aura === me;
      const sp = spiritAt(m.cell);
      if (!sp) return; // not a being: a bad sign, ignored
      this.lines.push({ at: m.at, from: m.from.handle, text: `shared the sign of ${spiritName(sp)}, ${magnitudeTitle(sp.magnitude)}${m.note ? `: ${m.note}` : ''}`, mine, sign: m.cell });
      if (!mine && rememberSpirit(this.save, sp, 'shared')) {
        const text = `${m.from.handle} shared the sign of ${spiritName(sp)}, ${magnitudeTitle(sp.magnitude)} (might ${sp.magnitude}), sign ${m.cell}`;
        addHistory(this.save, { kind: 'find', by: 'sanctum', text });
        persist(this.save);
        this.S.events.emit({ kind: 'find', text });
      }
    } else if (m.t === 'choir-race') {
      const who = this.members.find((x) => x.aura === m.by)?.handle ?? 'someone';
      this.lines.push({ at: Date.now(), from: who, text: `opened a race (circuit ${m.level + 1}); it starts within ${m.closesIn}s`, mine: m.by === me });
      this.onRace?.(m.level, m.by);
    } else return;
    if (this.lines.length > 200) this.lines.splice(0, this.lines.length - 200);
    this.onChange?.();
  }
}
