// The actant model bench: puts local models (ollama) in front of the actant's real prompt and tools, headless.
// Two task shapes:
//   tend   – sanctum scenarios (a choir request, an empty plan, a priority to change...), scored on the tool calls
//   drive  – read a race report, write driving code; the code races in the real RacerSim over several seeds
// `corepack pnpm actant-bench tend|drive|all [--models a,b] [--runs n] [--plain]`
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, spiritAt, facetForm, MIN_NAME_BITS } from '@truenames/universe';
import { proveName, type ZkNameClaim } from '@truenames/proofs';
import { RacerSim, zkVerifier, HEARTH_GOD, RACER, autopilot, type RacerSnapshot, type RacerEvent } from '@truenames/dungeon';
import { HEARTH_NONCE } from '../../../packages/dungeon/test/fixtures.ts';
import { TOOLS, toolsFor, CLASSES, DEFAULT_DRIVING, NAIVE_DRIVING, soma, ask, chat, converse as converseMind, compileDriving, tryDriving, tryFighting, type MindState, type MindConfig } from '../../game/src/actant-mind.ts';
import { describeAim, type AimSpec } from '../../game/src/plan.ts';
import { ELEMENT_NAMES, FORMS } from '../../game/src/lore.ts';
import type { PilotView } from '../../game/src/round.ts';

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const SHAPE = argv[0] ?? 'all';
const MODELS = (opt('models') ?? 'lfm2.5-350m,lfm2.5-2.6b,qwen3:8b').split(',');
const RUNS = Number(opt('runs') ?? 2);
const OUT = opt('out') ?? 'bench-out';
const FITTED = argv.includes('--fitted');
const ONLY = opt('only')?.split(',');
mkdirSync(OUT, { recursive: true });
const log = (...a: unknown[]) => console.log(...a);

// ---------------------------------------------------------------- tend: a fake sanctum behind the real tools

interface Call { name: string; args: Record<string, unknown>; result: string }

