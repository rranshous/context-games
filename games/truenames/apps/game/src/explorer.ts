// Explorer Claude: a space carved into the app so Claude (through Playwright's evaluate, or CDP on a desktop build) can
// play the game itself: see where it is, read a round's state and log, take the controls with its own code, take a
// screenshot, and shard a model into the app to play a round and leave a report. Installed in development, or with
// ?explorer in the address. The screens register hooks here; this module never touches the save or the services, so
// the thin round screens can import it.
import type { World } from '@truenames/dungeon/protocol';
import { reportIssue } from './round.ts';
import { chat, converse, compileDriving, compileFighting, tryDriving, tryFighting, DEFAULT_DRIVING, DEFAULT_FIGHTING, TOOLS, OLLAMA } from './actant-mind.ts';

/** What a round screen lends the explorer while it's on screen. */
export interface RoundHooks {
  world: World;
  /** What a pilot or fighter would see now (PilotView / FightView). */
  view(): unknown;
  /** The round in brief: wave or place, health, lobby, over. */
  state(): Record<string, unknown>;
  /** Hand the controls to code (compiled here), or back to the keyboard with null. */
  control(code: string | null): void;
  go(): void;
  pause(on: boolean): void;
  /** Players in this round (a shard only pauses a round it has alone). */
  players(): number;
}

/** What the sanctum lends: a walk into a world (by hand, or under the explorer's code), and a summary. */
export interface SanctumHooks {
  walk(world: World, level: number): Promise<void>;
  summary(): Record<string, unknown>;
}

const hooks: { round: RoundHooks | null; sanctum: SanctumHooks | null; screen: string } = { round: null, sanctum: null, screen: 'title' };
const lines: { t: number; line: string }[] = [];
let read = 0; // the log index events() has reached
let code: string | null = null; // the code at the controls (null: hands)

/** Screens report what happens, in a line each (the explorer's eyes between screenshots). */
export function note(line: string) {
  lines.push({ t: performance.now() / 1000, line });
  if (lines.length > 400) { lines.splice(0, lines.length - 400); read = Math.max(0, read - 1); }
}

export function enterScreen(name: string) { hooks.screen = name; }

export function lendRound(h: RoundHooks | null) {
  hooks.round = h;
  if (h) { hooks.screen = h.world; note(`entered ${h.world}`); if (code) h.control(code); }
}
export function lendSanctum(h: SanctumHooks | null) { hooks.sanctum = h; if (h) hooks.screen = 'sanctum'; }

/** Is a round's code to come from the explorer? (The screens ask when they mount.) */
export function explorerCode(world: World): ((v: never) => unknown) | null {
  if (!code) return null;
  try { return (world === 'racer' ? compileDriving(code) : compileFighting(code)) as never; } catch { return null; }
}

// ---------- the shard: a model inside the app, playing through code and reporting ----------
interface Shard { model: string; goal: string; every: number; running: boolean; turns: number; notes: string[]; issues: string[]; report: string | null; error: string | null }
let shard: Shard | null = null;

const SHARD_TOOLS = (world: World) => [
  ...TOOLS.filter((t) => t.function.name === (world === 'racer' ? 'write_driving' : 'write_fighting') || t.function.name === 'report_issue'),
  { type: 'function', function: { name: 'note', description: 'Write down something you noticed about the game (for your report).', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } } },
];

function brief(world: World, view: Record<string, unknown>): string {
  if (world === 'dark') {
    const v = view as { me: { hp: number; ward: number; strain: number; capacity: number }; enemies: { kind: string; dist: number }[]; allies: unknown[]; wave: number; waves: number };
    const kinds: Record<string, number> = {};
    for (const e of v.enemies) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    return `wave ${v.wave + 1} of ${v.waves}; you: hp ${Math.round(v.me.hp)}, ward ${Math.round(v.me.ward)}, strain ${v.me.strain.toFixed(1)} of ${v.me.capacity.toFixed(1)}; ${v.allies.length} allies; enemies: ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}; nearest at ${Math.round(v.enemies[0]?.dist ?? 0)}`;
  }
  const v = view as { place: number; lap: number; laps: number; strain: number; capacity: number };
  return `place ${v.place}, lap ${v.lap + 1} of ${v.laps}, strain ${v.strain.toFixed(1)} of ${v.capacity.toFixed(1)}`;
}

