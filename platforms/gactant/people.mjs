// People: who someone is on gactant, with no passwords and no email. Each device a person
// uses makes its own key pair in the browser (the private half can't leave it: it's made
// non-extractable), and a person is a name plus the public keys of their devices. Ludants
// belong to a person, so every device of theirs can change them.
//
//   signing in   the device signs a fresh challenge; the server answers with a pass good
//                for 24 hours, which it checks by its own signature and keeps no list of.
//                Passes renew the same way, silently.
//   a new device a device of theirs makes a short code (10 minutes, once); typed on the
//                new device, it adds that device's key
//   lost devices the recovery code, shown once when the person is made (only its hash is
//                kept); using it adds the device and gives a new code
//   a lost phone a device of theirs can remove another; its passes stop working at once
//
// Private things (a ludant's chat, sketches, saves) are sealed in the browser with the
// person's content key, so the server keeps only ciphertext (identity.js). The server never
// sees that key. It keeps two things that let a person's devices share it:
//   the vault    the key wrapped under a key derived from the recovery code, which the
//                browser makes. The server never sees the code: the browser sends a proof
//                derived from it apart from the vault key (public/js/recovery.js), and the
//                server keeps a hash of that. A recovery code from a device that has the key
//                comes with a new vault.
//   handing over a device without the key offers a public key of its own (box); a device of
//                theirs that has the key wraps it for that box (handed). Pairing a device
//                does this, and so does a device that finds it hasn't got the key.
//
// Where browsers won't do this cryptography (a page over plain http, like a phone on the
// LAN reaching a local install), a device can instead keep a random secret, which the
// server keeps the hash of. Only an install that isn't public accepts those.
//
// Stored: people { id, name, created, devices: [{ id, key | secret, label, added, seen, box?,
// handed? }], recovery (hash), recoveryAt, vault? }; recoveries (by that hash) { person }; pairings (by the
// code's hash, for ten minutes) { person, until }.

const PASS_MS = 24 * 3600_000;
const CHALLENGE_MS = 120_000;
const PAIR_MS = 10 * 60_000;
const MAX_DEVICES = 20;
const PEOPLE_A_DAY = 20;   // people made from one address in a day

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const randomHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))), (b) => b.toString(16).padStart(2, '0')).join('');
const today = () => new Date().toISOString().slice(0, 10);

// A recovery code: twelve made-up words (about 13 bits each), easy to write down and read back.
const C = 'bdfghjklmnprstvz', V = 'aeiou';
const word = () => { const r = crypto.getRandomValues(new Uint8Array(4)); return C[r[0] % 16] + V[r[1] % 5] + C[r[2] % 16] + V[r[3] % 5]; };
const recoveryCode = () => Array.from({ length: 12 }, word).join('-');
// A device code: eight letters and digits that can't be mistaken for each other.
const PAIR_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const pairCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => PAIR_CHARS[b % PAIR_CHARS.length]).join('').replace(/^(.{4})/, '$1-');
const tidyPair = (s) => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Who a pass says it is, if the server's signature on it is good and it hasn't run out:
 *  { person, device }, or null. Without the people store, so it can't tell whether the device
 *  has been removed since: for reading only (the Worker uses it to send a look at a match
 *  straight there). */
export async function readPass(token, secret) {
  const parts = String(token ?? '').split('.');
  if (!secret || parts.length !== 5 || parts[0] !== 'v1') return null;
  const [, person, device, until, mac] = parts;
  if (Number(until) < Date.now()) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  try { return await crypto.subtle.verify('HMAC', key, unb64u(mac), enc.encode(`pass.v1.${person}.${device}.${until}`)) ? { person, device, until: Number(until) } : null; } catch { return null; }
}

import { isRecoveryProof, recoveryProof } from './public/js/recovery.js';

const GUARDED = ['pair', 'remove', 'recovery', 'hand', 'box'];   // routes that ask for a fresh proof

