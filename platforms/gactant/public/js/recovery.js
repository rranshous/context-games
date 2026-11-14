// A recovery code is twelve made-up words, and two separate things come from it, here in
// the browser (and on the server only for a code it made itself, where there's no vault):
//   the proof   what the server keeps a hash of and checks a recovery against
//   the vault key   what the person's content key is wrapped under (identity.js)
// The server sees only the proof, and the vault key can't be worked out from it, so what
// the recovery code unlocks stays the person's even from the server.

export const tidyCode = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
export const isRecoveryProof = (s) => /^[0-9a-f]{64}$/.test(String(s ?? ''));

/** The proof of a recovery code: 256 bits from it, as hex. */
export async function recoveryProof(code) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(tidyCode(code)), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('gactant recovery proof v1'), info: new TextEncoder().encode('proof') }, base, 256);
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}
