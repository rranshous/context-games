import { describe, it, expect, afterAll } from 'vitest';
import WebSocket from 'ws';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SealedSocket, newKey, b64u, shareAddress } from '@truenames/channel';
import type { AltarServerMsg } from '@truenames/protocol';
import { startAltar, type AltarHost } from '../src/altar.ts';

const dir = mkdtempSync(join(tmpdir(), 'altar-'));
const key = newKey();
const PORT = 5600 + Math.floor(Math.random() * 300);
let altar: AltarHost;

/** A member: a sealed client trusting only the altar's real key, recording what it hears. */
function member(trustKey = b64u(key.pub)) {
  const heard: AltarServerMsg[] = [];
  const ws = new SealedSocket(`ws://127.0.0.1:${PORT}`, (k) => (k === trustKey ? true : 'wrong key'), WebSocket as unknown as typeof globalThis.WebSocket);
  ws.onmessage = (m) => heard.push(m as AltarServerMsg);
  const opened = new Promise<void>((res) => { ws.onopen = () => res(); });
  return { ws, heard, opened };
}
const until = async (f: () => boolean) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };

describe('an altar', () => {
  afterAll(async () => { await altar?.close(); });

  it('gathers a choir over sealed channels: roster, talk, calls, and the issue inbox', async () => {
    altar = await startAltar({ port: PORT, host: '127.0.0.1', key, name: 'the test altar', issues: join(dir, 'issues.jsonl') });
    const a = member(), b = member();
    await Promise.all([a.opened, b.opened]);
    a.ws.send({ t: 'join', aura: 'aa'.repeat(32), handle: 'Keeper', element: 2 });
    b.ws.send({ t: 'join', aura: 'bb'.repeat(32), handle: 'Ash', element: 3 });
    await until(() => a.heard.some((m) => m.t === 'roster' && m.members.length === 2));
    const roster = [...a.heard].reverse().find((m) => m.t === 'roster');
    expect(roster).toMatchObject({ name: 'the test altar' });
    a.ws.send({ t: 'say', text: 'Ash, will you seek frost?' });
    a.ws.send({ t: 'call', world: 'dark', level: 2, dungeon: shareAddress('ws://192.168.1.20:47191', 'k'.repeat(43)), closesIn: 15 });
    b.ws.send({ t: 'issue', from: 'Ash', text: 'the lance pierced three and the log said nothing', where: 'dark' });
    await until(() => b.heard.some((m) => m.t === 'called'));
    expect(b.heard.find((m) => m.t === 'said')).toMatchObject({ from: { handle: 'Keeper' }, text: 'Ash, will you seek frost?' });
    expect(b.heard.find((m) => m.t === 'called')).toMatchObject({ world: 'dark', level: 2, dungeon: `192.168.1.20:47191#k=${'k'.repeat(43)}`, closesIn: 15 });
    await until(() => { try { return readFileSync(join(dir, 'issues.jsonl'), 'utf8').length > 0; } catch { return false; } });
    expect(JSON.parse(readFileSync(join(dir, 'issues.jsonl'), 'utf8').trim())).toMatchObject({ from: 'Ash', where: 'dark' });
    a.ws.close(); b.ws.close();
  });

  it('a client expecting another key refuses the altar before saying anything', async () => {
    const c = member(b64u(newKey().pub));
    const closed = new Promise<string | null>((res) => { c.ws.onclose = (why) => res(why); });
    expect(await closed).toBe('wrong key');
  });
});
