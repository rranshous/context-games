import { describe, it, expect } from 'vitest';
import { ClientEnd, ServerEnd, newKey, b64u, parseAddress, shareAddress, trustPolicy, type RawSocket } from '../src/index.ts';

/** Two ends wired back to back, recording every frame that crosses (what an eavesdropper sees). */
function pair(trust: (k: string) => true | string = () => true) {
  const key = newKey();
  const wire: (string | Uint8Array)[] = [];
  const closed: string[] = [];
  let client!: ClientEnd, server!: ServerEnd;
  const toServer: RawSocket = { send: (d) => { wire.push(d); server.receive(d); }, close: (_c, r) => closed.push(`client: ${r}`) };
  const toClient: RawSocket = { send: (d) => { wire.push(d); client.receive(d); }, close: (_c, r) => closed.push(`server: ${r}`) };
  client = new ClientEnd(toServer, trust);
  server = new ServerEnd(toClient, key);
  return { key, wire, closed, client, server };
}

describe('sealed channels', () => {
  it('opens with a key exchange and carries messages both ways, never in clear', () => {
    const { client, server, wire, key } = pair();
    const got: unknown[] = [];
    server.onMessage = (m) => got.push(['server', m]);
    client.onMessage = (m) => got.push(['client', m]);
    client.send({ t: 'choir-say', text: 'the warden of the threshold' }); // queued until open
    server.start();
    expect(client.open && server.open).toBe(true);
    expect(client.serverKey).toBe(b64u(key.pub));
    server.send({ t: 'choir-said', text: 'cell 312662277504' });
    client.send({ t: 'cast', slot: 0 });
    expect(got).toEqual([
      ['server', { t: 'choir-say', text: 'the warden of the threshold' }],
      ['client', { t: 'choir-said', text: 'cell 312662277504' }],
      ['server', { t: 'cast', slot: 0 }],
    ]);
    // only the two handshake frames are clear; nothing said crosses readable
    expect(wire.filter((f) => typeof f === 'string').length).toBe(2);
    const seen = wire.map((f) => (typeof f === 'string' ? f : new TextDecoder().decode(f))).join('|');
    expect(seen).not.toContain('warden');
    expect(seen).not.toContain('312662277504');
  });

  it('refuses a server whose key differs from the pinned one', () => {
    const pins = new Map<string, string>();
    pins.set('ws://altar:5193', b64u(newKey().pub));
    const refusals: string[] = [];
    const { client, server } = pair(trustPolicy('ws://altar:5193', null, { get: (u) => pins.get(u) ?? null, set: (u, k) => pins.set(u, k) }));
    client.onRefused = (why) => refusals.push(why);
    server.start();
    expect(client.open).toBe(false);
    expect(refusals[0]).toMatch(/different key/);
  });

  it('pins a key on first use, and an address can carry the key', () => {
    const pins = new Map<string, string>();
    const { client, server, key } = pair(trustPolicy('ws://altar:5193', null, { get: (u) => pins.get(u) ?? null, set: (u, k) => pins.set(u, k) }));
    server.start();
    expect(client.open).toBe(true);
    expect(pins.get('ws://altar:5193')).toBe(b64u(key.pub));
    const shared = shareAddress('ws://192.168.1.20:47192', b64u(key.pub));
    expect(parseAddress(shared)).toEqual({ url: 'ws://192.168.1.20:47192', key: b64u(key.pub) });
    expect(parseAddress('192.168.1.20')).toEqual({ url: 'ws://192.168.1.20:5192', key: null });
  });

  it('closes on an altered or replayed frame', () => {
    const { client, server, closed } = pair();
    let last: Uint8Array | null = null;
    server.start();
    const raw = (client as unknown as { raw: RawSocket }).raw;
    const send = raw.send;
    raw.send = (d) => { if (typeof d !== 'string') last = d; send(d); };
    client.send({ t: 'cast', slot: 1 });
    server.receive(last!); // replayed
    expect(closed.some((c) => c.startsWith('server'))).toBe(true);
  });
});
