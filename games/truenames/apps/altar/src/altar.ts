// An altar: a gathering place, the center of a wheel. Sanctums join it (as many altars as they like) and see who is
// gathered (the choir), talk, share signs, and call rounds: "the Dark, descent 3, at dungeon X". It runs no game and
// decides nothing; it relays, and stores nothing but (in development) the issue inbox. Every connection is sealed.
import { WebSocketServer } from 'ws';
import { appendFileSync } from 'node:fs';
import { b64u, type ChannelKey } from '@truenames/channel';
import { sealServerSocket, type Peer } from '@truenames/channel/node';
import type { AltarClientMsg, AltarServerMsg, ChoirMember } from '@truenames/protocol';

export interface AltarOptions {
  port: number;
  host?: string;
  /** The altar's long-term key (its identity: members pin it). */
  key: ChannelKey;
  /** What members see this altar called. */
  name: string;
  /** Development: where reported issues are appended (one JSON line each). */
  issues?: string;
}
export interface AltarHost { port: number; key: string; close(): Promise<void> }

const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

export function startAltar(opts: AltarOptions): Promise<AltarHost> {
  interface Member { peer: Peer; info: ChoirMember }
  const choir = new Set<Member>();
  const say = (m: AltarServerMsg) => { for (const x of choir) x.peer.send(m); };
  const roster = () => say({ t: 'roster', name: opts.name, members: [...choir].map((x) => x.info) });
  const log = (s: string) => console.log(`[altar] ${s}`);

  function serve(peer: Peer) {
    let me: Member | null = null;
    peer.onMessage((raw) => {
      const m = raw as AltarClientMsg;
      if (m.t === 'issue') {
        const line = { at: new Date().toISOString(), from: clean(m.from, 60), where: clean(m.where ?? '', 120), text: clean(m.text, 2000) };
        console.log(`[issue] ${line.from} (${line.where}): ${line.text}`);
        if (opts.issues) appendFileSync(opts.issues, JSON.stringify(line) + '\n');
        return;
      }
      if (m.t === 'join') {
        if (me) return;
        me = { peer, info: { aura: clean(m.aura, 64), handle: clean(m.handle, 24) || clean(m.aura, 6), element: Math.max(0, Math.min(7, Number(m.element) | 0)), since: Date.now(), hum: 0, words: 0, beings: 0, truest: 0, actant: 'none' } };
        choir.add(me);
        log(`${me.info.handle} joined (${choir.size})`);
        roster();
        return;
      }
      if (!me) return peer.send({ t: 'error', message: 'join first' });
      const from = { aura: me.info.aura, handle: me.info.handle };
      if (m.t === 'presence') {
        const p = m.presence;
        Object.assign(me.info, { hum: Math.max(0, Number(p.hum) || 0), words: Math.max(0, Number(p.words) | 0), beings: Math.max(0, Number(p.beings) | 0), truest: Math.max(0, Number(p.truest) | 0), actant: ['none', 'asleep', 'waiting', 'thinking'].includes(p.actant) ? p.actant : 'none' });
        roster();
      } else if (m.t === 'activity') {
        const what = m.what === 'typing' || m.what === 'heard' || m.what === 'thinking' ? m.what : null;
        if (me.info.activity !== what) { me.info.activity = what; roster(); }
      } else if (m.t === 'say') {
        const text = clean(m.text, 500).trim();
        if (text) say({ t: 'said', from, text, at: Date.now() });
        if (me.info.activity === 'typing') { me.info.activity = null; roster(); } // speaking ends typing
      } else if (m.t === 'share') {
        const cell = String(m.cell ?? '');
        if (/^[0-7]{12,24}$/.test(cell)) say({ t: 'shared', from, cell, ...(m.note ? { note: clean(m.note, 200) } : {}), at: Date.now() });
      } else if (m.t === 'relay') {
        // a sealed box between two members (lent meditation): passed on, unread; only the named aura gets it
        const box = String(m.box ?? '');
        if (box.length > 65536) return;
        for (const x of choir) if (x.info.aura === m.to && x !== me) x.peer.send({ t: 'relayed', from, box });
      } else if (m.t === 'call') {
        const world = clean(m.world, 20), dungeon = clean(m.dungeon, 200);
        if (!world || !dungeon) return;
        log(`${from.handle} calls ${world} (level ${Number(m.level) | 0}) at ${dungeon.split('#')[0]}`);
        say({ t: 'called', from, world, level: Math.max(0, Number(m.level) | 0), dungeon, closesIn: Math.max(0, Math.min(60, Number(m.closesIn) || 0)), at: Date.now() });
      }
    });
    peer.onClose(() => { if (me) { choir.delete(me); log(`${me.info.handle} left (${choir.size})`); roster(); } });
  }

  return new Promise((res, rej) => {
    const wss = new WebSocketServer({ port: opts.port, host: opts.host ?? '0.0.0.0' });
    wss.on('connection', (ws) => serve(sealServerSocket(ws, opts.key)));
    wss.once('error', rej);
    wss.once('listening', () => {
      log(`"${opts.name}" listening on ws://${opts.host ?? '0.0.0.0'}:${opts.port} (key ${b64u(opts.key.pub).slice(0, 8)}…)`);
      res({ port: opts.port, key: b64u(opts.key.pub), close: () => new Promise((r) => wss.close(() => r())) });
    });
  });
}
