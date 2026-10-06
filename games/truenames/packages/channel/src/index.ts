// A sealed channel over a WebSocket: every altar and dungeon has a long-term x25519 key; each connection derives
// per-direction keys from it and an ephemeral client key, and every message after the handshake is sealed with
// ChaCha20-Poly1305. Synchronous (noble), so it runs the same in Node, in a desktop window and in any browser page,
// secure context or not.
//
//   server → client  (clear)   {"t":"key","key":"<server public key>"}
//   client → server  (clear)   {"t":"hello","eph":"<ephemeral public key>"}
//   then both ways   (binary)  sealed JSON, nonce = 4 zero bytes + 8-byte counter (per direction, never reused)
//
// A client checks the server's key against what it expects (from the address, or pinned on first use) before it
// says hello. A frame that fails to open (altered, replayed, reordered) closes the channel.
import { x25519 } from '@noble/curves/ed25519.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

const INFO = new TextEncoder().encode('truenames/channel/v1');
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface ChannelKey { secret: Uint8Array; pub: Uint8Array }

/** A fresh long-term key for an altar or dungeon. */
export function newKey(): ChannelKey {
  const secret = x25519.utils.randomSecretKey();
  return { secret, pub: x25519.getPublicKey(secret) };
}

export function b64u(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(s: string): Uint8Array {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
}

/**
 * An address as people share it: "host:port", "ws://host:port", either with "#k=<key>" to pin the server's key.
 * Returns the WebSocket URL and the key, if given.
 */
export function parseAddress(addr: string, defaultPort = 5192): { url: string; key: string | null } {
  const [base, frag = ''] = addr.trim().split('#');
  const key = /(?:^|&)k=([A-Za-z0-9_-]{43})/.exec(frag)?.[1] ?? null;
  const b = base!.replace(/\/+$/, '');
  const url = /^wss?:\/\//.test(b) ? b : `ws://${b}${/:\d+$/.test(b) ? '' : `:${defaultPort}`}`;
  return { url, key };
}

/** The shareable form of an address with its key. */
export function shareAddress(url: string, key: string): string {
  return `${url.replace(/^ws:\/\//, '')}#k=${key}`;
}

/** One end of an open channel: seal what goes out, open what comes in. */
export class Sealed {
  private out = 0n;
  private in = 0n;
  constructor(private sendKey: Uint8Array, private recvKey: Uint8Array) {}

  private nonce(n: bigint): Uint8Array {
    const b = new Uint8Array(12);
    new DataView(b.buffer).setBigUint64(4, n);
    return b;
  }
  seal(msg: unknown): Uint8Array {
    const n = this.nonce(this.out++);
    return chacha20poly1305(this.sendKey, n).encrypt(enc.encode(JSON.stringify(msg)));
  }
  /** Throws if the frame was altered, replayed or reordered. */
  open(frame: Uint8Array): unknown {
    const n = this.nonce(this.in++);
    return JSON.parse(dec.decode(chacha20poly1305(this.recvKey, n).decrypt(frame)));
  }
}

function derive(shared: Uint8Array, eph: Uint8Array, serverPub: Uint8Array): { c2s: Uint8Array; s2c: Uint8Array } {
  const salt = new Uint8Array(64);
  salt.set(eph, 0);
  salt.set(serverPub, 32);
  const k = hkdf(sha256, shared, salt, INFO, 64);
  return { c2s: k.slice(0, 32), s2c: k.slice(32) };
}

/** The raw socket underneath, whatever it is (a browser WebSocket, a Node `ws`). */
export interface RawSocket { send(data: string | Uint8Array): void; close(code?: number, reason?: string): void }

/**
 * The server's side of one connection. Call `start()` when the socket opens (it sends the key), and feed every
 * incoming frame to `receive()`. Messages arrive at `onMessage` once the client has said hello.
 */
export class ServerEnd {
  private sealed: Sealed | null = null;
  private queue: unknown[] = [];
  onMessage: (m: unknown) => void = () => {};
  constructor(private raw: RawSocket, private key: ChannelKey) {}
  start() { this.raw.send(JSON.stringify({ t: 'key', key: b64u(this.key.pub) })); }
  get open() { return this.sealed !== null; }
  receive(data: string | Uint8Array) {
    try {
      if (!this.sealed) {
        if (typeof data !== 'string') throw new Error('expected hello');
        const m = JSON.parse(data) as { t?: string; eph?: string };
        if (m.t !== 'hello' || !m.eph) throw new Error('expected hello');
        const eph = unb64u(m.eph);
        const k = derive(x25519.getSharedSecret(this.key.secret, eph), eph, this.key.pub);
        this.sealed = new Sealed(k.s2c, k.c2s);
        for (const q of this.queue.splice(0)) this.send(q);
        return;
      }
      if (typeof data === 'string') throw new Error('a clear frame after the handshake');
      this.onMessage(this.sealed.open(data));
    } catch {
      this.raw.close(4001, 'the channel broke');
    }
  }
  /** Sealed once the channel is open (queued until then). */
  send(m: unknown) {
    if (!this.sealed) { this.queue.push(m); return; }
    this.raw.send(this.sealed.seal(m));
  }
}

/**
 * The client's side. Feed every incoming frame to `receive()`. `trust(key)` decides whether the server's key is
 * acceptable (the expected one, or a pin); `onOpen` fires once sealed, then messages arrive at `onMessage`.
 */
export class ClientEnd {
  private sealed: Sealed | null = null;
  private queue: unknown[] = [];
  serverKey: string | null = null;
  onOpen: () => void = () => {};
  onMessage: (m: unknown) => void = () => {};
  onRefused: (why: string) => void = () => {};
  constructor(private raw: RawSocket, private trust: (key: string) => true | string) {}
  get open() { return this.sealed !== null; }
  receive(data: string | Uint8Array) {
    try {
      if (!this.sealed) {
        if (typeof data !== 'string') throw new Error('expected the key');
        const m = JSON.parse(data) as { t?: string; key?: string };
        if (m.t !== 'key' || !m.key) throw new Error('expected the key');
        const ok = this.trust(m.key);
        if (ok !== true) { this.onRefused(ok); this.raw.close(4002, 'untrusted key'); return; }
        this.serverKey = m.key;
        const eph = x25519.utils.randomSecretKey();
        const ephPub = x25519.getPublicKey(eph);
        const serverPub = unb64u(m.key);
        const k = derive(x25519.getSharedSecret(eph, serverPub), ephPub, serverPub);
        this.raw.send(JSON.stringify({ t: 'hello', eph: b64u(ephPub) }));
        this.sealed = new Sealed(k.c2s, k.s2c);
        for (const q of this.queue.splice(0)) this.send(q);
        this.onOpen();
        return;
      }
      if (typeof data === 'string') throw new Error('a clear frame after the handshake');
      this.onMessage(this.sealed.open(data));
    } catch {
      this.raw.close(4001, 'the channel broke');
    }
  }
  send(m: unknown) {
    if (!this.sealed) { this.queue.push(m); return; }
    this.raw.send(this.sealed.seal(m));
  }
}

/** Trust policy for a client: the address's key if it carries one, else the pin, else pin on first use. */
export function trustPolicy(url: string, expected: string | null, pins: { get(url: string): string | null; set(url: string, key: string): void }): (key: string) => true | string {
  return (key) => {
    const want = expected ?? pins.get(url);
    if (want && want !== key) return `${url} answered with a different key than ${expected ? 'its address gives' : 'it had before'}`;
    if (!want) pins.set(url, key);
    return true;
  };
}

/**
 * A browser (or any WHATWG WebSocket) client: connects, checks the key, seals everything. Messages are objects.
 */
export class SealedSocket {
  private ws: WebSocket;
  private end: ClientEnd;
  onopen: (() => void) | null = null;
  onmessage: ((m: unknown) => void) | null = null;
  onclose: ((why: string | null) => void) | null = null;
  onerror: ((err: Error) => void) | null = null;
  private refused: string | null = null;
  constructor(url: string, trust: (key: string) => true | string, WS: typeof WebSocket = WebSocket) {
    this.ws = new WS(url);
    this.ws.binaryType = 'arraybuffer';
    const raw: RawSocket = { send: (d) => this.ws.send(d as string | Uint8Array<ArrayBuffer>), close: (c, r) => this.ws.close(c, r) };
    this.end = new ClientEnd(raw, trust);
    this.end.onOpen = () => this.onopen?.();
    this.end.onMessage = (m) => this.onmessage?.(m);
    this.end.onRefused = (why) => { this.refused = why; };
    this.ws.onmessage = (e) => this.end.receive(typeof e.data === 'string' ? e.data : new Uint8Array(e.data as ArrayBuffer));
    this.ws.onerror = () => this.onerror?.(new Error(`${url} does not answer`));
    this.ws.onclose = () => this.onclose?.(this.refused);
  }
  get open() { return this.end.open && this.ws.readyState === 1; }
  get serverKey() { return this.end.serverKey; }
  send(m: unknown) { if (this.ws.readyState === 1 || this.ws.readyState === 0) this.end.send(m); }
  close() { this.ws.close(); }
}
