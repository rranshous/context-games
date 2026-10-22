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
// Where browsers won't do this cryptography (a page over plain http, like a phone on the
// LAN reaching a local install), a device can instead keep a random secret, which the
// server keeps the hash of. Only an install that isn't public accepts those.
//
// Stored: people { id, name, created, devices: [{ id, key | secret, label, added, seen }],
// recovery (hash), recoveryAt }; recoveries (by that hash) { person }; pairings (by the
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
const tidyCode = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
// A device code: eight letters and digits that can't be mistaken for each other.
const PAIR_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const pairCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => PAIR_CHARS[b % PAIR_CHARS.length]).join('').replace(/^(.{4})/, '$1-');
const tidyPair = (s) => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

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
    if (!cache.has(id)) cache.set(id, await store.get('people', id));
    return cache.get(id);
  };
  const put = async (p) => { cache.set(p.id, p); await store.put('people', p.id, p); };
  const shown = (p, device) => ({
    id: p.id, name: p.name, created: p.created, recoveryAt: p.recoveryAt ?? null,
    devices: p.devices.map((d) => ({ id: d.id, label: d.label, added: d.added, seen: d.seen, kind: d.key ? 'key' : 'secret', current: d.id === device })),
  });

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
  }

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
  async function setRecovery(p, code) {
    if (p.recovery) await store.remove('recoveries', p.recovery);
    p.recovery = await sha(`recovery.${tidyCode(code)}`);
    p.recoveryAt = new Date().toISOString();
    await store.put('recoveries', p.recovery, { person: p.id });
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
      const code = recoveryCode();
      const p = { id: `p-${randomHex(8)}`, name, created: new Date().toISOString(), devices: [device] };
      await setRecovery(p, code);
      await put(p);
      counted();
      return { ...(await pass(p, device)), recovery: code };
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
      } else if (body.recovery) {
        // Recovery codes are tried a limited number of times from any one place.
        limit('recover', from.ip, 10, 'too many recovery tries from here today; try again tomorrow')();
        const found = await store.get('recoveries', await sha(`recovery.${tidyCode(body.recovery)}`));
        p = found && await get(found.person);
        if (!p) throw httpError(401, 'that recovery code isn\'t right');
      } else throw httpError(400, 'joining takes a code from another of your devices, or your recovery code');
      if (!p) throw httpError(404, 'that person is gone');
      if (p.devices.length >= MAX_DEVICES) throw httpError(409, `a person can have up to ${MAX_DEVICES} devices; remove one first`);
      p.devices.push(fresh);
      let recovery;
      if (body.recovery) { recovery = recoveryCode(); await setRecovery(p, recovery); }
      await put(p);
      return { ...(await pass(p, fresh)), ...(recovery ? { recovery } : {}) };
    }

    // Everything else is a signed-in person looking after themselves.
    const me = need(from);
    const p = await get(me.person);
    if (b === 'me') return shown(p, me.device);
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
      return shown(p, me.device);
    }
    if (b === 'recovery') {
      const code = recoveryCode();
      await setRecovery(p, code);
      await put(p);
      return { recovery: code };
    }
    throw httpError(404, `no route people/${b}${c ? `/${c}` : ''}`);
  }

  return { route, whoIs, get };
}
