// What's new since we last looked: reads every ecology report (runs/ecology/s<seed>-t<tick>.json)
// it hasn't read before, and each run's index marks since the last look, and lists what has never
// been seen before (in any run, or in that run), keeping a ledger of everything seen:
//   node dist/novelty.mjs [--dir runs/ecology] [--ledger runs/ecology/known.json] [--quiet] [--out f.md]
// --quiet reads and remembers without reporting (to start a ledger from the reports already there).
// Things it looks for, by code row (a species) unless said otherwise:
//   species (1%+ of bodies, rising 1.5× or halving) and body plans among the commonest; who bites
//   whom (10+ bites in a scan), and kills (3+); who writes into whom, and
//   what (50+ writes into 3+ bodies); who is good or bad for whom (and when that flips); causes of death and their shares; the
//   fastest movers and the share that never moves; record bodies, the giants' rows and shapes; booms
//   and crashes.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const dir = opt('--dir', 'runs/ecology');
const ledgerFile = opt('--ledger', join(dir, 'known.json'));
const out = opt('--out', '');
const quiet = args.includes('--quiet');

type Seen = { first: string; seeds: string[] };
type Ledger = {
  read: string[]; // report files already read
  seen: Record<string, Seen>; // "kind|key" → where it was first seen
  eco: Record<string, string>; // "A|B" → the last kind measured, to catch flips
  records: Record<string, { v: number; at: string }>; // "s2|speed", "all|giant" ...
  last: Record<string, { t: number; alive: number }>; // per seed: the last index mark looked at
};
const ledger: Ledger = existsSync(ledgerFile)
  ? JSON.parse(readFileSync(ledgerFile, 'utf8'))
  : { read: [], seen: {}, eco: {}, records: {}, last: {} };

// Same as ecology's nameOf: the code row, then the other working glyphs sorted.
const nameOf = (key: string) => {
  if (key === '?' || key === 'self') return key;
  const cells = key ? key.split(';').map((s) => { const [x, y, g] = s.split(','); return { x: +x, y: +y, g }; }) : [];
  const row = cells.filter((c) => c.y === 0).sort((a, b) => a.x - b.x).map((c) => c.g).join('');
  const rest = cells.filter((c) => c.y !== 0).map((c) => c.g).sort().join('');
  return rest ? `${row}+${rest}` : row || '(fat only)';
};
const rowOf = (key: string) => nameOf(key).split('+')[0];
// Is row a what's left of row b after losing cells: its glyphs in b's order, gaps allowed (CMD in CLMD)?
const partOf = (a: string, b: string) => { let i = 0; for (const g of b) if (g === a[i]) i++; return a !== b && i === a.length; };
// Kinds the survey already knows, by what's in a code row: most of a round's list is these
// turning up again in new mutants, so each line says which it looks like.
const kindOf = (row: string) =>
  row.includes('W') ? 'vandal' : row.includes('G') ? 'grower' : row.includes('B') ? 'biter'
  : !row.includes('D') && /[[\]]/.test(row) ? 'hunter-like (D turned into a turn)' : !row.includes('C') ? 'husk' : !row.includes('D') ? 'sterile' : '';
const known = (...rows: string[]) => {
  const ks = [...new Set(rows.map((r) => (kindOf(r) ? `\`${r}\` ${kindOf(r)}` : '')).filter(Boolean))];
  return ks.length ? ` · *known kinds: ${ks.join(', ')}*` : '';
};
const link = (seed: string, t: number, id?: number) =>
  `http://lilg:8765/?climb=1&w=climber,diver,hunter&seed=${seed}&bake=runs/bake/climb7-s${seed}&t=${t}${id ? `&pick=${id}` : ''}`;

// Findings, per seed: everNew (never seen in any run), runNew (new to this run), notes (records, flips, swings).
const found = new Map<string, { everNew: string[]; runNew: string[]; notes: string[] }>();
const at = (seed: string) => { let f = found.get(seed); if (!f) found.set(seed, (f = { everNew: [], runNew: [], notes: [] })); return f; };
const note = (seed: string, kind: string, key: string, where: string, text: string) => {
  const k = `${kind}|${key}`, s = ledger.seen[k];
  if (!s) { ledger.seen[k] = { first: where, seeds: [seed] }; at(seed).everNew.push(text); }
  else if (!s.seeds.includes(seed)) { s.seeds.push(seed); at(seed).runNew.push(`${text} (first seen ${s.first})`); }
};
const record = (seed: string, key: string, v: number, where: string, text: string, margin = 1) => {
  const r = ledger.records[key];
  if (!r || v > r.v * margin) { if (r) at(seed).notes.push(`${text} (record; was ${+r.v.toFixed(3)} at ${r.at})`); ledger.records[key] = { v, at: where }; }
};

