// A bot racer over the real wire, for testing shared races alone: a fresh aura, a real proof of the
// hearth-god's name, then it drives the autopilot. `corepack pnpm racer-bot [circuit]`, then take the
// starting line in the browser within the lobby (and pick the same circuit; the first is 0).
import WebSocket from 'ws';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, nameStrength, spiritAt, MIN_NAME_BITS } from '@truenames/universe';
import { proveName } from '@truenames/proofs';
import { autopilot, buildTrack, HEARTH_GOD, type CarState } from '@truenames/dungeon';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const SECRET = Uint8Array.from({ length: 32 }, () => (Math.random() * 256) | 0);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
let nonce = 0n;
while (nameStrength(HEARTH_GOD, ed25519.getPublicKey(SECRET), nonce) < MIN_NAME_BITS) nonce++;
const level = Number(process.argv[2] ?? 0);
const ws = new WebSocket(process.env.DUNGEON_URL ?? 'ws://localhost:5192');
const log = (...a: unknown[]) => console.log('[bot]', ...a);
let mine = -1, seq = 0, track: any = null;
const car: CarState = { x: 0, y: 0, vx: 0, vy: 0, a: 0, spin: 0, slide: 0, slow: 0, top: 1, hint: -1 };
let last: any = null, lastLog = 0;
ws.on('open', () => ws.send(JSON.stringify({ t: 'open', level, world: 'racer' })));
ws.on('message', async (raw) => {
  const m = JSON.parse(String(raw));
  if (m.t === 'ticket') {
    log('ticket', m.context.slice(0, 8));
    const claim = await proveName({ cell: HEARTH_GOD, nonce, secretKey: SECRET, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: BigInt(m.context) }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
    ws.send(JSON.stringify({ t: 'journey', aura: AURA, bundle: [{ slot: 0, claim }] }));
  } else if (m.t === 'welcome') {
    mine = m.car; track = { pts: m.track.pts.map(([x, y]: number[]) => ({ x, y })), halfWidth: m.track.halfWidth };
    log('on the grid as car', mine, 'aura', AURA.slice(0, 6));
    setInterval(() => {
      if (!last) return;
      Object.assign(car, last.cars[mine]);
      const c = autopilot(car, track, last.cars.filter((x: any) => x.id !== mine));
      ws.send(JSON.stringify({ t: 'drive', cmds: [{ seq: ++seq, ...c, dt: 1 / 30 }] }));
    }, 1000 / 30);
  } else if (m.t === 'rsnap') {
    last = m;
    if (Date.now() - lastLog > 3000) { lastLog = Date.now(); log(`lobby ${m.lobby?.toFixed(1)} players ${m.players} countdown ${m.countdown.toFixed(1)} place ${m.cars[mine]?.place} lap ${m.cars[mine]?.lap} others ${m.cars.filter((c: any) => c.player && c.id !== mine).map((c: any) => c.player.slice(0, 6) + '@' + c.place).join(',')}`); }
  } else if (m.t === 'end') { log('END', JSON.stringify(m.result)); process.exit(0); }
  else if (m.t === 'error') log('error', m.message);
});
ws.on('close', () => { log('closed'); process.exit(0); });
