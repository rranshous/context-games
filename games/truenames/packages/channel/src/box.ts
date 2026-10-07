// Sealed boxes between two auras: a channel's ends (an altar, a dungeon) see only that a box went from one aura to
// another. Each pair of auras shares a key derived from one's secret and the other's public key (ed25519 auras mapped
// to x25519, then HKDF-SHA256), so only the two of them can open what passes between them, and only an aura's holder
// can seal a box that opens as theirs. Boxes are XChaCha20-Poly1305 with a random 24-byte nonce.
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { b64u, unb64u } from './index.ts';

const INFO = new TextEncoder().encode('truenames/pair/v1');
const enc = new TextEncoder();
const dec = new TextDecoder();

/** The key two auras share: from my secret and their public key (both ed25519, 32 bytes). Symmetric: both derive it. */
export function pairKey(mySecret: Uint8Array, myPub: Uint8Array, theirPub: Uint8Array): Uint8Array {
  const shared = x25519.getSharedSecret(ed25519.utils.toMontgomerySecret(mySecret), ed25519.utils.toMontgomery(theirPub));
  // salt: both public keys, in a fixed order, so each side derives the same key
  const [a, b] = compare(myPub, theirPub) <= 0 ? [myPub, theirPub] : [theirPub, myPub];
  const salt = new Uint8Array(64);
  salt.set(a, 0);
  salt.set(b, 32);
  return hkdf(sha256, shared, salt, INFO, 32);
}

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** Seal a message for the other aura of a pair. */
export function sealBox(key: Uint8Array, msg: unknown): string {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(enc.encode(JSON.stringify(msg)));
  const out = new Uint8Array(24 + ct.length);
  out.set(nonce, 0);
  out.set(ct, 24);
  return b64u(out);
}

/** Open a box from the other aura of a pair. Throws if it was not sealed with this pair's key, or was altered. */
export function openBox(key: Uint8Array, box: string): unknown {
  const raw = unb64u(box);
  return JSON.parse(dec.decode(xchacha20poly1305(key, raw.subarray(0, 24)).decrypt(raw.subarray(24))));
}

// ---------- sessions: forward secrecy and replay protection on top of the pair key ----------

/** A fresh x25519 key pair for one session (kept in memory only, forgotten when the session is made). */
export interface Fresh { secret: Uint8Array; pub: Uint8Array }
export function freshKey(): Fresh {
  const secret = x25519.utils.randomSecretKey();
  return { secret, pub: x25519.getPublicKey(secret) };
}

const SESSION_INFO = new TextEncoder().encode('truenames/session/v1');

/**
 * A session between two auras. Each side makes a fresh key and sends its public half sealed under the pair key (so it
 * is vouched for by the aura: no one in between can swap one in). The session key mixes the agreement of the two fresh
 * keys with the pair key, so it needs both auras AND both fresh secrets: once the fresh secrets are forgotten, a
 * recording of the session can't be opened even by someone who later steals an aura. Every message carries a counter
 * inside the seal; anything not newer than the last one seen is refused (a replay).
 */
export class Session {
  private out = 0;
  private in = 0;
  private constructor(private key: Uint8Array) {}

  /** Make the session from my fresh key and theirs; my fresh secret is wiped (forward secrecy). */
  static make(pair: Uint8Array, mine: Fresh, theirPub: Uint8Array): Session {
    const ee = x25519.getSharedSecret(mine.secret, theirPub);
    mine.secret.fill(0);
    const ikm = new Uint8Array(64);
    ikm.set(ee, 0);
    ikm.set(pair, 32);
    const [a, b] = compare(mine.pub, theirPub) <= 0 ? [mine.pub, theirPub] : [theirPub, mine.pub];
    const salt = new Uint8Array(64);
    salt.set(a, 0);
    salt.set(b, 32);
    return new Session(hkdf(sha256, ikm, salt, SESSION_INFO, 32));
  }

  seal(msg: unknown): string {
    return sealBox(this.key, { n: ++this.out, m: msg });
  }

  /** Throws if the box isn't of this session, was altered, or is not newer than the last one opened (a replay). */
  open(box: string): unknown {
    const o = openBox(this.key, box) as { n: number; m: unknown };
    if (!(typeof o.n === 'number' && o.n > this.in)) throw new Error('replayed');
    this.in = o.n;
    return o.m;
  }
}
