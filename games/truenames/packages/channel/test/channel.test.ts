import { describe, it, expect } from 'vitest';
import { ClientEnd, ServerEnd, Sealed, newKey, b64u, unb64u, parseAddress, shareAddress, trustPolicy, type RawSocket } from '../src/index.ts';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

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

  it('forward secrecy: a recording stays sealed even to someone who later steals the server\'s long-term key', () => {
    const { client, server, wire, key } = pair();
    const kept = (server as unknown as { eph: { secret: Uint8Array } }).eph; // for the control below only
    server.start();
    client.send({ t: 'say', text: 'the sign of the hearth is 312662277504' });
    expect((server as unknown as { eph: unknown }).eph).toBeNull(); // the server's fresh secret is forgotten once open
    // the thief has the recording and the server's long-term secret
    const hello = JSON.parse(wire.find((f) => typeof f === 'string' && f.includes('hello')) as string);
    const keyMsg = JSON.parse(wire.find((f) => typeof f === 'string' && f.includes('"key"')) as string);
    const clientEph = unb64u(hello.eph), serverEph = unb64u(keyMsg.eph);
    const es = x25519.getSharedSecret(key.secret, clientEph); // what the stolen key gives them
    const sealedFrame = wire.find((f) => typeof f !== 'string') as Uint8Array;
    const open = (ee: Uint8Array) => {
      const ikm = new Uint8Array(64); ikm.set(es, 0); ikm.set(ee, 32);
      const salt = new Uint8Array(96); salt.set(clientEph, 0); salt.set(key.pub, 32); salt.set(serverEph, 64);
      const k = hkdf(sha256, ikm, salt, new TextEncoder().encode('truenames/channel/v2'), 64);
      return new Sealed(k.slice(32), k.slice(0, 32)).open(sealedFrame);
    };
    // control: with the server's fresh secret (which the server has since forgotten) the recording opens
    expect(open(x25519.getSharedSecret(kept.secret, clientEph))).toEqual({ t: 'say', text: 'the sign of the hearth is 312662277504' });
    // without either fresh secret, the second agreement is out of reach: the stolen long-term key alone opens nothing
    for (const ee of [es, new Uint8Array(32), x25519.getSharedSecret(key.secret, serverEph)]) expect(() => open(ee)).toThrow();
  });
});