async function runShard(s: Shard) {
  const r = () => hooks.round;
  // wait for a round
  while (s.running && !r()) await new Promise((res) => setTimeout(res, 500));
  const world = r()?.world ?? 'dark';
  code ??= world === 'racer' ? DEFAULT_DRIVING : DEFAULT_FIGHTING;
  r()?.control(code);
  const system = [
    `You are Explorer, a playtester inside Truenames, playing ${world === 'racer' ? 'Dark Racer (a top-down race)' : 'the Dark (waves of enemies in an arena)'} by writing the code that plays it.`,
    `Your goal: ${s.goal}`,
    'The game is experimental and still being built: if something about the game itself seems broken or wrong, report it with report_issue. If your code plays poorly (it aims at the wrong enemy, speaks at the wrong time), that is not a game issue: rewrite your code.',
    'Every so often you see how the round is going and what happened, with your current code. Rewrite the code when it would play better (the whole function body), and note anything about the game itself that seems off, confusing or fun. Keep turns short.',
  ].join('\n');
  try {
    while (s.running && r() && !r()!.state().over) {
      await new Promise((res) => setTimeout(res, s.every * 1000));
      const round = r();
      if (!s.running || !round || round.state().over) break;
      if (round.state().lobby !== null && round.state().lobby !== undefined) { round.go(); continue; }
      const solo = round.players() <= 1;
      if (solo) round.pause(true); // a local model thinks slowly: a round it has alone waits for it
      const happened = events().slice(-40).join('\n');
      const user = `Now: ${brief(world, round.view() as Record<string, unknown>)}\n\nWhat happened since last time:\n${happened || '(nothing new)'}\n\nYour code:\n${code}`;
      const out = await converse({
        model: s.model, system, user, tools: SHARD_TOOLS(world), maxTurns: 3,
        use: (name, a) => {
          if (name === 'note') { s.notes.push(String(a.text ?? '').slice(0, 400)); return 'noted'; }
          if (name === 'report_issue') { const t = String(a.text ?? '').slice(0, 2000); s.issues.push(t); void reportIssue('explorer shard', t, world); note(`[shard] reported an issue: ${t.slice(0, 160)}`); return 'reported to the builders'; }
          const next = String(a.code ?? '');
          const check = world === 'racer' ? tryDriving(next) : tryFighting(next);
          if (check) return `error: ${check}. Your code was not changed.`;
          code = next;
          hooks.round?.control(code);
          note(`[shard] rewrote its ${world === 'racer' ? 'driving' : 'fighting'} code (${next.length} chars)`);
          return 'your code is replaced';
        },
      });
      s.turns++;
      if (out.final) note(`[shard] ${out.final.slice(0, 200)}`);
      if (solo) hooks.round?.pause(false);
    }
    // the round is over (or stopped): the report
    const reply = await chat(s.model, [
      { role: 'system', content: system },
      { role: 'user', content: `The round is over. What happened:\n${lines.slice(-80).map((l) => l.line).join('\n')}\n\nYour notes: ${s.notes.join(' | ') || '(none)'}\n\nYour final code:\n${code}\n\nWrite a short playtest report: how the round went, what you changed in your code and why, and what about the game itself seemed off, confusing or fun.` },
    ], [], 0.4, 1500);
    s.report = reply.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    note('[shard] report written');
  } catch (e) {
    s.error = String((e as Error).message ?? e);
    note(`[shard] failed: ${s.error}`);
  } finally {
    s.running = false;
  }
}

/** Recent log lines since the last call (or all with all=true). */
function events(all = false): string[] {
  const from = all ? 0 : read;
  read = lines.length;
  return lines.slice(from).map((l) => `${l.t.toFixed(1)} ${l.line}`);
}

/** Install `window.explorer`. */
export function installExplorer() {
  const api = {
    /** Which screen is up: title, sanctum, or a world. */
    where: () => hooks.screen,
    /** The sanctum in brief, or the round in brief. */
    state: () => (hooks.round ? { world: hooks.round.world, ...hooks.round.state(), controls: code ? 'explorer code' : 'hands' } : hooks.sanctum?.summary() ?? { screen: hooks.screen }),
    /** What a pilot or fighter sees right now. */
    view: () => hooks.round?.view() ?? null,
    /** Log lines since the last call. */
    events: (all = false) => events(all),
    /** Walk into a world from the sanctum (resolves once the round's screen is up). */
    walk: async (world: World = 'dark', level = 0) => {
      if (!hooks.sanctum) throw new Error('not in the sanctum');
      await hooks.sanctum.walk(world, level);
      for (let i = 0; i < 120 && !hooks.round; i++) await new Promise((r) => setTimeout(r, 250));
      return api.where();
    },
    /** Skip a shared round's lobby. */
    go: () => hooks.round?.go(),
    pause: (on = true) => hooks.round?.pause(on),
    /** Take the controls with code (a fighter or pilot body, checked first), kept across rounds until hands(). */
    play: (body?: string) => {
      const world = hooks.round?.world ?? 'dark';
      const next = body ?? (world === 'racer' ? DEFAULT_DRIVING : DEFAULT_FIGHTING);
      const check = world === 'racer' ? tryDriving(next) : tryFighting(next);
      if (check) return `refused: ${check}`;
      code = next;
      hooks.round?.control(code);
      return 'playing';
    },
    /** Give the controls back to the keyboard and mouse. */
    hands: () => { code = null; hooks.round?.control(null); return 'hands'; },
    /** The game canvas as a JPEG data URL. */
    shot: (quality = 0.6) => (document.getElementById('stage') as HTMLCanvasElement | null)?.toDataURL('image/jpeg', quality) ?? null,
    /** Shard a model into the app: it plays the next (or current) round through code and writes a report. */
    shard: (opts: { model?: string; goal?: string; every?: number } = {}) => {
      if (shard?.running) return 'a shard is already running';
      shard = { model: opts.model ?? 'qwen3:8b', goal: opts.goal ?? 'survive as long as you can and banish as many as you can', every: opts.every ?? 20, running: true, turns: 0, notes: [], issues: [], report: null, error: null };
      void runShard(shard);
      return `shard of ${shard.model} running (ollama at ${OLLAMA})`;
    },
    stopShard: () => { if (shard) shard.running = false; return 'stopping'; },
    /** The shard's progress, notes and report. */
    report: () => shard && { model: shard.model, running: shard.running, turns: shard.turns, notes: shard.notes, issues: shard.issues, report: shard.report, error: shard.error },
    /** Report an issue yourself (lands in the host's actant-issues.jsonl beside the actants'). */
    issue: (text: string, where = '') => reportIssue('explorer', text, where),
  };
  (window as unknown as { explorer: typeof api }).explorer = api;
}