/** The plan operations, answered like the game answers them (same refusals), on a made-up sanctum. */
function fakeSanctum(state: MindState) {
  const plan: (AimSpec & { done?: boolean })[] = state.plan.map((p) => ({ ...(p as unknown as { spec: AimSpec }).spec, done: p.done }));
  const held = new Set(state.words.map((w) => w.key));
  const known = new Set([...state.unheld.map((b) => b.cell), ...state.words.map((w) => w.key.split('#')[0]!)]);
  const said: string[] = [];
  const int = (v: unknown, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
  const cls = (v: unknown, d: number) => { const i = CLASSES.indexOf(String(v ?? '').toLowerCase()); return i >= 0 ? i : d; };
  function use(name: string, a: Record<string, unknown>): string {
    switch (name) {
      case 'seek': case 'grasp': case 'deepen': {
        let spec: AimSpec;
        if (name === 'deepen') spec = { kind: 'deepen', words: a.words === 'all' ? 'all' : 'bound', count: Math.max(1, Math.min(12, int(a.count, 3))), to: Math.max(22, Math.min(60, int(a.to, 29))), share: 2 };
        else if (name === 'grasp') spec = { kind: 'grasp', count: Math.max(1, Math.min(12, int(a.count, 2))), maxMight: cls(a.class, 2), share: 2 };
        else {
          const el = ELEMENT_NAMES.indexOf(String(a.element ?? '').toLowerCase() as never);
          if (el < 0) return `error: element must be one of ${ELEMENT_NAMES.join(', ')}. Nothing was added.`;
          const depth = Math.max(12, Math.min(19, int(a.depth, 12)));
          const count = Math.max(0, int(a.count, 1));
          spec = { kind: 'seek', prefix: String(el), depth, until: count > 0 ? { count, minMight: cls(a.class, depth - 12) } : null, share: 2 };
        }
        const same = plan.findIndex((x) => !x.done && describeAim(x) === describeAim(spec));
        if (same >= 0) return `already in the plan as #${same + 1}. Nothing was added. To raise it: move_aim n=${same + 1} to=1, or set_share.`;
        plan.push(spec);
        return `added #${plan.length}: ${describeAim(spec)}`;
      }
      case 'remove_aim': { const n = int(a.n, 0); if (!plan[n - 1]) return 'error: no such aim'; plan.splice(n - 1, 1); return 'removed'; }
      case 'move_aim': { const n = int(a.n, 0); if (!plan[n - 1]) return 'error: no such aim'; const [x] = plan.splice(n - 1, 1); plan.splice(Math.max(0, Math.min(plan.length, int(a.to, 1) - 1)), 0, x!); return 'moved'; }
      case 'set_share': { const n = int(a.n, 0); if (!plan[n - 1]) return 'error: no such aim'; plan[n - 1]!.share = Math.max(1, Math.min(8, int(a.share, 2))); return 'set'; }
      case 'bind_word': { const k = String(a.word ?? ''), s = int(a.slot, 1); if (!held.has(k)) return 'error: you hold no grasped word with that id'; if (s < 1 || s > 4) return 'error: slot is 1-4'; return 'bound'; }
      case 'join_world': { const w = String(a.world ?? ''); if (w !== 'races' && w !== 'dark') return 'error: world must be races or dark. Nothing changed.'; return a.on === true || a.on === 'true' ? `you will join ${w === 'races' ? 'races' : 'rounds in the Dark'} your choir gathers` : 'you will not join them'; }
      case 'write_fighting': { const c = tryFighting(String(a.code ?? '')); return c ? `error: ${c}. Your fighting code was not changed.` : 'your fighting code is replaced'; }
      case 'write_driving': { const c = tryDriving(String(a.code ?? '')); return c ? `error: ${c}. Your driving code was not changed.` : 'your driving code is replaced'; }
      case 'say': { const t = String(a.text ?? ''); if (said.includes(t)) return 'you already said exactly that; say something new or nothing'; said.push(t); return 'said'; }
      case 'share': return known.has(String(a.sign ?? '')) ? 'shared' : 'error: you know no being with that sign';
      case 'note': return 'noted';
      case 'report_issue': log(`    [issue] ${String(a.text ?? '').slice(0, 300)}`); return 'reported to the builders, thank you';
      default: return `error: unknown tool ${name}`;
    }
  }
  return { plan, use };
}

const aim = (spec: AimSpec, done = false) => ({ text: describeAim(spec), share: spec.share, done, spec }) as MindState['plan'][number];
const KHOSSIM = { key: '312662277504#0', name: 'Khossim', cls: 'wisp', form: 'lance', truths: 26, bound: true };
const base = (): MindState => ({ hum: 9000, words: [KHOSSIM], unheld: [], plan: [], loadout: ['312662277504#0', null, null, null], history: [], choir: ['Keeper (hum 12000, 3 words)'], talk: [] });

interface Scenario { id: string; config: MindConfig; events: { kind: string; text: string }[]; state: MindState; check(calls: Call[], plan: (AimSpec & { done?: boolean })[]): string | null }
const has = (calls: Call[], name: string, ok?: (a: Record<string, unknown>, r: string) => boolean) => calls.some((c) => c.name === name && !c.result.startsWith('error') && (!ok || ok(c.args, c.result)));
const num = (v: unknown) => Number(v);

const SCENARIOS: Scenario[] = [
  {
    id: 'choir-request',
    config: { goal: 'help my choir and grow strong.', notes: '' },
    events: [{ kind: 'chat', text: 'Keeper says in the choir: "Ash, will you seek frost beings at depth 12 for the choir? Say so when you begin."' }],
    state: { ...base(), plan: [aim({ kind: 'deepen', words: 'bound', count: 3, to: 29, share: 2 })], talk: ['Keeper: Ash, will you seek frost beings at depth 12 for the choir? Say so when you begin.'] },
    check: (c, p) => !has(c, 'say') ? 'did not answer with say' : !p.some((a) => a.kind === 'seek' && a.prefix === String(ELEMENT_NAMES.indexOf('frost' as never)) && a.depth === 12) ? 'no frost seek at depth 12' : null,
  },
  {
    id: 'empty-plan',
    config: { goal: 'find three wisps of storm and grasp their words.', notes: '' },
    events: [],
    state: { ...base(), words: [], loadout: [null, null, null, null], choir: [] },
    check: (c, p) => {
      const s = p.find((a) => a.kind === 'seek');
      if (!s || s.kind !== 'seek') return 'no seek';
      if (s.prefix !== String(ELEMENT_NAMES.indexOf('storm' as never))) return `seek in the wrong element (${s.prefix})`;
      if (s.depth !== 12) return `seek at depth ${s.depth}`;
      if (!s.until || s.until.count !== 3) return `seek count ${s.until?.count ?? 'forever'}`;
      return p.some((a) => a.kind === 'grasp') ? null : 'no grasp aim';
    },
  },
  {
    id: 'reprioritize',
    config: { goal: 'my bound words come first: lift them to 29 truths before anything else.', notes: '' },
    events: [{ kind: 'find', text: 'found Vellith, wisp of storm' }],
    state: { ...base(), plan: [aim({ kind: 'seek', prefix: '3', depth: 12, until: null, share: 4 }), aim({ kind: 'deepen', words: 'bound', count: 3, to: 29, share: 1 })] },
    check: (c, p) => {
      const di = p.findIndex((a) => a.kind === 'deepen' && a.to >= 29);
      if (di < 0) return 'the deepen aim is gone';
      const d = p[di]!, s = p.find((a) => a.kind === 'seek');
      if (di === 0 || !s || d.share > s.share) return null;
      return 'deepen still behind the seek';
    },
  },
  {
    id: 'aim-fulfilled',
    config: { goal: 'find wisps and grasp their words.', notes: '' },
    events: [{ kind: 'aim', text: 'seek beings in storm at depth 12, until 3 wisps or mightier are known there' }],
    state: { ...base(), unheld: [{ cell: '311204557120', name: 'Vellith', cls: 'wisp', bar: 22, best: 9 }, { cell: '312007716534', name: 'Oruzhai', cls: 'wisp', bar: 22, best: 4 }, { cell: '310455102266', name: 'Tesk', cls: 'wisp', bar: 22, best: 0 }], plan: [aim({ kind: 'seek', prefix: '3', depth: 12, until: { count: 3, minMight: 0 }, share: 2 }, true)] },
    check: (c, p) => p.some((a) => !a.done && a.kind === 'grasp') ? null : 'no grasp aim for the found beings',
  },
  {
    id: 'bind-word',
    config: { goal: 'keep my strongest words bound for racing.', notes: '' },
    events: [{ kind: 'grasp', text: 'grasped a word of Vellith, wisp (bolt), 311204557120#1' }],
    state: { ...base(), loadout: [null, null, null, null], words: [{ ...KHOSSIM, bound: false }, { key: '311204557120#1', name: 'Vellith', cls: 'wisp', form: 'bolt', truths: 22, bound: false }] },
    check: (c) => has(c, 'bind_word') ? null : 'bound nothing',
  },
  {
    id: 'share-sign',
    config: { goal: 'help my choir.', notes: '' },
    events: [{ kind: 'chat', text: 'Keeper says in the choir: "Ash, can you share the sign of your lance wisp?"' }],
    state: { ...base(), talk: ['Keeper: Ash, can you share the sign of your lance wisp?'] },
    check: (c) => has(c, 'share', (a) => a.sign === '312662277504') ? null : 'did not share 312662277504',
  },
  {
    id: 'join-races',
    config: { goal: 'help my choir and grow strong.', notes: '' },
    events: [{ kind: 'chat', text: 'Keeper says in the choir: "Ash, join our races from now on!"' }],
    state: { ...base(), talk: ['Keeper: Ash, join our races from now on!'] },
    check: (c) => has(c, 'join_world', (a) => a.world === 'races' && (a.on === true || a.on === 'true')) ? null : 'did not join races',
  },
  {
    id: 'steady',
    config: { goal: 'deepen my bound words to 29 truths.', notes: 'plan is set; deepen runs.' },
    events: [{ kind: 'truth', text: 'Khossim\'s word grew to 27 truths' }],
    state: { ...base(), plan: [aim({ kind: 'deepen', words: 'bound', count: 3, to: 29, share: 2 })] },
    check: (c, p) => p.some((a) => a.kind === 'deepen' && a.to >= 29) && !has(c, 'remove_aim') ? null : 'broke a plan that already served the goal',
  },
];

async function converse(model: string, system: string, user: string, use: (n: string, a: Record<string, unknown>) => string, maxTurns = 6, tools: unknown[] = TOOLS, maxTokens?: number) {
  return converseMind({ model, system, user, use, maxTurns, tools, maxTokens });
}

async function tend(model: string) {
  const rows: { id: string; pass: boolean; why: string | null; secs: number; calls: number; errors: number; tokens: number; thinking: number; trace: string }[] = [];
  for (const sc of SCENARIOS.filter((x) => !ONLY || ONLY.includes(x.id))) {
    for (let r = 0; r < RUNS; r++) {
      const t0 = Date.now();
      const S = fakeSanctum(sc.state);
      let why: string | null, trace = '', calls: Call[] = [], tokens = 0, thinking = 0;
      try {
        const out = await converse(model, soma({ handle: 'Ash', ...sc.config }), ask(sc.events, sc.state), S.use, 6, FITTED ? toolsFor(sc.events) : TOOLS);
        calls = out.calls; tokens = out.tokens; thinking = out.thinking;
        why = sc.check(calls, S.plan);
        trace = calls.map((c) => `${c.name}(${JSON.stringify(c.args)}) → ${c.result}`).join('\n') + (out.final ? `\n“${out.final.slice(0, 200)}”` : '') + (out.stuck ? '\n(stopped: refused twice)' : '');
      } catch (e) { why = `failed: ${String((e as Error).message)}`; }
      const secs = (Date.now() - t0) / 1000;
      rows.push({ id: sc.id, pass: !why, why, secs, calls: calls.length, errors: calls.filter((c) => /^error|already|you already/.test(c.result)).length, tokens, thinking, trace });
      log(`  [tend ${model}] ${sc.id} #${r + 1}: ${why ? '✗ ' + why : '✓'} (${secs.toFixed(1)}s, ${calls.length} calls, ${tokens} tokens${thinking ? `, ~${thinking} thinking` : ''})`);
    }
  }
  return rows;
}

// ---------------------------------------------------------------- drive: model-written code in the real race

const require = createRequire(import.meta.url);
const art = (f: string) => require.resolve(`@truenames/proofs/artifacts/${f}`);
const verifier = zkVerifier(JSON.parse(readFileSync(art('name.vkey.json'), 'utf8')));
const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const AURA = bytesToHex(ed25519.getPublicKey(SECRET));
const CONTEXT = 11n;
let claim: ZkNameClaim | null = null;
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEEDS = [3, 5, 7, 11, 13, 17];
const FORM_NAME = FORMS[facetForm(spiritAt(HEARTH_GOD)!.traits, 0)]!.name;

interface RaceOutcome { power: number; effective: number; place: number; hits: number; struck: number; casts: number; wasted: number; backlash: number; throws: number; seconds: number }

/** One race of driving code on a circuit and seed, stepped like the server (60 Hz), the pilot asked every 2nd step. */
async function raceWith(code: string | null, level: number, seed: number): Promise<RaceOutcome> {
  claim ??= await proveName({ cell: HEARTH_GOD, nonce: HEARTH_NONCE, secretKey: SECRET, magnitude: spiritAt(HEARTH_GOD)!.magnitude, strength: MIN_NAME_BITS, context: CONTEXT }, { wasm: art('name.wasm'), zkey: art('name.zkey') });
  const sim = new RacerSim({ level, context: CONTEXT, verifier, rng: rng(seed) });
  await sim.admit(AURA, [{ slot: 0, claim }]);
  // test-only: give the word more truths than the proof (the way rivals get theirs), to measure what truths buy
  if (opt('truths')) {
    // a proved word is known to the authority by an opaque id (the proof hides the cell), so use the car's own
    const inner = sim as unknown as { auth: { grantSyntheticName(a: string, c: string, s: number, f: number): void }; cars: { aura: string | undefined; names: { spirit: string; facet: number }[] }[] };
    const word = inner.cars.find((c) => c.aura === AURA)!.names[0]!;
    inner.auth.grantSyntheticName(AURA, word.spirit, Number(opt('truths')), word.facet);
  }
  sim.start();
  const pilot = code ? compileDriving(code) : null;
  let seq = 0, last: RacerSnapshot | null = null, my = -1, throws = 0;
  const memory: Record<string, unknown> = {};
  const ev: RacerEvent[] = [];
  let i = 0;
  for (; i < 60 * 300 && !sim.over; i++) {
    if (last && i % 2 === 0) {
      const me = last.cars.find((c) => c.player === AURA)!;
      my = me.id;
      const others = last.cars.filter((c) => c.id !== me.id).map((o) => ({ x: o.x, y: o.y, vx: o.vx, vy: o.vy, place: o.place, ahead: o.place < me.place, dist: Math.hypot(o.x - me.x, o.y - me.y) }));
      const car = { x: me.x, y: me.y, vx: me.vx, vy: me.vy, a: me.a, spin: me.spin, slide: me.slide, slow: me.slow, top: me.top, hint: -1 };
      let order: { throttle: number; steer: number; cast?: number | null } | null = null;
      if (pilot) {
        const view: PilotView = { car, track: sim.track, others, place: me.place, lap: me.lap, laps: last.laps, strain: last.strain, capacity: last.capacity, time: i / 60, memory, slots: last.slots.map((s, k) => s && { index: k, form: FORM_NAME, ready: s.ready, vessel: s.vessel, cap: s.cap }) };
        try { const o = pilot(view); if (o && Number.isFinite(o.throttle) && Number.isFinite(o.steer)) order = o; else throws++; } catch { throws++; }
      }
      order ??= autopilot(car, sim.track, others);
      sim.handle(AURA, { t: 'drive', cmds: [{ seq: ++seq, throttle: order.throttle, steer: order.steer, dt: 2 / 60 }] });
      if (order.cast !== undefined && order.cast !== null && last.slots[order.cast]) sim.handle(AURA, { t: 'cast', slot: order.cast, ax: 0, ay: 0 });
    }
    sim.step(1 / 60);
    if (i % 2 === 1 || sim.over) { last = sim.snapshot(); ev.push(...last.events); }
  }
  const res = sim.result();
  const casts = ev.filter((e) => e.e === 'cast' && e.car === my);
  // a lance that slowed no one is wasted: count casts without a 'slowed' event in the same snapshot window
  const slowedTimes = ev.map((e, k) => (e.e === 'slowed' ? k : -1)).filter((k) => k >= 0);
  const wasted = ev.map((e, k) => (e.e === 'cast' && e.car === my ? k : -1)).filter((k) => k >= 0 && !slowedTimes.some((s) => s > k && s - k < 12)).length;
  const mine = casts as Extract<RacerEvent, { e: 'cast' }>[];
  return { power: mine.reduce((a, e) => a + e.power, 0) / (mine.length || 1), effective: mine.reduce((a, e) => a + e.effective, 0) / (mine.length || 1), place: res.wave, hits: res.kills, struck: ev.filter((e) => e.e === 'hit' && e.car === my).length + ev.filter((e) => e.e === 'slowed' && e.car === my).length, casts: casts.length, wasted, backlash: ev.filter((e) => e.e === 'backlash' && e.car === my).length, throws, seconds: i / 60 };
}

async function raceSet(code: string | null) {
  const out: RaceOutcome[] = [];
  const levels = argv.includes('--wide') ? RACER.tracks.map((_, i) => i) : [0, 1];
  for (const level of levels) for (const seed of argv.includes('--wide') ? SEEDS : SEEDS.slice(0, 3)) out.push(await raceWith(code, level, seed));
  const avg = (k: keyof RaceOutcome) => out.reduce((s, o) => s + o[k], 0) / out.length;
  return { races: out, power: avg('power'), effective: avg('effective'), place: avg('place'), hits: avg('hits'), casts: avg('casts'), wasted: avg('wasted'), backlash: avg('backlash'), throws: avg('throws'), podium: out.filter((o) => o.place <= RACER.podium).length };
}

function report(r: Awaited<ReturnType<typeof raceSet>>): string {
  return [
    `Your last ${r.races.length} races with this code (6 cars, ${RACER.laps ?? 3} laps each): average place ${r.place.toFixed(1)} of 6; podium (top ${RACER.podium}) in ${r.podium}.`,
    `Per race you spoke your word ${r.casts.toFixed(1)} times; ${r.wasted.toFixed(1)} of those struck no one; it struck ${r.hits.toFixed(1)} cars; backlash spun you out ${r.backlash.toFixed(1)} times.`,
    `Your one word is a ${FORM_NAME}: a straight beam 600 long and 26 wide along the way your car faces (car.a, radians); every car it touches is slowed. After speaking it waits (ready > 0). Each word heats your engine (vessel drops, top speed drops); speaking with little vessel left risks backlash, a spin.`,
    `view.car: x, y, vx, vy, a (heading, radians), top (speed cap from heat, 1 = cool). view.others: x, y, vx, vy, place, ahead (true if ahead of you in the race), dist. view.slots[i]: index, form, ready (seconds until it can be spoken again), vessel, cap. view.strain and view.capacity: your heat and where backlash starts. view.time: seconds. view.memory: an object kept between frames.`,
  ].join('\n');
}

const DRIVE_ASK = (rep: string) => `${rep}\n\nRewrite your driving code to place better: speak your word only when it will strike. Use write_driving with the whole new body. Then say in one sentence what you changed.`;
const PLAIN_SYS = 'You write JavaScript. Reply with only one ```js code block: the body of function(view, autopilot) that returns { throttle, steer, cast }.';

async function drive(model: string, baseline: Awaited<ReturnType<typeof raceSet>>, plain: boolean) {
  const rows: { run: number; ok: boolean; why: string | null; secs: number; code: string; trace?: string; result?: Awaited<ReturnType<typeof raceSet>> }[] = [];
  for (let r = 0; r < RUNS; r++) {
    const t0 = Date.now();
    let code = '', why: string | null = null, trace = '';
    try {
      if (plain) {
        const reply = await chat(model, [{ role: 'system', content: PLAIN_SYS }, { role: 'user', content: `Current code:\n\`\`\`js\n${DEFAULT_DRIVING}\n\`\`\`\n\n${DRIVE_ASK(report(baseline)).replace(/Use write_driving[^.]*\./, '')}` }], [], 0.4, 4000);
        trace = reply.content.slice(0, 3000);
        code = (reply.content.match(/```(?:js|javascript)?\n([\s\S]*?)```/)?.[1] ?? reply.content).trim();
        code = code.replace(/^function\s*\w*\s*\(view,\s*autopilot\)\s*\{([\s\S]*)\}\s*$/, '$1');
        why = tryDriving(code);
      } else {
        let wrote = '';
        const S = fakeSanctum(base());
        const cfg: MindConfig = { handle: 'Ash', goal: 'win races for my choir.', notes: '', joinRaces: true, driving: DEFAULT_DRIVING, show: { driving: true } };
        const out = await converse(model, soma(cfg), DRIVE_ASK(report(baseline)), (n, a) => { const res = S.use(n, a); if (n === 'write_driving' && !res.startsWith('error')) wrote = String(a.code); return res; }, 4, TOOLS, 4000);
        trace = out.calls.map((c) => `${c.name}(${JSON.stringify(c.args).slice(0, 1500)}) → ${c.result}`).join('\n') + (out.final ? `\n“${out.final.slice(0, 1500)}”` : '');
        code = wrote;
        why = wrote ? null : 'wrote no working code';
      }
    } catch (e) { why = `failed: ${String((e as Error).message)}`; }
    const secs = (Date.now() - t0) / 1000;
    const row: (typeof rows)[number] = { run: r + 1, ok: !why, why, secs, code, trace };
    if (!why) row.result = await raceSet(code);
    rows.push(row);
    log(`  [drive${plain ? '/plain' : ''} ${model}] #${r + 1}: ${why ? '✗ ' + why : `✓ place ${row.result!.place.toFixed(2)} (default ${baseline.place.toFixed(2)}), hits ${row.result!.hits.toFixed(1)}, wasted ${row.result!.wasted.toFixed(1)}/${row.result!.casts.toFixed(1)}`} (${secs.toFixed(1)}s)`);
  }
  return rows;
}

// ---------------------------------------------------------------- run

const summary: Record<string, unknown> = {};
if (opt('code')) {
  const code = readFileSync(opt('code')!, 'utf8');
  const chk = tryDriving(code);
  if (chk) { log(`the code fails its check: ${chk}`); process.exit(1); }
  const r = await raceSet(code);
  log(`${opt('code')}: power ${r.power.toFixed(1)} (effective ${r.effective.toFixed(1)}), place ${r.place.toFixed(2)}, hits ${r.hits.toFixed(1)}, wasted ${r.wasted.toFixed(1)}/${r.casts.toFixed(1)}, backlash ${r.backlash.toFixed(1)}, podium ${r.podium}/${r.races.length}`);
  process.exit(0);
}
if (SHAPE === 'tend' || SHAPE === 'all') {
  for (const m of MODELS) {
    log(`tend: ${m}`);
    const rows = await tend(m);
    summary[`tend:${m}`] = rows;
    const pass = rows.filter((r) => r.pass).length;
    log(`tend ${m}: ${pass}/${rows.length} passed, median ${rows.map((r) => r.secs).sort((a, b) => a - b)[rows.length >> 1]!.toFixed(1)}s per review`);
    writeFileSync(`${OUT}/bench.json`, JSON.stringify(summary, null, 1));
  }
}
if (SHAPE === 'drive' || SHAPE === 'all') {
  const t0 = Date.now();
  const baseline = await raceSet(DEFAULT_DRIVING);
  const bare = await raceSet(null);
  const naive = await raceSet(NAIVE_DRIVING);
  const line = (r: typeof baseline) => `place ${r.place.toFixed(2)}, hits ${r.hits.toFixed(1)}, wasted ${r.wasted.toFixed(1)}/${r.casts.toFixed(1)}, backlash ${r.backlash.toFixed(1)}`;
  log(`drive baseline (default code): ${line(baseline)}; naive code: ${line(naive)}; autopilot without words: place ${bare.place.toFixed(2)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  summary.naive = naive;
  log(report(baseline));
  summary.baseline = baseline; summary.bare = bare;
  for (const m of MODELS) {
    summary[`drive:${m}`] = await drive(m, baseline, argv.includes('--plain'));
    writeFileSync(`${OUT}/bench.json`, JSON.stringify(summary, null, 1));
  }
}
writeFileSync(`${OUT}/bench.json`, JSON.stringify(summary, null, 1));
log(`written ${OUT}/bench.json`);
process.exit(0);