export function createPeople({ store, settings, httpError, limit }) {
  const isPublic = Boolean(settings.public);
  // The server's own signature, over challenges and passes. Without a configured secret
  // (a local install), one is made at start: passes then last until a restart, and renew.
  let hmacKey = null;
  const key = async () => (hmacKey ??= await crypto.subtle.importKey('raw', enc.encode(settings.sessionSecret || randomHex(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  const hmac = async (s) => b64u(await crypto.subtle.sign('HMAC', await key(), enc.encode(s)));
  const signed = async (s, mac) => { try { return await crypto.subtle.verify('HMAC', await key(), unb64u(mac), enc.encode(s)); } catch { return false; } };
  const cache = new Map();   // person id -> doc, so checking a pass doesn't read the store each time
  const get = async (id) => {
    if (!/^p-[a-f0-9]{16}$/.test(String(id))) return null;
    if (cache.has(id)) return cache.get(id);
    const p = await store.get('people', id);
    // Only people who exist are kept (any made-up id could be asked about), and not too many.
    if (p) { if (cache.size > 5000) cache.clear(); cache.set(id, p); }
    return p;
  };
  const put = async (p) => { cache.set(p.id, p); await store.put('people', p.id, p); };
  const shown = (p, device) => ({
    id: p.id, name: p.name, created: p.created, recoveryAt: p.recoveryAt ?? null, vault: p.vault ?? null,
    // A code from before the server stopped seeing codes doesn't work any more: make a new one.
    recoveryStale: p.recoveryV !== 2,
    devices: p.devices.map((d) => ({
      id: d.id, label: d.label, added: d.added, seen: d.seen, kind: d.key ? 'key' : 'secret', current: d.id === device,
      // Asking for the key: its box, for a device that has the key to wrap it for.
      ...(d.box && !d.handed ? { asking: d.box } : {}),
      ...(d.id === device && d.handed ? { handed: d.handed } : {}),
    })),
  });

  // What the browser sends: an EC P-256 public key (a box), and AES-GCM ciphertext (a vault,
  // or a key handed over). Checked for shape and size only: the server can't open them.
  const isBox = (k) => k?.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string' && k.x.length < 100 && k.y.length < 100;
  const isSealed = (v) => v && typeof v.iv === 'string' && typeof v.data === 'string' && v.iv.length < 40 && v.data.length < 200;
  const boxOf = (k) => ({ kty: 'EC', crv: 'P-256', x: k.x, y: k.y });
  const sealedOf = (v) => ({ iv: v.iv, data: v.data, ...(isBox(v.from) ? { from: boxOf(v.from) } : {}) });

  // ---------- proving a device ----------

  /** A challenge the server can recognise later without keeping it: a time, some noise,
   *  and its own signature over both. */
  async function challenge() {
    const body = `${Date.now()}.${randomHex(16)}`;
    return { challenge: `${body}.${await hmac(`challenge.${body}`)}` };
  }
  async function freshChallenge(c) {
    const [t, noise, mac] = String(c ?? '').split('.');
    if (!t || !noise || !mac || !await signed(`challenge.${t}.${noise}`, mac)) throw httpError(400, 'that challenge isn\'t one of ours');
    if (Date.now() - Number(t) > CHALLENGE_MS) throw httpError(400, 'that challenge has expired; ask for a new one');
    // Each is answered once: a signed answer someone saw (in a log, say) can't be used again.
    // (One World object answers everything, so this memory is the install's.)
    for (const [k, at] of usedChallenges) if (Date.now() - at > CHALLENGE_MS) usedChallenges.delete(k);
    if (usedChallenges.has(noise)) throw httpError(400, 'that challenge has been used; ask for a new one');
    usedChallenges.set(noise, Date.now());
  }
  const usedChallenges = new Map();   // a used challenge's noise -> when

  /** What a new device offers: its public key (and a signature over the challenge with its
   *  private one), or on an install that allows it, a secret. */
  async function newDevice(body) {
    await freshChallenge(body.challenge);
    const label = String(body.label ?? 'a device').slice(0, 60);
    if (body.key) {
      const key = await importKey(body.key);
      if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(body.signature), enc.encode(body.challenge))) throw httpError(401, 'the signature doesn\'t match that key');
      return { id: `d-${randomHex(8)}`, key: { kty: 'EC', crv: 'P-256', x: body.key.x, y: body.key.y }, label, added: new Date().toISOString(), seen: today() };
    }
    if (body.secret) {
      if (isPublic) throw httpError(400, 'this site needs a device key (it can\'t be made over plain http)');
      if (String(body.secret).length < 32) throw httpError(400, 'that secret is too short');
      return { id: `d-${randomHex(8)}`, secret: await sha(body.secret), label, added: new Date().toISOString(), seen: today() };
    }
    throw httpError(400, 'a device brings a key or a secret');
  }
  async function importKey(jwk) {
    if (jwk?.kty !== 'EC' || jwk?.crv !== 'P-256' || !jwk.x || !jwk.y) throw httpError(400, 'a device key is an EC P-256 public key');
    return crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  /** Is this the device it says it is? */
  async function proves(device, body) {
    if (device.key) {
      await freshChallenge(body.challenge);
      return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await importKey(device.key), unb64u(body.signature ?? ''), enc.encode(body.challenge));
    }
    return Boolean(body.secret) && device.secret === await sha(body.secret);
  }

  /** A new recovery code for them; the old one stops working. Kept as a hash, indexed by it. */
  async function setRecovery(p, proof, vault = null) {
    if (p.recovery) await store.remove('recoveries', p.recovery);
    p.recovery = await sha(`recovery.v2.${proof}`);
    p.recoveryAt = new Date().toISOString();
    p.recoveryV = 2;
    if (vault) p.vault = sealedOf(vault);
    await store.put('recoveries', p.recovery, { person: p.id });
  }
  /** A recovery code the browser made, with the vault it made under it. Without them, the
   *  server makes the code, but not for someone whose key it would lock away (a vault). */
  async function newRecovery(p, body) {
    if (body.recoveryProof != null || body.vault != null) {
      if (!isRecoveryProof(body.recoveryProof)) throw httpError(400, 'a recovery code\'s proof is 64 hex digits');
      if (!isSealed(body.vault)) throw httpError(400, 'a new recovery code comes with the vault it unlocks');
      return { proof: body.recoveryProof, vault: body.vault, made: false };
    }
    if (p.vault) throw httpError(409, 'your recovery code also unlocks your private things, so a new one is made on a device that has them');
    const code = recoveryCode();
    return { code, proof: await recoveryProof(code), vault: null, made: true };
  }

  // ---------- passes ----------

  async function pass(p, device) {
    const until = Date.now() + PASS_MS;
    const body = `v1.${p.id}.${device.id}.${until}`;
    return { pass: `${body}.${await hmac(`pass.${body}`)}`, until: new Date(until).toISOString(), person: shown(p, device.id) };
  }
  /** Who a request comes from: the person and device its pass names, if the pass is ours,
   *  unexpired, and its device is still theirs. Otherwise null. */
  async function whoIs(token) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 5 || parts[0] !== 'v1') return null;
    const [, person, device, until, mac] = parts;
    if (Number(until) < Date.now() || !await signed(`pass.v1.${person}.${device}.${until}`, mac)) return null;
    const p = await get(person);
    return p?.devices.some((d) => d.id === device) ? { person, device, name: p.name } : null;
  }
  const need = (from) => { if (!from.person) throw httpError(401, 'sign in first (your pass may have expired)'); return from; };

  // ---------- routes: people/... ----------

  async function route(method, [, b, c], body, from) {
    if (method !== 'POST' && !(method === 'GET' && b === 'me')) throw httpError(405, 'people routes take POST');
    if (b === 'challenge') return challenge();

    // A new person, with their first device.
    if (!b) {
      const counted = limit('person', from.ip, PEOPLE_A_DAY, `that's ${PEOPLE_A_DAY} new people from here today; more tomorrow`);
      const name = String(body.name ?? '').trim().slice(0, 40);
      if (!name) throw httpError(400, 'a person needs a name');
      const device = await newDevice(body);
      const p = { id: `p-${randomHex(8)}`, name, created: new Date().toISOString(), devices: [device] };
      const r = await newRecovery(p, body);
      await setRecovery(p, r.proof, r.vault);
      await put(p);
      counted();
      return { ...(await pass(p, device)), ...(r.made ? { recovery: r.code } : {}) };
    }

    // A device of theirs signs in (or renews its pass).
    if (b === 'pass') {
      const p = await get(body.person);
      const device = p?.devices.find((d) => d.id === body.device);
      if (!device || !await proves(device, body)) throw httpError(401, 'that device isn\'t one of theirs (it may have been removed)');
      if (device.seen !== today()) { device.seen = today(); await put(p); }
      return pass(p, device);
    }

    // A new device joins with a code from one of theirs, or with the recovery code.
    if (b === 'join') {
      let p;
      const fresh = await newDevice(body);
      if (body.code) {
        const id = await sha(`pair.${tidyPair(body.code)}`);
        const pairing = await store.get('pairings', id);
        await store.remove('pairings', id);
        if (!pairing || pairing.until < Date.now()) throw httpError(401, 'that code isn\'t right, or it has expired (they last ten minutes); make a new one');
        p = await get(pairing.person);
      } else if (body.recoveryProof) {
        // Recovery codes are tried a limited number of times from any one place.
        limit('recover', from.ip, 10, 'too many recovery tries from here today; try again tomorrow')();
        const found = isRecoveryProof(body.recoveryProof) && await store.get('recoveries', await sha(`recovery.v2.${body.recoveryProof}`));
        p = found && await get(found.person);
        if (!p) throw httpError(401, 'that recovery code isn\'t right');
      } else throw httpError(400, 'joining takes a code from another of your devices, or your recovery code');
      if (!p) throw httpError(404, 'that person is gone');
      if (p.devices.length >= MAX_DEVICES) throw httpError(409, `a person can have up to ${MAX_DEVICES} devices; remove one first`);
      if (isBox(body.box)) fresh.box = boxOf(body.box);
      p.devices.push(fresh);
      // A recovery code that's been used is replaced. Where it also unlocks the vault, the
      // new device does that, once it has opened the vault with the old one (people/recovery).
      let recovery;
      if (body.recoveryProof && !p.vault) { recovery = recoveryCode(); await setRecovery(p, await recoveryProof(recovery)); }
      await put(p);
      return { ...(await pass(p, fresh)), ...(recovery ? { recovery } : {}) };
    }

    // Everything else is a signed-in person looking after themselves.
    const me = need(from);
    const p = await get(me.person);
    if (b === 'me') return shown(p, me.device);
    // What could take someone's account from them (a code to add a device, removing one, a new
    // recovery code, handing over their key or asking for it) needs this device to prove itself again, now: a
    // pass alone, copied off a phone, isn't enough.
    if (GUARDED.includes(b)) {
      const d = p.devices.find((x) => x.id === me.device);
      if (!d || !await proves(d, body).catch(() => false)) throw httpError(401, 'this device has to prove itself again for that; reload and try once more');
    }
    if (b === 'pair') {
      const code = pairCode();
      const id = await sha(`pair.${tidyPair(code)}`);
      await store.put('pairings', id, { id, person: p.id, until: Date.now() + PAIR_MS });
      // Old codes nobody used are cleared as new ones are made.
      for (const x of await store.list('pairings')) if (x.until < Date.now() - PAIR_MS) await store.remove('pairings', x.id);
      return { code, until: new Date(Date.now() + PAIR_MS).toISOString() };
    }
    if (b === 'name') {
      const name = String(body.name ?? '').trim().slice(0, 40);
      if (!name) throw httpError(400, 'a name can\'t be empty');
      p.name = name; await put(p);
      return shown(p, me.device);
    }
    if (b === 'remove') {
      if (!p.devices.some((d) => d.id === body.device)) throw httpError(404, 'no such device');
      p.devices = p.devices.filter((d) => d.id !== body.device);
      await put(p);
      await settings.removed?.(p.id, body.device);   // its live connections close (core.mjs)
      return shown(p, me.device);
    }
    if (b === 'recovery') {
      // first: the vault's very first key, from a device that found nobody had one yet.
      if (body.first && p.vault) throw httpError(409, 'you already have a key; another of your devices can hand it over');
      const r = await newRecovery(p, body);
      await setRecovery(p, r.proof, r.vault);
      await put(p);
      return r.made ? { recovery: r.code } : { done: true };
    }
    // Handing the key over: a device asks (its box), another of theirs answers (handed).
    if (b === 'box') {
      if (!isBox(body.box)) throw httpError(400, 'a box is an EC P-256 public key');
      const d = p.devices.find((x) => x.id === me.device);
      d.box = boxOf(body.box); delete d.handed;
      await put(p);
      return shown(p, me.device);
    }
    if (b === 'hand') {
      const d = p.devices.find((x) => x.id === body.device);
      if (!d?.box) throw httpError(404, 'that device isn\'t asking for the key');
      if (!isSealed(body.handed) || !isBox(body.handed.from)) throw httpError(400, 'a key handed over is sealed, with the box it came from');
      d.handed = sealedOf(body.handed);
      await put(p);
      return { done: true };
    }
    if (b === 'took') {
      const d = p.devices.find((x) => x.id === me.device);
      delete d.box; delete d.handed;
      await put(p);
      return shown(p, me.device);
    }
    throw httpError(404, `no route people/${b}${c ? `/${c}` : ''}`);
  }

  /** A device's public key, to check what it signed (tables.mjs). null for a device that keeps a secret. */
  async function deviceKey(person, device) {
    const d = (await get(person))?.devices.find((x) => x.id === device);
    return d?.key ? importKey(d.key) : null;
  }

  /** A device's public key as JWK, for anyone checking what it signed. null if it has none. */
  async function publicKey(person, device) {
    const d = (await get(person))?.devices.find((x) => x.id === device);
    return d?.key ? { kty: 'EC', crv: 'P-256', x: d.key.x, y: d.key.y } : null;
  }

  return { route, whoIs, get, deviceKey, publicKey };
}