type Report = {
  src: string; t: number; ticks: number; alive: number;
  plans: { key: string; name: string; n: number }[];
  bites: { pair: string[]; hits: number; killed: number; rel: string; ex?: { by: number; on: number; t: number } }[];
  writes: { pair: string[]; n: number; victims: number; glyphs: Record<string, number>; rel: string; ex?: { by: number; on: number; t: number } }[];
  deaths: Record<string, number>;
  movement: { key: string; n: number; moved: number; ticks: number; never: number; net: number; surv: number; births: number }[];
  eco: { a: string; b: string; kind: string; onB?: { n: number; d: number; z: number }; onA?: { n: number; d: number; z: number } }[];
  species?: Record<string, number>;
};

const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^s\d+-t\d+\.json$/.test(f) && !ledger.read.includes(f)) : [];
files.sort((a, b) => +a.match(/-t(\d+)/)![1] - +b.match(/-t(\d+)/)![1]);
for (const f of files) {
  const seed = f.match(/^s(\d+)/)![1];
  const r: Report = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const where = `s${seed} t${r.t}`;

  // Species (code rows) with 1% of the bodies, and risers; plans among the commonest. Counting rows
  // over every body matters: a species can spread over hundreds of plans, none of them common.
  const rows = new Map<string, number>(Object.entries(r.species ?? {}));
  if (!r.species) for (const p of r.plans) rows.set(p.name.split('+')[0], (rows.get(p.name.split('+')[0]) ?? 0) + p.n);
  // A row that's part of a commoner one (CLD, LD, L beside CLDM) is mostly what's left of it after
  // shedding or a bite: say so, as it's rarely a species of its own.
  const whole = (row: string, n: number) => [...rows].find(([o, m]) => m > n && partOf(row, o))?.[0];
  for (const [row, n] of rows) {
    const of = whole(row, n);
    if (n >= r.alive / 100) note(seed, 'species', row, where, `species **${row}**: ${n.toLocaleString()} bodies, ${(100 * n / r.alive).toFixed(1)}%${of ? ` (part of **${of}**: likely what's left after shedding or a bite)` : ''}`);
    const k = `s${seed}|row|${row}`, prev = ledger.records[k];
    if (prev && n >= 1000 && n >= prev.v * 1.5) at(seed).notes.push(`**${row}** rising: ${Math.round(prev.v).toLocaleString()} at ${prev.at} → ${n.toLocaleString()}`);
    if (prev && prev.v >= 1000 && n <= prev.v / 2) at(seed).notes.push(`**${row}** falling: ${Math.round(prev.v).toLocaleString()} at ${prev.at} → ${n.toLocaleString()}`);
    if (n >= 100 || prev) ledger.records[k] = { v: n, at: where };
  }
  for (const p of r.plans.slice(0, 10)) note(seed, 'plan', p.name, where, `body plan **${p.name}** in the top 10 (${p.n})`);

  // Bites and kills, by row pair.
  const bites = new Map<string, { hits: number; killed: number; ex?: Report['bites'][0]['ex']; rel: string; rows: string[] }>();
  for (const b of r.bites) {
    const k = `${rowOf(b.pair[0])} → ${rowOf(b.pair[1])}`, e = bites.get(k) ?? { hits: 0, killed: 0, rel: b.rel, rows: [rowOf(b.pair[0]), rowOf(b.pair[1])] };
    e.hits += b.hits; e.killed += b.killed; e.ex ??= b.ex; bites.set(k, e);
  }
  for (const [k, e] of bites) {
    const ex = e.ex ? ` [example](${link(seed, e.ex.t, e.ex.by)})` : '';
    if (e.hits >= 10) note(seed, 'bite', k, where, `bites **${k}**: ${e.hits} in ${r.ticks} ticks (${e.rel})${ex}${known(...e.rows)}`);
    if (e.killed >= 3) note(seed, 'kill', k, where, `kills **${k}**: ${e.killed}${ex}${known(...e.rows)}`);
  }

  // Code written into others, by row pair, and which glyphs.
  type W = { n: number; victims: number; glyphs: Map<string, number>; rel: string; ex?: Report['writes'][0]['ex'] };
  const writes = new Map<string, W>();
  for (const w of r.writes) {
    const k = `${rowOf(w.pair[0])} → ${rowOf(w.pair[1])}`, e: W = writes.get(k) ?? { n: 0, victims: 0, glyphs: new Map(), rel: w.rel };
    e.n += w.n; e.victims += w.victims; e.ex ??= w.ex;
    for (const [g, n] of Object.entries(w.glyphs)) e.glyphs.set(g, (e.glyphs.get(g) ?? 0) + n);
    writes.set(k, e);
  }
  const glyphs = new Map<string, number>();
  for (const [k, e] of writes) {
    for (const [g, n] of e.glyphs) glyphs.set(g, (glyphs.get(g) ?? 0) + n);
    const ex = e.ex ? ` [example](${link(seed, e.ex.t, e.ex.by)})` : '';
    const gs = [...e.glyphs].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([g, n]) => `\`${g}\`×${n}`).join(' ');
    if (e.n >= 50 && e.victims >= 3) note(seed, 'write', k, where, `writes **${k}**: ${e.n} into ${e.victims} bodies, ${gs} (${e.rel})${ex}${known(...k.split(' → '))}`);
  }
  for (const [g, n] of glyphs) if (n >= 30) note(seed, 'written', g, where, `glyph \`${g}\` written into others ${n} times`);

  // Who's good or bad for whom, and flips.
  const strength = (e: Report['eco'][0]) => Math.max(Math.abs(e.onA?.z ?? 0), Math.abs(e.onB?.z ?? 0));
  for (const e of r.eco) {
    if (/neutral|same row: 0|same row: \?|too rare/.test(e.kind) || strength(e) < 3) continue;
    // A row that's part of the other (CLMD and LMD or CMD, C4SDTM and C4SDT) is a piece bitten off it,
    // and does worse beside the whole ones: damage, not a relationship.
    if (partOf(e.a, e.b) || partOf(e.b, e.a)) continue;
    // So is a sterile copy of the other (CmMD and CmM$: its D became something else), which
    // exists only by fresh mutation.
    const sterile = (x: string, y: string) => x.length === y.length && !x.includes('D') && y.includes('D') && [...x].filter((g, i) => g !== y[i]).length === 1;
    if (sterile(e.a, e.b) || sterile(e.b, e.a)) continue;
    const pair = e.a === e.b ? e.a : `${e.a} / ${e.b}`;
    const d = (x?: { d: number; z: number }) => (x ? `${x.d >= 0 ? '+' : ''}${x.d.toFixed(2)} (z ${x.z.toFixed(1)})` : '?');
    note(seed, 'eco', `${pair}|${e.kind}`, where, `**${pair}**: ${e.kind}, A on B ${d(e.onB)}${e.a === e.b ? '' : `, B on A ${d(e.onA)}`}${known(e.a, e.b)}`);
    const was = ledger.eco[`${seed}|${pair}`];
    if (was && was !== e.kind) at(seed).notes.push(`**${pair}** flipped: was ${was}, now ${e.kind}`);
    ledger.eco[`${seed}|${pair}`] = e.kind;
  }

  // Causes of death and their shares.
  const dead = Object.values(r.deaths).reduce((a, b) => a + b, 0) || 1;
  for (const [cause, n] of Object.entries(r.deaths)) {
    note(seed, 'death', cause, where, `death by **${cause}** (${n})`);
    const share = n / dead, k = `s${seed}|death|${cause}`, prev = ledger.records[k];
    if (prev && share > 0.01 && (share > prev.v * 2 || share < prev.v / 2)) at(seed).notes.push(`death by ${cause}: ${(share * 100).toFixed(1)}% of deaths, was ${(prev.v * 100).toFixed(1)}%`);
    ledger.records[k] = { v: share, at: where };
  }

  // Movement: the fastest plan (cells per tick, net), and the share that never moved.
  let never = 0, all = 0;
  for (const m of r.movement) {
    never += m.never; all += m.n;
    if (m.n < 20 || !m.ticks) continue;
    const speed = m.net / m.ticks;
    record(seed, `s${seed}|speed`, speed, where, `fastest yet in s${seed}: **${nameOf(m.key)}**, ${speed.toFixed(3)} cells a tick net (${m.n} bodies)`, 1.2);
    record(seed, 'all|speed', speed, where, `fastest in any run: **${nameOf(m.key)}**, ${speed.toFixed(3)} cells a tick (s${seed})`, 1.2);
  }
  if (all) {
    const share = never / all, k = `s${seed}|still`, prev = ledger.records[k];
    if (prev && Math.abs(share - prev.v) > 0.15) at(seed).notes.push(`share of common bodies that never moved: ${(share * 100).toFixed(0)}%, was ${(prev.v * 100).toFixed(0)}%`);
    ledger.records[k] = { v: share, at: where };
  }
  ledger.read.push(f);
}

// The runs' index marks since the last look: record bodies, giants' rows and shapes, booms and crashes.
type Mark = { t: number; file?: string; alive: number; biggest?: { id: number; cells: number; genome: string } };
const shape = (genome: string) => {
  const rows = genome.split('/'), h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cells = rows.reduce((a, r) => a + r.replace(/ /g, '').length, 0), fill = cells / (w * h);
  return { w, h, fill, form: Math.max(w, h) >= 8 * Math.min(w, h) ? 'thread' : fill >= 0.5 ? 'blob' : 'sprawl', row: rows[0].replace(/[ .]/g, '') };
};
const bakes = existsSync('runs/bake') ? readdirSync('runs/bake').filter((d) => /^climb7-s\d+$/.test(d)) : [];
for (const d of bakes) {
  const seed = d.match(/s(\d+)$/)![1], ixf = join('runs/bake', d, 'index.json');
  if (!existsSync(ixf)) continue;
  const marks: Mark[] = JSON.parse(readFileSync(ixf, 'utf8')).marks;
  const last = ledger.last[seed], fresh = marks.filter((m) => !last || m.t > last.t);
  if (!fresh.length) continue;
  let top: Mark | undefined;
  for (const m of fresh) {
    const b = m.biggest;
    if (!b || b.cells < 100) continue;
    if (!top || b.cells > top.biggest!.cells) top = m;
    const s = shape(b.genome), where = `s${seed} t${m.t}`;
    note(seed, 'giant', s.row, where, `a giant (${b.cells} cells, ${s.form} ${s.w}×${s.h}) runs row **${s.row}** [view](${link(seed, m.t, b.id)})`);
    note(seed, 'giantform', s.form, where, `a giant shaped as a **${s.form}** (${b.cells} cells, ${s.w}×${s.h}, ${(s.fill * 100).toFixed(0)}% full) [view](${link(seed, m.t, b.id)})`);
  }
  if (top) { // the largest since the last look, against the records
    const b = top.biggest!, s = shape(b.genome), where = `s${seed} t${top.t}`;
    record(seed, `s${seed}|giant`, b.cells, where, `biggest body yet in s${seed}: ${b.cells} cells, ${s.form} ${s.w}×${s.h}, row **${s.row}** [view](${link(seed, top.t, b.id)})`);
    record(seed, 'all|giant', b.cells, where, `biggest body in any run: ${b.cells} cells (s${seed}) [view](${link(seed, top.t, b.id)})`);
  }
  const now = fresh[fresh.length - 1];
  if (last && last.alive && Math.abs(now.alive - last.alive) / last.alive > 0.25)
    at(seed).notes.push(`${now.alive > last.alive ? 'boom' : 'crash'}: ${last.alive.toLocaleString()} alive at t${last.t} → ${now.alive.toLocaleString()} at t${now.t}`);
  ledger.last[seed] = { t: now.t, alive: now.alive };
}

writeFileSync(ledgerFile, JSON.stringify(ledger));
if (!quiet) {
  const lines: string[] = [`# What's new (${new Date().toLocaleString('sv').slice(0, 16)})`, ''];
  lines.push(files.length ? `Read ${files.join(', ')}.` : 'No new ecology reports.', '');
  for (const [seed, f] of [...found].sort((a, b) => +a[0] - +b[0])) {
    if (!f.everNew.length && !f.runNew.length && !f.notes.length) continue;
    lines.push(`## s${seed}`, '');
    if (f.everNew.length) lines.push('**Never seen before, in any run:**', '', ...f.everNew.map((x) => `- ${x}`), '');
    if (f.runNew.length) lines.push('**New to this run:**', '', ...f.runNew.map((x) => `- ${x}`), '');
    if (f.notes.length) lines.push('**Records, flips and swings:**', '', ...f.notes.map((x) => `- ${x}`), '');
  }
  if (!found.size) lines.push('Nothing new.');
  const text = lines.join('\n');
  console.log(text);
  if (out) writeFileSync(out, text + '\n');
}
