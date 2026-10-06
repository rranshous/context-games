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
