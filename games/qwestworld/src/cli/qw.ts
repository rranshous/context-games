// qw.ts — a terminal window into the sim. Same API, same powers as the browser viewer.
//
//   qw [status]        realms, armies, what the world is waiting on
//   qw kings           each king's last council: thoughts and decrees
//   qw chronicle [n]   the last n chronicle entries (default 25)
//   qw context [a-h]   exactly what that king would be sent at council now
//   qw map [cols]      ASCII territory map (a-f realms, UPPER = settlement, * = capital)
//   qw brain d qwen3:1.7b  hand realm d to another mind ('script', 'qwen', 'llama', or any Ollama model)
//   qw pause | resume
//
// SIM_URL=http://host:4200 to look at a sim elsewhere on the network.

import { MetaResponse, StateResponse, MAP_W, MAP_H, NO_REGION, Terrain } from '../shared/types.js';

const BASE = (process.env.SIM_URL ?? 'http://localhost:4200').replace(/\/$/, '');
const LETTERS = 'abcdefghijkl';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}
async function bin(path: string): Promise<ArrayBuffer> {
  return (await fetch(BASE + path)).arrayBuffer();
}

async function status() {
  const [s, h] = await Promise.all([get<StateResponse>('/api/state'), get<any>('/api/health')]);
  console.log(`${s.date} — Age ${s.age} — tick ${s.tick}${h.paused ? ' — PAUSED' : ''}${s.stalledBy ? ` — waiting on ${s.stalledBy}` : ''} — step ${h.stepMs}ms`);
  for (const k of s.kingdoms) {
    const tag = `${LETTERS[k.id]}) ${k.name}`.padEnd(30);
    const ruler = `${k.ruler.title} ${k.ruler.name} (${k.ruler.age})`.padEnd(20);
    const wars = k.wars.length ? ` ⚔${k.wars.map(w => LETTERS[w]).join('')}` : '';
    console.log(`${tag} ${ruler} ${k.alive ? `${String(k.settlements).padStart(2)} towns ${String(k.soldiers).padStart(6)} soldiers ${String(k.gold).padStart(6)}g${wars}` : 'FALLEN'}  [${k.brain}]${k.thinking ? ' (in council)' : ''}`);
    for (const a of s.armies.filter(a => a.faction === k.id)) {
      console.log(`     ⚑ ${a.general.padEnd(14)} ${String(a.size).padStart(5)}  morale ${a.morale.toFixed(2)} renown ${a.renown}  ${a.order} → #${a.target}`);
    }
  }
}

async function kings() {
  const s = await get<StateResponse>('/api/state');
  for (const k of s.kingdoms) {
    console.log(`\n${LETTERS[k.id]}) ${k.ruler.title} ${k.ruler.name}, ${k.ruler.age}, of the ${k.name} — ${k.temperament} [${k.brain}]${k.alive ? '' : ' FALLEN'} — ${k.origin}`);
    if (k.lastThought) console.log(`   “${k.lastThought}”`);
    console.log(`   decrees: ${k.lastDecrees.join(' | ') || '(none)'}`);
    if (k.reign.length) console.log('   reign:\n' + k.reign.map(r => `     ${r}`).join('\n'));
  }
}

async function chronicle(n: number) {
  const s = await get<StateResponse>('/api/state');
  for (const e of s.chronicle.slice(-n)) {
    const who = e.faction >= 0 ? LETTERS[e.faction] : '·';
    console.log(`${who} ${String(Math.floor(e.tick / 24)).padStart(5)}d  ${e.text}`);
  }
}

async function map(cols: number) {
  const [meta, s, terr, regBuf] = await Promise.all([
    get<MetaResponse>('/api/meta'), get<StateResponse>('/api/state'), bin('/api/terrain.bin'), bin('/api/regions.bin'),
  ]);
  const terrain = new Uint8Array(terr, 0, MAP_W * MAP_H);
  const region = new Uint16Array(regBuf);
  const rows = Math.round(cols * (MAP_H / MAP_W) * 0.5);
  const sx = MAP_W / cols, sy = MAP_H / rows;
  const grid: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: string[] = [];
    for (let c = 0; c < cols; c++) {
      const i = Math.floor((r + 0.5) * sy) * MAP_W + Math.floor((c + 0.5) * sx);
      const t = terrain[i];
      if (t <= Terrain.WATER) line.push(t === Terrain.DEEP ? ' ' : '~');
      else if (region[i] === NO_REGION) line.push('.');
      else line.push(LETTERS[s.settlements[region[i]].owner] ?? '?');
    }
    grid.push(line);
  }
  for (const m of meta.settlements) {
    const r = Math.min(rows - 1, Math.floor(m.y / sy)), c = Math.min(cols - 1, Math.floor(m.x / sx));
    const o = s.settlements[m.id].owner;
    grid[r][c] = s.settlements[m.id].siege > 0 ? '!' : m.capital ? '*' : (LETTERS[o] ?? '?').toUpperCase();
  }
  for (const a of s.armies) {
    const r = Math.min(rows - 1, Math.floor(a.y / sy)), c = Math.min(cols - 1, Math.floor(a.x / sx));
    grid[r][c] = '#';
  }
  console.log(grid.map(l => l.join('')).join('\n'));
  console.log(`${s.date}   a-h realms · UPPER town · * founding capital · ! under siege · # army · ~ sea`);
}

async function context(which: string) {
  const id = Math.max(0, LETTERS.indexOf(which ?? 'a'));
  const { messages } = await get<{ messages: any[] }>(`/api/kings/${id}/context`);
  for (const m of messages) {
    const calls = m.tool_calls?.map((c: any) => `${c.function.name}(${JSON.stringify(c.function.arguments)})`).join(' ') ?? '';
    console.log(`--- ${m.role}${m.tool_name ? ` (${m.tool_name})` : ''}`);
    if (m.content) console.log(m.content);
    if (calls) console.log(calls);
  }
  const chars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  console.log(`--- ${messages.length} messages, ~${Math.round(chars / 3.6)} tokens (plus tool schemas)`);
}

async function control(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(BASE + '/api/control', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
  });
  console.log(await res.json());
}

const [cmd = 'status', arg] = process.argv.slice(2);
const run: Record<string, () => Promise<void>> = {
  status, kings,
  chronicle: () => chronicle(parseInt(arg ?? '25', 10)),
  map: () => map(parseInt(arg ?? '128', 10)),
  context: () => context(arg),
  brain: () => control('brain', { realm: LETTERS.indexOf(arg ?? ''), brain: process.argv[4] }),
  pause: () => control('pause'),
  resume: () => control('resume'),
};
(run[cmd] ?? (async () => console.log('usage: qw [status|kings|context [a-l]|chronicle [n]|map [cols]|brain <realm> <model>|pause|resume]')))()
  .catch(e => { console.error(`qw: cannot reach sim at ${BASE} (${e.message})`); process.exit(1); });
