import type { App, Screen } from '../main.ts';
import { frag, esc } from '../dom.ts';
import {
  ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, ASPECTS, FORMS, HEARTH_GOD,
  addressOf, spiritName, magnitudeTitle, fmtDuration, traditionName, truths,
} from '../lore.ts';
import { persist, spiritOf, wordView } from '../save.ts';
import { addHistory, describeAim } from '../plan.ts';
import { toolModels } from '../actant.ts';
import { expectedSpirits } from '../services.ts';
import { MIN_NAME_BITS, MIN_SPIRIT_DEPTH, cellsBelow, target, type Spirit } from '@truenames/universe';
import { runScreen } from './run.ts';
import { DungeonLink, LOCAL_DUNGEON, LAN_DUNGEON, LAN_ALTAR, dungeonAddress, setDungeonAddress, shareable, type RoundHost } from '../round.ts';

/** The dungeon you play at, as the player sees it: empty when it's your own. */
const dungeonLabel = () => (dungeonAddress() === LOCAL_DUNGEON ? '' : dungeonAddress().replace(/^ws:\/\//, ''));
const dungeonTip = () => `<b>Where you play</b>: a dungeon hosts the worlds. Empty: this machine's own. Or a game master's or a friend's dungeon address (with its key, as they share it). When someone at your altars calls a round, you walk into their dungeon instead.${LAN_DUNGEON ? ` Friends can play at yours: <em>${LAN_DUNGEON}</em>.` : ''}`;
import { prepareJourney, proofEstimateMs } from '../threshold.ts';
import { titleScreen } from './title.ts';
import { SLOTS, WORLDS, COUNCIL, worldDescentName, type World } from '@truenames/dungeon/balance';
import { councilScreen } from './council.ts';
import { bastionScreen } from './bastion.ts';
import { racerScreen } from './racer.ts';
import { sigilURL } from '../sigil.ts';
import { isMuted, setMuted } from '../audio.ts';
import { openChart } from './chart.ts';
import { openSpiritCard } from './spirit-card.ts';
import { createCodex, type Codex } from './codex.ts';
import { lendSanctum } from '../explorer.ts';
import type { Choir } from '../choir.ts';
import type { ChoirMember } from '@truenames/protocol';


const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function sanctumScreen(app: App): Screen {
  const S = app.services;
  const save = app.save;
  let root: HTMLElement;
  let timer: ReturnType<typeof setInterval>;
  const offs: (() => void)[] = [];
  let picking: number | null = null;
  let walking = false; // a journey is being prepared (the threshold) or under way
  const freshCells = new Set<string>();
  const feed: string[] = [];
  const feedLine = (sp: Spirit, how: string) =>
    `<div data-tip="found"><img class="sigil-sm" src="${sigilURL(sp)}" alt=""> <span style="color:${ELEMENT_COLOR[sp.element]}">${esc(spiritName(sp))}</span>, ${magnitudeTitle(sp.magnitude)} of ${esc(ASPECTS[sp.element]![sp.aspect]!)} <span class="faint">${how}</span></div>`;
  for (const k of Object.values(save.spirits).filter((k) => k.source !== 'lore').sort((a, b) => a.foundAt - b.foundAt).slice(-12)) {
    const sp = spiritOf(save, k.spirit.cell);
    if (sp) feed.push(feedLine(sp, k.source === 'shrine' ? 'at a shrine' : 'scried'));
  }

  // ---------- name book ----------
  let codex: Codex | null = null;
  function renderBook() {
    if (root?.classList.contains('dragging')) return;
    codex?.renderList();
  }

  // ---------- scrying ----------
  function formPrefix(): { prefix: string; depth: number } {
    const e = (root.querySelector('#s-el') as HTMLSelectElement).value;
    const a = (root.querySelector('#s-asp') as HTMLSelectElement).value;
    const t = (root.querySelector('#s-trad') as HTMLSelectElement).value;
    const raw = Math.floor(Number((root.querySelector('#s-depth') as HTMLInputElement).value));
    const depth = Number.isFinite(raw) ? Math.max(MIN_SPIRIT_DEPTH, Math.min(24, raw)) : MIN_SPIRIT_DEPTH;
    let prefix = e;
    if (a !== '') prefix += a;
    if (a !== '' && t !== '') prefix += Number(t).toString(8).padStart(2, '0');
    return { prefix, depth };
  }

  function refreshAspectOptions() {
    const e = Number((root.querySelector('#s-el') as HTMLSelectElement).value);
    const asp = root.querySelector('#s-asp') as HTMLSelectElement;
    const cur = asp.value;
    asp.innerHTML = `<option value="">any aspect</option>` + ASPECTS[e]!.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    asp.value = cur;
    refreshTradOptions();
  }
  function refreshTradOptions() {
    const a = (root.querySelector('#s-asp') as HTMLSelectElement).value;
    const tr = root.querySelector('#s-trad') as HTMLSelectElement;
    const cur = tr.value;
    tr.disabled = a === '';
    tr.innerHTML = `<option value="">any tradition</option>` + (a === '' ? '' : Array.from({ length: 64 }, (_, i) => `<option value="${i}">${traditionName(Number(a), i)}</option>`).join(''));
    tr.value = a === '' ? '' : cur;
  }

  function renderScryInfo() {
    const { prefix, depth } = formPrefix();
    const info = root.querySelector('#s-info')!;
    const btn = root.querySelector('#s-go') as HTMLButtonElement;
    if (depth <= prefix.length || depth < MIN_SPIRIT_DEPTH) {
      info.innerHTML = `<span class="bad">Spirits dwell only at depth ${MIN_SPIRIT_DEPTH} and below, and beneath the region you chose.</span>`;
      btn.disabled = true;
      return;
    }
    const total = cellsBelow(depth - prefix.length);
    const done = S.scanned(prefix, depth);
    const exp = expectedSpirits(prefix, depth);
    const perCell = 1 / 2 ** target(depth);
    const rate = Math.max(S.pool.rate(), 500);
    const cellsPerSec = rate / 2.15;
    const remaining = Number(total - done);
    const running = !!S.scryTask(prefix, depth);
    info.innerHTML = `<div data-tip="address">${esc(addressOf(prefix))}, depth ${depth}</div>
      <div class="dim" data-tip="divisions">${Number(total).toLocaleString()} divisions · 1 in ${Math.round(1 / perCell).toLocaleString()} holds a being · ~${exp < 10 ? exp.toFixed(1) : Math.round(exp)} ${magnitudeTitle(depth - MIN_SPIRIT_DEPTH)}s here</div>
      <div class="dim" data-tip="scanned">scanned ${((100 * Number(done)) / Number(total)).toFixed(1)}% · a find every ~${fmtDuration(1 / perCell / cellsPerSec)} · whole layer ~${fmtDuration(remaining / cellsPerSec)}</div>`;
    btn.disabled = running || done >= total;
    btn.textContent = done >= total ? 'fully scried' : running ? 'scrying…' : 'Scry here';
  }

  function renderTasks() {
    const box = root.querySelector('#tasks')!;
    const tasks = S.pool.list().filter((t) => t.kind === 'scry');
    box.innerHTML = tasks.length
      ? tasks.map((t) => {
          if (t.kind !== 'scry') return '';
          const total = cellsBelow(t.depth - t.prefix.length);
          const pct = (100 * Number(t.doneUpTo)) / Number(total);
          return `<div class="task" data-tip="task"><div class="row" style="display:flex; gap:8px"><span>${esc(addressOf(t.prefix))} · depth ${t.depth}</span><span style="flex:1"></span><span class="dim">${t.hits} found</span>
            <button class="small" data-stop="${t.id}" data-tip="stop">stop</button></div>
            <div class="bar"><i style="width:${pct.toFixed(2)}%"></i></div><div class="dim mono" style="font-size:12px">${pct.toFixed(2)}%</div></div>`;
        }).join('')
      : `<div class="hint">No scrying under way.</div>`;
    root.querySelector('#feed')!.innerHTML = feed.slice(-12).reverse().join('');
  }

  // ---------- loadout ----------
  function renderLoadout() {
    const box = root.querySelector('#slots')!;
    box.innerHTML = save.loadout.map((cell, i) => {
      const sp = cell ? wordView(save, cell) : null;
      const key = SLOTS[i]!.label;
      const mouse = '';
      if (!sp) return `<div class="slot ${picking === i ? 'picking' : ''}" data-slot="${i}" data-tip="slot"><span class="key">${key}</span><span class="dim">${picking === i ? 'choose a learned spirit: press bind' : 'empty'}${mouse}</span></div>`;
      return `<div class="slot filled" data-slot="${i}" data-tip="slot" style="--c:${ELEMENT_COLOR[sp.element]}"><span class="key">${key}</span><img class="sigil-sm" src="${sigilURL(sp)}" alt="">
        <span style="flex:1"><span style="color:${ELEMENT_COLOR[sp.element]}">${esc(spiritName(sp))}</span> <span class="dim" style="font-size:13px">${FORMS[sp.traits.form]!.name}${mouse}</span></span>
        <span class="bits gold" data-tip="truths">${truths(S.strength(cell!))}</span><button class="small" data-unbind="${i}" data-tip="unbind">×</button></div>`;
    }).join('');
    // the Council deck: up to twelve learned names
    const deck = (save.councilDeck ?? []).filter((c) => S.learned(c));
    root.querySelector('#deck')!.innerHTML = `<div class="dim" style="font-size:13px; margin-bottom:4px">${deck.length} / ${COUNCIL.deckMax} words · add with ◇ in the Name Book</div>` + deck.map((cell) => {
      const sp = wordView(save, cell)!;
      return `<div class="deck-row" style="--c:${ELEMENT_COLOR[sp.element]}"><img class="sigil-sm" src="${sigilURL(sp)}" alt=""> <span style="color:${ELEMENT_COLOR[sp.element]}">${esc(spiritName(sp))}</span> <span class="dim" style="font-size:12px">${FORMS[sp.traits.form]!.name}</span><span style="flex:1"></span><button class="small" data-deck="${cell}" data-tip="=Take this name out of the Council deck.">×</button></div>`;
    }).join('');
    const canRun = world() === 'council' ? deck.length > 0 : save.loadout.some((c) => c && S.learned(c));
    (root.querySelector('#run') as HTMLButtonElement).disabled = !canRun;
    const runs = save.runs.slice(-6).reverse();
    const mark = { dark: '☾', bastion: '⌂', council: '◇', racer: '➶' } as const;
    root.querySelector('#runs')!.innerHTML = runs.length
      ? runs.map((r) => {
          const w = r.world ?? 'dark';
          const how = w === 'racer' ? `<span class="${r.won ? 'gold' : 'dim'}">finished ${ordinal(r.wave)}</span>` : w === 'council' ? (r.won ? '<span class="gold">prevailed</span>' : `<span class="dim">yielded on turn ${r.wave}</span>`) : r.won ? `<span class="gold">${w === 'bastion' ? 'held' : 'survived'}</span>` : `<span class="dim">fell at wave ${r.wave}</span>`;
          return `<div><span class="faint">${mark[w]} ${(r.descent ?? 0) + 1}</span> ${how} · ${r.kills} ${w === 'council' ? 'creatures broken' : w === 'racer' ? 'strikes' : 'banished'}</div>`;
        }).join('')
      : '<div class="dim">No walks yet.</div>';
  }

  function renderTop() {
    const r = S.pool.rate();
    const hum = root.querySelector('#hum') as HTMLElement;
    hum.textContent = `${Math.round(r).toLocaleString()} utterances/s`;
    hum.title = `meditation engine: ${S.pool.engine === 'wasm' ? 'WebAssembly (Montgomery Poseidon)' : S.pool.engine}`;
    root.querySelector('#workers')!.textContent = `${S.pool.getActive()} / ${S.pool.size}`;
    const cap = app.services.authority.auraState(save.aura!.pub).capacity;
    root.querySelector('#cap')!.textContent = cap.toFixed(1);
  }

  // one line of guidance: what to do next
  function renderAdvice() {
    const box = root.querySelector('#advice') as HTMLElement;
    const known = Object.keys(save.spirits);
    const unlearned = known.filter((c) => !S.learned(c));
    const learnedUnbound = S.graspedWords().filter((k) => !save.loadout.includes(k));
    const scrying = S.pool.list().some((t) => t.kind === 'scry');
    const meditating = S.pool.list().some((t) => t.kind === 'name');
    let msg = '';
    if (known.length <= 1 && !scrying) msg = `Search for spirits: choose a region in <em>Scrying</em> and press <em>Scry here</em>. Your element, at depth ${MIN_SPIRIT_DEPTH} where the wisps dwell, is a good first place to look.`;
    else if (learnedUnbound.length && save.loadout.some((c) => !c)) msg = `A grasped word is waiting. Press <em>bind</em> on it to carry it into the worlds.`;
    else if (unlearned.length && known.every((c) => c === HEARTH_GOD || !S.learned(c)) && !unlearned.some((c) => S.isMeditating(c))) msg = `You have found beings you cannot yet call. Press <em>meditate</em> on one; words will come to its facets as they will, and a word is yours once it reaches the being's bar (${truths(MIN_NAME_BITS)} for a wisp).`;
    else if (!save.runs.length) msg = `When you are ready, <em>walk into the dark</em>. Your meditation and scrying keep working while you fight.`;
    else if (!meditating) msg = `Nothing is being meditated. Names only grow truer while you work on them, even while you sleep.`;
    else if (save.runs.length && !save.runs.at(-1)!.won) msg = `The dark was too thick. Let meditation run; every truth makes each evocation about 1.4× stronger.`;
    const w = world();
    box.innerHTML = msg || `Your words deepen while you rest. Go deeper when ${w === 'bastion' ? 'the road feels quiet' : w === 'racer' ? 'the podium feels easy' : 'the dark feels thin'}: ${worldDescentName(w, progress(w).descent)} is open to you.`;
  }

  // ---------- the plan ----------
  function renderPlan() {
    const box = root?.querySelector('#plan');
    if (!box) return;
    const aims = S.planner.aims;
    box.innerHTML = aims.length
      ? aims.map((a, i) => `<div class="aim ${a.done ? 'done' : ''}" data-aim="${a.id}">
          <span class="mono faint">${i + 1}</span>
          <span class="aim-text">${esc(describeAim(a))}${a.done ? ' <span class="gold">· fulfilled</span>' : ''}${a.by === 'actant' ? ' <span class="faint">· by the actant</span>' : ''}</span>
          <span class="aim-ctl"><span class="dim" data-tip="=Share of the hum this aim gets (earlier aims also weigh a little more).">×${a.share}</span>
          <button class="tiny" data-aim-share="-1" data-tip="=Less of the hum.">−</button><button class="tiny" data-aim-share="1" data-tip="=More of the hum.">+</button>
          <button class="tiny" data-aim-move="-1" data-tip="=Earlier: higher priority.">↑</button><button class="tiny" data-aim-move="1" data-tip="=Later.">↓</button>
          <button class="tiny" data-aim-del data-tip="=Remove this aim.">×</button></span></div>`).join('')
      : '<div class="hint">No aims yet. Add one below, or meditate and scry by hand. With aims set, the sanctum works on its own.</div>';
    const hist = root.querySelector('#history');
    if (hist) hist.innerHTML = (save.history ?? []).slice(-14).reverse().map((h) => `<div><span class="faint">${new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> ${h.by === 'actant' ? '<span class="gold">actant:</span> ' : ''}${esc(h.text)}</div>`).join('') || '<div class="dim">Nothing yet.</div>';
  }
  function renderAimFields() {
    const kind = (root.querySelector('#a-kind') as HTMLSelectElement).value;
    const f = root.querySelector('#a-fields')!;
    const classes = (sel: number) => [0, 1, 2, 3, 4, 5, 6, 7].map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${magnitudeTitle(m)}s</option>`).join('');
    f.innerHTML = kind === 'deepen'
      ? `<select id="a-words"><option value="bound">bound words</option><option value="all">all words</option></select> <input id="a-count" type="number" min="1" max="12" value="3" title="at a time"> at a time, to <input id="a-to" type="number" min="22" max="60" value="29"> truths`
      : kind === 'grasp'
      ? `<input id="a-count" type="number" min="1" max="12" value="2"> at a time, up to <select id="a-max">${classes(2)}</select>`
      : `<span class="dim">the region above;</span> until <input id="a-until" type="number" min="0" max="999" value="3"> <select id="a-min">${classes(0)}</select> are known <span class="faint">(0: forever)</span>`;
  }
  function addAimFromForm() {
    const v = (id: string) => (root.querySelector('#' + id) as HTMLInputElement | null)?.value ?? '';
    const n = (id: string, d: number) => { const x = Math.floor(Number(v(id))); return Number.isFinite(x) ? x : d; };
    const kind = v('a-kind');
    if (kind === 'deepen') S.planner.add({ kind: 'deepen', words: v('a-words') === 'all' ? 'all' : 'bound', count: Math.max(1, n('a-count', 3)), to: Math.max(22, n('a-to', 29)), share: 2 }, 'player');
    else if (kind === 'grasp') S.planner.add({ kind: 'grasp', count: Math.max(1, n('a-count', 2)), maxMight: n('a-max', 2), share: 2 }, 'player');
    else {
      const { prefix, depth } = formPrefix();
      const until = n('a-until', 3);
      S.planner.add({ kind: 'seek', prefix, depth, until: until > 0 ? { count: until, minMight: n('a-min', 0) } : null, share: 2 }, 'player');
    }
    renderAll();
  }

  function renderActant() {
    const A = S.actant, el = root?.querySelector('#actant');
    if (!el) return;
    (el.querySelector('#ac-wake') as HTMLButtonElement).textContent = A.config.on ? 'awake · let it rest' : 'asleep · wake it';
    el.querySelector('#ac-wake')!.classList.toggle('on', A.config.on);
    el.querySelector('#ac-race')!.classList.toggle('on', !!A.config.joinRaces);
    el.querySelector('#ac-dark')!.classList.toggle('on', !!A.config.joinDark);
    el.querySelector('#ac-status')!.textContent = A.status === 'thinking' ? 'thinking… (meditation paused)' : A.config.on ? 'listening for what happens' : '';
    el.querySelector('#ac-thought')!.textContent = A.lastThought ? `“${A.lastThought}”` : '';
    // its goal, as it holds it (it sets its own, often from what you tell it); left alone while you're typing in it
    const goal = el.querySelector('#ac-goal') as HTMLTextAreaElement;
    if (document.activeElement !== goal && goal.value !== A.config.goal) goal.value = A.config.goal;
    el.querySelector('#ac-log')!.innerHTML = [...A.log.slice(-20).reverse().map((l) => `<div>${esc(l)}</div>`)].join('');
  }

  function renderChoir() {
    const box = root?.querySelector('#altars');
    if (!box) return;
    box.innerHTML = S.choirs.map((C, i) => `<div class="altar">
      <div><b>${esc(C.name)}</b>${i === 0 ? ' <span class="faint">(home)</span>' : ''} <span class="dim" style="font-size:12px">· ${C.connected ? `${C.members.length} gathered` : C.trouble ? esc(C.trouble) : 'not connected'}</span>
        <button class="small" data-leave-altar="${i}" data-tip="=Leave this altar (you can join it again with its address).">×</button></div>
      <div class="feed">${C.members.map((m) => `<div><span style="color:${ELEMENT_COLOR[m.element]}">${ELEMENT_GLYPH[m.element]}</span> ${esc(m.handle)}${m.aura === save.aura?.pub ? ' <span class="faint">(you)</span>' : ''} <span class="dim mono" style="font-size:12px">${m.hum.toLocaleString()}/s · ${m.words} words · truest ${m.truest}</span>${m.actant !== 'none' ? ` <span class="gold" style="font-size:12px">· actant ${m.activity === 'thinking' || m.actant === 'thinking' ? 'thinking…' : m.activity === 'heard' ? 'heard you' : m.actant}</span>` : m.activity === 'typing' ? ' <span class="gold" style="font-size:12px">· typing…</span>' : ''}</div>`).join('')}</div>
      <div class="feed choir-lines">${C.lines.slice(-8).map((l) => `<div><span class="${l.mine ? 'gold' : ''}">${esc(l.from)}:</span> ${esc(l.text)}</div>`).join('') || '<div class="faint">No one has spoken.</div>'}</div>
      ${activityLine(C)}
    </div>`).join('') || '<div class="faint">You belong to no altar.</div>';
    const to = root.querySelector('#ch-to') as HTMLSelectElement;
    const keep = to.value;
    to.innerHTML = S.choirs.map((C, i) => `<option value="${i}">${esc(C.name)}</option>`).join('');
    if (keep && Number(keep) < S.choirs.length) to.value = keep;
  }
  /** Who is doing what right now at an altar (others only): typing, heard you, thinking. */
  function activityLine(C: Choir): string {
    const say = (m: ChoirMember) => m.activity === 'typing' ? `${esc(m.handle)} is typing` : m.activity === 'heard' ? `${esc(m.handle)} heard you; a reply is coming` : `${esc(m.handle)} is thinking`;
    const busy = C.members.filter((m) => m.activity && m.aura !== save.aura?.pub);
    return busy.length ? `<div class="activity">${busy.map(say).join(' · ')}<span class="dots"><i>.</i><i>.</i><i>.</i></span></div>` : '';
  }
  /** The choir chosen to speak to (and share at). */
  const chosenChoir = () => S.choirs[Number((root.querySelector('#ch-to') as HTMLSelectElement | null)?.value ?? 0)] ?? S.home;

  function renderAll() {
    renderPlan();
    renderChoir();
    renderActant();
    renderAdvice();
    renderTop();
    renderBook();
    renderScryInfo();
    renderTasks();
    renderLoadout();
  }

  function bind(cell: string) {
    if (save.loadout.includes(cell)) return;
    let i = picking ?? save.loadout.findIndex((c) => !c);
    if (i < 0) i = save.loadout.length - 1;
    save.loadout[i] = cell;
    picking = null;
    persist(save);
    renderLoadout();
    renderBook();
  }

  // ---------- worlds and their progress ----------
  const world = (): World => save.lastWorld ?? 'dark';
  const progress = (w: World): { descent: number; last: number } => {
    if (w === 'dark') return { descent: save.descent, last: save.lastDescent };
    save.worlds ??= {};
    return (save.worlds[w] ??= { descent: 0, last: 0 });
  };
  const setProgress = (w: World, p: { descent: number; last: number }) => {
    if (w === 'dark') { save.descent = p.descent; save.lastDescent = p.last; }
    else { save.worlds ??= {}; save.worlds[w] = p; }
  };
  const WALK_LABEL: Record<World, string> = { dark: 'Walk into the dark', bastion: 'Hold the bastion', council: 'Take your seat', racer: 'Take the starting line' };

  function renderWorld() {
    const w = world();
    const p = progress(w);
    p.last = Math.min(p.last, p.descent);
    const dsel = root.querySelector('#descent') as HTMLSelectElement;
    dsel.innerHTML = Array.from({ length: p.descent + 1 }, (_, i) => `<option value="${i}">${i + 1} · ${worldDescentName(w, i)}</option>`).join('');
    dsel.value = String(p.last);
    (root.querySelector('#world') as HTMLSelectElement).value = w;
    root.querySelector('#run')!.textContent = WALK_LABEL[w];
    renderLoadout();
  }

  /** Open a round in the dungeon, prove bound names against its context (sanctum side), hand over only the proofs. */
  /** `byActant`: the actant walks (a standing order), so its code plays; otherwise the player's hands do. */
  async function walk(w: World, level: number, byActant = false, dungeon?: string) {
    // hush: the world (and the provers at the threshold) get the machine; meditation drops to one voice
    const voices = S.pool.getActive();
    const hush = save.quietPlay !== false;
    if (hush) S.pool.setActive(1);
    const unhush = () => { if (hush) S.pool.setActive(voices); };
    const overlay = frag(`<div class="overlay threshold"><h1 style="font-size:30px; color:var(--gold)">At the threshold</h1>
      <div class="prose" id="th-msg" style="font-size:20px">The way opens…</div>
      <div class="dim" id="th-sub" style="font-style:italic; min-height:1.5em; transition:opacity .6s"></div>
      <div class="vessels" id="th-v"></div>
      <div class="bitsbig" id="th-n" style="font-size:22px"></div></div>`);
    root.appendChild(overlay);
    const msg = (t: string) => { overlay.querySelector('#th-msg')!.innerHTML = t; };
    // lines to read while the names are proven (a few seconds each)
    const LINES: Record<World, string[]> = {
      dark: [
        'The dark will learn what your words can do. Never where their beings dwell.',
        'Only temper and truth cross the threshold. The dwelling stays yours.',
        'Each word is weighed, not heard.',
        'What you carry in is sealed until you come back out.',
      ],
      bastion: [
        'Your shrines will know their patrons by deed, never by dwelling.',
        'Only temper and truth cross the threshold. The dwelling stays yours.',
        'Each word is weighed, not heard.',
        'The road is long. Every shrine will speak in your voice.',
      ],
      racer: [
        'The road will know what your words can do. Never where their beings dwell.',
        'Only temper and truth cross the threshold. The dwelling stays yours.',
        'Each word is weighed, not heard.',
        'Five rivals warm their engines on the words of charted beings.',
      ],
      council: [
        'The council will see your words as cards: what they do, never where they dwell.',
        'Only temper and truth cross the threshold. The dwelling stays yours.',
        'Each word is weighed, not heard.',
        'Across the table, the Warden shuffles words older than scholars.',
      ],
    };
    let li = 0;
    const sub = overlay.querySelector('#th-sub') as HTMLElement;
    const rotate = () => { sub.style.opacity = '0'; setTimeout(() => { sub.textContent = LINES[w][li++ % LINES[w].length]!; sub.style.opacity = '1'; }, 300); };
    rotate();
    const rotating = setInterval(rotate, 3600);
    const link = new DungeonLink(dungeon ?? dungeonAddress());
    try {
      const ticket = await link.open(level, w);
      const t0 = performance.now();
      // one vessel per name: it fills while its proof runs (eased toward the remembered proof time) and brims when proven
      const started = new Map<number, number>();
      const names = new Map<number, string>();
      let done = 0, total = 0;
      const est = proofEstimateMs();
      const vessel = (slot: number) => overlay.querySelector(`[data-v="${slot}"]`) as HTMLElement | null;
      let raf = 0;
      const fill = () => {
        const now = performance.now();
        for (const [slot, at] of started) {
          const t = (now - at) / est;
          const k = t < 1 ? 0.88 * t : 0.88 + 0.1 * (1 - Math.exp(1 - t));
          const liq = vessel(slot)?.querySelector('.liquid') as HTMLElement | null;
          if (liq) liq.style.height = `${(100 * k).toFixed(1)}%`;
        }
        raf = requestAnimationFrame(fill);
      };
      raf = requestAnimationFrame(fill);
      const speaking = () => [...started.keys()].map((sl) => `<em>${esc(names.get(sl)!)}</em>`);
      walking = true;
      const journey = await prepareJourney(app, ticket, (e) => {
        if (e.t === 'begin') {
          total = e.names.length;
          overlay.querySelector('#th-v')!.innerHTML = e.names.map((n) => `<div class="vessel queued" data-v="${n.slot}" style="--c:${ELEMENT_COLOR[n.spirit.element]}">
            <img src="${sigilURL(n.spirit)}" alt=""><div class="flask"><i class="liquid"></i></div><div class="vname">${esc(n.name)}</div></div>`).join('');
          for (const n of e.names) names.set(n.slot, n.name);
          msg('Your words are spoken at the threshold…');
        } else if (e.t === 'start') {
          started.set(e.slot, performance.now());
          vessel(e.slot)?.classList.replace('queued', 'speaking');
        } else {
          started.delete(e.slot);
          done++;
          const v = vessel(e.slot);
          v?.classList.remove('speaking', 'queued');
          v?.classList.add(e.ok ? 'spoken' : 'refused');
          const liq = v?.querySelector('.liquid') as HTMLElement | null;
          if (liq) liq.style.height = e.ok ? '100%' : '0%';
        }
        const now = speaking();
        if (e.t !== 'begin' && now.length) msg(`${now.join(', ')} ${now.length > 1 ? 'are' : 'is'} spoken…`);
        overlay.querySelector('#th-n')!.textContent = `${done} / ${total}`;
      });
      cancelAnimationFrame(raf);
      clearInterval(rotating);
      if (byActant && w === 'racer') journey.pilot = S.actant.pilot(); // an actant standing ready drives with its own code
      if (byActant && w === 'dark') journey.fighter = S.actant.fighter(); // and fights with its own
      console.log(`[threshold] ${journey.bundle.length} names proven in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      msg(w === 'bastion' ? 'The bastion weighs your words…' : w === 'council' ? 'The council weighs your words…' : w === 'racer' ? 'The road weighs your words…' : 'The dark weighs your words…');
      const welcome = await link.enter(journey);
      // the one who opens a shared round calls it at their altars, with where to find it
      if ((welcome.world === 'dark' || welcome.world === 'racer') && welcome.gathering?.first) {
        for (const c of S.choirs) c.call(w, level, shareable(link.address, 5192), welcome.gathering.closesIn);
      }
      const host: RoundHost = {
        report(r) {
          save.runs.push({ at: Date.now(), world: r.world, descent: r.level, wave: r.wave, won: r.won, kills: r.kills, finds: 0 });
          const text = `${r.won ? 'won' : 'lost'} in ${WORLDS.find((x) => x.id === r.world)?.name ?? r.world} at ${worldDescentName(r.world, r.level)} (${r.world === 'racer' ? `place ${r.wave}` : r.world === 'council' ? `turn ${r.wave}` : `wave ${r.wave}`}, ${r.kills} struck)`;
          addHistory(save, { kind: 'journey', by: 'player', text });
          S.events.emit({ kind: 'journey', text, world: r.world });
          const p = progress(r.world);
          const unlocked = r.won && r.level >= p.descent;
          if (unlocked) setProgress(r.world, { descent: r.level + 1, last: p.last });
          persist(save);
          return { unlocked };
        },
        leave: () => { unhush(); app.go(sanctumScreen(app)); },
        toast: (html, color) => app.toast(html, color),
      };
      app.go(welcome.world === 'bastion' ? bastionScreen(link, welcome, journey, host) : welcome.world === 'council' ? councilScreen(link, welcome, journey, host) : welcome.world === 'racer' ? racerScreen(link, welcome, journey, host) : runScreen(link, welcome, journey, host));
    } catch (err) {
      walking = false;
      unhush();
      clearInterval(rotating);
      link.close();
      overlay.remove();
      app.toast(`The way is shut: ${esc(String((err as Error).message ?? err))}. Is the dungeon running?`, '#ff7a6b');
    }
  }

  return {
    mount(ui) {
      // Explorer Claude: the sanctum lends a walk and a summary (see explorer.ts)
      lendSanctum({
        walk: (w, level) => walk(w, level),
        summary: () => ({
          screen: 'sanctum', handle: save.handle ?? null, hum: Math.round(S.pool.rate()),
          words: S.graspedWords().map((k) => `${k} ${S.strength(k)} truths`), loadout: save.loadout,
          plan: S.planner.aims.map((a) => describeAim(a)), altars: S.choirs.map((c) => ({ name: c.name, connected: c.connected, members: c.members.map((m) => m.handle) })),
          actant: S.actant.config.on ? { model: S.actant.config.model, status: S.actant.status, races: !!S.actant.config.joinRaces, dark: !!S.actant.config.joinDark } : null,
        }),
      });
      const aura = save.aura!;
      const el0 = aura.element;
      root = frag(`<div class="sanctum">
        <div class="topbar">
          <h1 style="font-size:20px; color:var(--gold)">The Sanctum</h1>
          <span style="color:${ELEMENT_COLOR[el0]}" data-tip="element">${ELEMENT_GLYPH[el0]} ${ELEMENT_NAMES[el0]}</span>
          <span class="dim mono aura-hex" data-tip="aura">${aura.pub.slice(0, 8)}…</span>
          <span class="dim" data-tip="capacity">capacity <span class="mono gold" id="cap"></span></span>
          <span class="spacer"></span>
          <span class="dim" data-tip="hum">hum <span class="mono" id="hum"></span></span>
          <span class="dim" data-tip="voices">voices <button class="small" id="wdec">−</button> <span class="mono" id="workers"></span> <button class="small" id="winc">+</button></span>
          <button class="small ${save.quietPlay === false ? '' : 'on'}" id="hush" data-tip="=<b>Hush in the worlds</b>: while you are in a world, your meditation drops to a single voice so the world runs smoothly; it returns to full when you come back. Click to keep every voice chanting instead.">☾</button>
          <select id="world" data-tip="world">${WORLDS.map((x) => `<option value="${x.id}">${x.name}</option>`).join('')}</select>
          <select id="descent" data-tip="descent"></select>
          <input id="host" class="host-input" placeholder="plays at: here" value="${esc(dungeonLabel())}" data-tip="=${esc(dungeonTip())}">
          <button class="primary" id="run" data-tip="walk">Walk into the dark</button>
          <button class="small" id="mute" data-tip="mute">♪</button>
          <button class="small" id="title" data-tip="home">⌂</button>
        </div>
        <div class="advice" id="advice" data-tip="advice"></div>
        <div class="cols">
          <div class="panel codex-panel"><h2 data-tip="=Meditation seeks your true name for a spirit. Each truth requires twice as much meditation to unveil as the last. A truer name draws more, strains less and outshouts rivals at a crowded well.">Name Book</h2>
            <div id="codex"></div></div>
          <div class="panel"><h2 data-tip="=<b>The plan</b>: aims your sanctum pursues on its own, in order. Set it and walk away: meditation and searching follow it, and it moves on as each aim is fulfilled. An actant tending this sanctum uses the same plan.">Plan</h2>
            <div id="plan"></div>
            <div class="aimform">
              <select id="a-kind" data-tip="=What kind of aim."><option value="deepen">deepen words</option><option value="grasp">grasp new beings</option><option value="seek">seek beings</option></select>
              <span id="a-fields"></span>
              <button class="small" id="a-add" data-tip="=Add this aim to the end of the plan.">add aim</button>
            </div>
            <details id="hist"><summary class="dim" data-tip="=What the sanctum has done, and who changed the plan.">history</summary><div class="feed" id="history"></div></details>
            <div class="actant" id="actant">
              <h2 style="margin-top:12px" data-tip="=<b>An actant</b>: a mind (a local model) that tends this sanctum toward your goal. When something happens (a find, a grasp, a search or an aim finished, a journey), it reviews the sanctum and reprioritizes the plan, using the same controls you do. While it thinks, meditation pauses: thought costs chanting.">Actant</h2>
              <div class="actant-row"><button class="small" id="ac-wake"></button> <select id="ac-model" data-tip="=Which local model thinks (served by ollama on this machine)."></select> <button class="small" id="ac-now" data-tip="=Ask it to review the sanctum now.">review now</button> <button class="small" id="ac-race" data-tip="=Standing order: when your choir gathers a Dark Racer race, this sanctum's actant joins it on its own and drives with its own driving code (which it can rewrite after each race).">races</button> <button class="small" id="ac-dark" data-tip="=Standing order: when your choir walks into the dark, this sanctum's actant walks in beside them on its own and fights with its own fighting code (which it can rewrite after each round).">the dark</button> <span class="dim" id="ac-status"></span></div>
              <textarea id="ac-goal" rows="2" placeholder="its goal: it sets this itself (tell it in chat), or type one" data-tip="=The goal the actant works toward. It keeps this itself: tell it a goal in chat and it makes it its own (set_goal), and you'll see it here. You can also type one."></textarea>
              <div class="dim" id="ac-thought" style="font-style:italic; font-size:13px"></div>
              <details><summary class="dim" style="font-size:12px">its doings</summary><div class="feed" id="ac-log" style="font-size:12px"></div></details>
            </div>
            <h2 style="margin-top:14px">Scrying</h2>
            <div class="hint">Choose a region and a depth, then search it division by division. Wisps dwell at depth 12; each layer down holds half as many beings, a class mightier, and takes sixteen times the searching.</div>
            <div class="scryform">
              <label data-tip="scryRegion">element</label><select id="s-el">${ELEMENT_NAMES.map((n, i) => `<option value="${i}">${ELEMENT_GLYPH[i]} ${n}</option>`).join('')}</select>
              <label data-tip="scryRegion">aspect</label><select id="s-asp"></select>
              <label data-tip="scryRegion">tradition</label><select id="s-trad"></select>
              <label data-tip="depth">depth</label><input id="s-depth" type="number" min="${MIN_SPIRIT_DEPTH}" max="24" value="${MIN_SPIRIT_DEPTH}">
            </div>
            <div id="s-info" style="font-size:14px; line-height:1.45; margin-bottom:8px"></div>
            <button id="s-go" data-tip="scry">Scry here</button> <button id="s-chart" data-tip="chart">Chart of the astral</button>
            <h2 style="margin-top:16px">Under way</h2><div id="tasks"></div>
            <h2 style="margin-top:12px">Finds</h2><div class="feed" id="feed"></div>
          </div>
          <div class="panel"><h2>Loadout</h2>
            <div class="hint">Bind up to four grasped words. In the Dark: left and right click speak the first two, keys 1 and 2 the others. Aim with the mouse. Move with WASD.</div>
            <div class="slots" id="slots"></div>
            <h2 style="margin-top:16px" data-tip="=The names you play as cards at the Council: up to twelve, separate from the four you carry into the Dark and the Bastion.">Council deck</h2><div id="deck"></div>
            <h2 style="margin-top:16px" data-tip="walks">Walks</h2><div class="feed" id="runs"></div>
            <h2 style="margin-top:16px" data-tip="=<b>Your altars</b>: the gathering places you belong to (home, a church's, a friend's). Each has its choir: players, and actants tending their own sanctums. See each other's hum, talk, share the signs of beings, and hear rounds being called. Everything is sealed in transit.">Altars</h2>
            <div class="choir-me">you are <input id="ch-handle" class="host-input" placeholder="your handle" data-tip="=How your altars know you."></div>
            <div id="altars"></div>
            <div class="choir-me">say at <select id="ch-to" data-tip="=Which altar you speak to (and share signs at)."></select></div>
            <input id="ch-say" class="choir-say" placeholder="say to the choir…" data-tip="=Speak to everyone gathered at that altar. An actant listening will hear you.">
            <input id="ch-join" class="choir-say" placeholder="join an altar: host:port#k=…" data-tip="=An altar's address, as its keeper shares it (with its key). ${LAN_ALTAR ? `Others can join yours at <em>${esc(LAN_ALTAR)}</em>.` : ''}">
            ${LAN_ALTAR ? `<div class="faint mono" style="font-size:11px; word-break:break-all">your altar: ${esc(LAN_ALTAR)}</div>` : ''}
          </div>
        </div>
      </div>`);
      ui.appendChild(root);
      (root.querySelector('#s-el') as HTMLSelectElement).value = String(el0);
      refreshAspectOptions();
      root.querySelector('#s-el')!.addEventListener('change', () => { refreshAspectOptions(); renderScryInfo(); });
      root.querySelector('#s-asp')!.addEventListener('change', () => {
        refreshTradOptions();
        const d = root.querySelector('#s-depth') as HTMLInputElement;
        const { prefix } = formPrefix();
        if (Number(d.value) <= prefix.length) d.value = String(Math.max(MIN_SPIRIT_DEPTH, prefix.length + 1));
        renderScryInfo();
      });
      root.querySelector('#s-trad')!.addEventListener('change', () => {
        const d = root.querySelector('#s-depth') as HTMLInputElement;
        const { prefix } = formPrefix();
        if (Number(d.value) <= prefix.length) d.value = String(prefix.length + 3);
        renderScryInfo();
      });
      root.querySelector('#s-depth')!.addEventListener('input', renderScryInfo);
      root.querySelector('#s-go')!.addEventListener('click', () => {
        const { prefix, depth } = formPrefix();
        S.startScry(prefix, depth, 'scry');
        renderTasks();
        renderScryInfo();
      });
      const dsel = root.querySelector('#descent') as HTMLSelectElement;
      dsel.addEventListener('change', () => { const w = world(); setProgress(w, { ...progress(w), last: Number(dsel.value) }); persist(save); });
      renderAimFields();
      root.querySelector('#a-kind')!.addEventListener('change', renderAimFields);
      root.querySelector('#a-add')!.addEventListener('click', addAimFromForm);
      root.querySelector('#plan')!.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        const id = t.closest('[data-aim]')?.getAttribute('data-aim');
        if (!id) return;
        const i = S.planner.aims.findIndex((a) => a.id === id);
        const share = t.getAttribute('data-aim-share'), move = t.getAttribute('data-aim-move');
        if (share) S.planner.setShare(id, S.planner.aims[i]!.share + Number(share), 'player');
        else if (move) S.planner.move(id, i + Number(move), 'player');
        else if (t.hasAttribute('data-aim-del')) S.planner.remove(id, 'player');
        renderAll();
      });
      S.planner.onChange = () => renderPlan();
      {
        const handle = root.querySelector('#ch-handle') as HTMLInputElement;
        handle.value = save.handle ?? '';
        handle.addEventListener('change', () => { save.handle = handle.value.trim().slice(0, 24) || undefined; persist(save); for (const c of S.choirs) c.reconnect(); });
        const say = root.querySelector('#ch-say') as HTMLInputElement;
        // typing shows at the chosen altar while you type (and stops when you send, or after a few quiet seconds)
        let typingAt: Choir | null = null, typingT: ReturnType<typeof setTimeout> | null = null;
        const stopTyping = () => { if (typingT) clearTimeout(typingT); typingT = null; typingAt?.activity(null); typingAt = null; };
        say.addEventListener('input', () => {
          const c = chosenChoir();
          if (!c || !say.value.trim()) return stopTyping();
          if (typingAt !== c) { stopTyping(); typingAt = c; c.activity('typing'); }
          if (typingT) clearTimeout(typingT);
          typingT = setTimeout(stopTyping, 4000);
        });
        say.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (typingT) clearTimeout(typingT); typingT = null; typingAt = null; chosenChoir()?.say(say.value); say.value = ''; } });
        const join = root.querySelector('#ch-join') as HTMLInputElement;
        join.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          const c = S.joinAltar(join.value);
          app.toast(c ? `You join the altar at <em>${esc(c.name)}</em>.` : 'You already belong to that altar (or the address is empty).');
          join.value = '';
        });
        root.querySelector('#altars')!.addEventListener('click', (e) => {
          const i = (e.target as HTMLElement).closest('[data-leave-altar]')?.getAttribute('data-leave-altar');
          if (i != null && S.choirs[Number(i)]) { const c = S.choirs[Number(i)]!; S.leaveAltar(c); app.toast(`You leave the altar at <em>${esc(c.name)}</em>.`); }
        });
        offs.push(S.choirChange.on(() => { renderChoir(); renderBook(); }));
        for (const c of S.choirs) c.connect(); // a new aura has no links yet
        // an actant standing ready answers a call on its own (no model call: a standing order), at the caller's dungeon
        offs.push(S.calls.on(({ world: w, level, dungeon, by }) => {
          if (by === save.aura?.pub || walking) return;
          if (w === 'racer' ? !S.actant.pilot() : w === 'dark' ? !S.actant.fighter() : true) return;
          app.toast(w === 'racer' ? `Your actant joins the race at ${worldDescentName('racer', level)}.` : `Your actant walks into the dark at ${worldDescentName('dark', level)}.`);
          void walk(w, level, true, dungeon);
        }));
      }
      {
        const A = S.actant;
        const goal = root.querySelector('#ac-goal') as HTMLTextAreaElement;
        goal.value = A.config.goal;
        goal.addEventListener('change', () => { A.config.goal = goal.value.trim(); persist(save); });
        root.querySelector('#ac-wake')!.addEventListener('click', () => { if (A.config.on) A.sleep(); else { A.wake(); void A.review('You have just been woken to tend this sanctum.'); } renderActant(); });
        root.querySelector('#ac-now')!.addEventListener('click', () => void A.review());
        root.querySelector('#ac-race')!.addEventListener('click', () => { A.config.joinRaces = !A.config.joinRaces; persist(save); renderActant(); });
        root.querySelector('#ac-dark')!.addEventListener('click', () => { A.config.joinDark = !A.config.joinDark; persist(save); renderActant(); });
        const sel = root.querySelector('#ac-model') as HTMLSelectElement;
        sel.innerHTML = `<option>${esc(A.config.model)}</option>`;
        void toolModels().then((ms) => { if (ms.length) sel.innerHTML = ms.map((m) => `<option ${m === A.config.model ? 'selected' : ''}>${esc(m)}</option>`).join(''); else sel.title = 'no local model server found (ollama on 127.0.0.1:11434)'; });
        sel.addEventListener('change', () => { A.config.model = sel.value; persist(save); });
        A.onChange = () => { renderActant(); renderPlan(); };
      }
      root.querySelector('#host')!.addEventListener('change', (e) => {
        setDungeonAddress((e.target as HTMLInputElement).value);
        (e.target as HTMLInputElement).value = dungeonLabel();
        app.toast(dungeonLabel() ? `You will play at the dungeon at <em>${esc(dungeonLabel().split('#')[0]!)}</em>.` : 'You play at your own dungeon again.');
      });
      root.querySelector('#hush')!.addEventListener('click', (e) => {
        save.quietPlay = save.quietPlay === false;
        (e.currentTarget as HTMLElement).classList.toggle('on', save.quietPlay !== false);
        persist(save);
      });
      root.querySelector('#world')!.addEventListener('change', (e) => { save.lastWorld = (e.target as HTMLSelectElement).value as World; persist(save); renderWorld(); });
      renderWorld();
      root.querySelector('#s-chart')!.addEventListener('click', () => openChart(app, (e, a, d) => {
        (root.querySelector('#s-el') as HTMLSelectElement).value = String(e);
        refreshAspectOptions();
        (root.querySelector('#s-asp') as HTMLSelectElement).value = String(a);
        refreshTradOptions();
        (root.querySelector('#s-depth') as HTMLInputElement).value = String(d);
        renderScryInfo();
      }));
      root.querySelector('#run')!.addEventListener('click', () => walk(world(), progress(world()).last));
      root.querySelector('#title')!.addEventListener('click', () => app.go(titleScreen(app)));
      const muteBtn = root.querySelector('#mute') as HTMLButtonElement;
      const showMute = () => { muteBtn.style.opacity = isMuted() ? '0.4' : '1'; };
      muteBtn.addEventListener('click', () => { setMuted(!isMuted()); showMute(); });
      showMute();
      root.querySelector('#wdec')!.addEventListener('click', () => { S.pool.setActive(Math.max(1, S.pool.getActive() - 1)); save.workers = S.pool.getActive(); persist(save); renderTop(); });
      root.querySelector('#winc')!.addEventListener('click', () => { S.pool.setActive(S.pool.getActive() + 1); save.workers = S.pool.getActive(); persist(save); renderTop(); });
      // pointerdown, not click: panels re-render on a timer and a click can straddle a re-render
      root.addEventListener('pointerdown', (e) => {
        const t = e.target as HTMLElement;
        const card = t.closest('[data-card]')?.getAttribute('data-card');
        if (card) { openSpiritCard(app, card); return; }
        const foc = t.closest('[data-focus]')?.getAttribute('data-focus');
        if (foc) { S.setFocus(foc, !S.isFocused(foc)); renderBook(); return; }
        const med = t.closest('[data-med]')?.getAttribute('data-med');
        if (med) { S.meditate(med, !S.isMeditating(med)); renderBook(); return; }
        const share = t.closest('[data-share]')?.getAttribute('data-share');
        if (share) { const c = chosenChoir(); c?.share(share); app.toast(c?.connected ? `You shared its sign at <em>${esc(c.name)}</em>.` : 'You are not gathered at that altar.'); return; }
        const dk = t.closest('[data-deck]')?.getAttribute('data-deck');
        if (dk) {
          const d = save.councilDeck ?? [];
          save.councilDeck = d.includes(dk) ? d.filter((c) => c !== dk) : d.length < COUNCIL.deckMax ? [...d, dk] : d;
          if (!d.includes(dk) && d.length >= COUNCIL.deckMax) app.toast(`The council deck holds ${COUNCIL.deckMax} names.`);
          persist(save); renderLoadout(); renderBook(); return;
        }
        const b = t.closest('[data-bind]')?.getAttribute('data-bind');
        if (b) { bind(b); return; }
        const stop = t.closest('[data-stop]')?.getAttribute('data-stop');
        if (stop) { const [p, d] = stop.split('|'); S.stopScry(p!, Number(d)); renderTasks(); renderScryInfo(); return; }
        const ub = t.closest('[data-unbind]')?.getAttribute('data-unbind');
        if (ub) { save.loadout[Number(ub)] = null; persist(save); renderLoadout(); renderBook(); e.stopPropagation(); return; }
        const slot = t.closest('[data-slot]')?.getAttribute('data-slot');
        if (slot !== undefined && slot !== null) { picking = picking === Number(slot) ? null : Number(slot); renderLoadout(); }
      });
      offs.push(S.finds.on((f) => {
        if (!f.isNew) return;
        freshCells.add(f.spirit.cell);
        codex?.render();
        const c = ELEMENT_COLOR[f.spirit.element];
        feed.push(feedLine(f.spirit, f.source === 'shrine' ? 'at a shrine' : 'scried'));
        app.toast(`<img class="sigil-sm" src="${sigilURL(f.spirit)}" alt=""> A spirit answers: <span style="color:${c}">${esc(spiritName(f.spirit))}</span>, ${magnitudeTitle(f.spirit.magnitude)} of ${esc(ASPECTS[f.spirit.element]![f.spirit.aspect]!)}`, c);
        renderBook();
        renderTasks();
      }));
      offs.push(S.names.on((n) => {
        if (n.learned) {
          const sp = spiritOf(save, n.cell);
          if (sp) app.toast(`You have learned the name of <span style="color:${ELEMENT_COLOR[sp.element]}">${esc(spiritName(sp))}</span>.`, ELEMENT_COLOR[sp.element]);
        }
      }));
      codex = createCodex(app, root.querySelector('#codex') as HTMLElement, freshCells);
      // drag a learned name from the book onto a loadout slot
      root.addEventListener('dragstart', (e) => {
        const cell = (e.target as HTMLElement).closest?.('[data-drag]')?.getAttribute('data-drag');
        if (cell && e.dataTransfer) { e.dataTransfer.setData('text/truename', cell); e.dataTransfer.effectAllowed = 'link'; root.classList.add('dragging'); }
      });
      root.addEventListener('dragend', () => root.classList.remove('dragging'));
      root.addEventListener('dragover', (e) => {
        if ((e.target as HTMLElement).closest('[data-slot]')) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'link'; }
      });
      root.addEventListener('drop', (e) => {
        const slot = (e.target as HTMLElement).closest('[data-slot]')?.getAttribute('data-slot');
        const cell = e.dataTransfer?.getData('text/truename');
        root.classList.remove('dragging');
        if (slot == null || !cell || !S.learned(cell)) return;
        e.preventDefault();
        const i = Number(slot);
        const was = save.loadout.indexOf(cell);
        if (was >= 0) save.loadout[was] = save.loadout[i] ?? null; // dropping onto another slot swaps
        save.loadout[i] = cell;
        picking = null;
        persist(save);
        renderLoadout();
        renderBook();
      });
      renderAll();
      let n = 0;
      timer = setInterval(() => {
        renderTop();
        renderAdvice();
        renderScryInfo();
        renderTasks();
        if (++n % 5 === 0 && !root.classList.contains('dragging')) renderBook();
      }, 800);
      offs.push(S.names.on(() => codex?.render()));
    },
    unmount() {
      lendSanctum(null);
      clearInterval(timer);
      offs.forEach((f) => f());
      S.planner.onChange = null;
      S.actant.onChange = null;
    },
  };
}
