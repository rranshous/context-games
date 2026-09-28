import type { App, Screen } from '../main.ts';
import { frag, esc } from '../dom.ts';
import {
  ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, ASPECTS, FORMS, HEARTH_GOD,
  addressOf, spiritName, magnitudeTitle, fmtDuration, traditionName, truths,
} from '../lore.ts';
import { persist, spiritOf } from '../save.ts';
import { expectedSpirits } from '../services.ts';
import { MIN_NAME_BITS, MIN_SPIRIT_DEPTH, cellsBelow, target, type Spirit } from '@truenames/universe';
import { runScreen } from './run.ts';
import { DungeonLink, type RoundHost } from '../round.ts';
import { prepareJourney } from '../threshold.ts';
import { titleScreen } from './title.ts';
import { descentName, SLOTS } from '@truenames/dungeon/balance';
import { sigilURL } from '../sigil.ts';
import { isMuted, setMuted } from '../audio.ts';
import { openChart } from './chart.ts';
import { openSpiritCard } from './spirit-card.ts';
import { createCodex, type Codex } from './codex.ts';


export function sanctumScreen(app: App): Screen {
  const S = app.services;
  const save = app.save;
  let root: HTMLElement;
  let timer: ReturnType<typeof setInterval>;
  const offs: (() => void)[] = [];
  let picking: number | null = null;
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
      <div class="dim" data-tip="divisions">${Number(total).toLocaleString()} divisions · 1 in ${Math.round(1 / perCell).toLocaleString()} holds a spirit · ~${exp < 10 ? exp.toFixed(1) : Math.round(exp)} spirits here</div>
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
      const sp = cell ? spiritOf(save, cell) : null;
      const key = SLOTS[i]!.label;
      const mouse = '';
      if (!sp) return `<div class="slot ${picking === i ? 'picking' : ''}" data-slot="${i}" data-tip="slot"><span class="key">${key}</span><span class="dim">${picking === i ? 'choose a learned spirit: press bind' : 'empty'}${mouse}</span></div>`;
      return `<div class="slot filled" data-slot="${i}" data-tip="slot" style="--c:${ELEMENT_COLOR[sp.element]}"><span class="key">${key}</span><img class="sigil-sm" src="${sigilURL(sp)}" alt="">
        <span style="flex:1"><span style="color:${ELEMENT_COLOR[sp.element]}">${esc(spiritName(sp))}</span> <span class="dim" style="font-size:13px">${FORMS[sp.traits.form]!.name}${mouse}</span></span>
        <span class="bits gold" data-tip="truths">${truths(S.strength(sp.cell))}</span><button class="small" data-unbind="${i}" data-tip="unbind">×</button></div>`;
    }).join('');
    const canRun = save.loadout.some((c) => c && S.learned(c));
    (root.querySelector('#run') as HTMLButtonElement).disabled = !canRun;
    const runs = save.runs.slice(-6).reverse();
    root.querySelector('#runs')!.innerHTML = runs.length
      ? runs.map((r) => `<div><span class="faint">${(r.descent ?? 0) + 1}</span> ${r.won ? '<span class="gold">survived</span>' : `<span class="dim">fell at wave ${r.wave}</span>`} · ${r.kills} banished${r.finds ? ` · ${r.finds} found` : ''}</div>`).join('')
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
    const learnedUnbound = known.filter((c) => S.learned(c) && !save.loadout.includes(c));
    const scrying = S.pool.list().some((t) => t.kind === 'scry');
    const meditating = S.pool.list().some((t) => t.kind === 'name');
    let msg = '';
    if (known.length <= 1 && !scrying) msg = `Search for spirits: choose a region in <em>Scrying</em> and press <em>Scry here</em>. Your element, depth 7, is a good first place to look.`;
    else if (learnedUnbound.length && save.loadout.some((c) => !c)) msg = `A learned name is waiting. Press <em>bind</em> to carry it into the dark.`;
    else if (unlearned.length && known.every((c) => c === HEARTH_GOD || !S.learned(c)) && !unlearned.some((c) => S.isMeditating(c))) msg = `You have found spirits you cannot yet call. Press <em>meditate</em> on one; at ${truths(MIN_NAME_BITS)} its name is yours.`;
    else if (!save.runs.length) msg = `When you are ready, <em>walk into the dark</em>. Your meditation and scrying keep working while you fight.`;
    else if (!meditating) msg = `Nothing is being meditated. Names only grow truer while you work on them, even while you sleep.`;
    else if (save.runs.length && !save.runs.at(-1)!.won) msg = `The dark was too thick. Let meditation run; every truth makes each evocation about 1.4× stronger.`;
    box.innerHTML = msg || `Your names deepen while you rest. Go deeper when the dark feels thin: descent ${save.descent + 1} is open to you.`;
  }

  function renderAll() {
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

  /** Open a round in the dungeon, prove bound names against its context (sanctum side), hand over only the proofs. */
  async function walk(level: number) {
    const overlay = frag(`<div class="overlay"><h1 style="font-size:30px; color:var(--gold)">At the threshold</h1>
      <div class="prose" id="th-msg">The dungeon opens a way…</div>
      <div class="bitsbig" id="th-n" style="font-size:28px"></div></div>`);
    root.appendChild(overlay);
    const msg = (t: string) => { overlay.querySelector('#th-msg')!.textContent = t; };
    const link = new DungeonLink();
    try {
      const ticket = await link.open(level);
      msg('Your names are spoken into the dark, proven true without revealing where their spirits dwell…');
      const t0 = performance.now();
      const journey = await prepareJourney(app, ticket, (done, total) => {
        overlay.querySelector('#th-n')!.textContent = `${done} / ${total}`;
      });
      console.log(`[threshold] ${journey.bundle.length} names proven in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
      msg('The dungeon weighs your names…');
      const welcome = await link.enter(journey);
      const host: RoundHost = {
        report(r) {
          save.runs.push({ at: Date.now(), descent: r.level, wave: r.wave, won: r.won, kills: r.kills, finds: 0 });
          const unlocked = r.won && r.level >= save.descent;
          if (unlocked) save.descent = r.level + 1;
          persist(save);
          return { unlocked };
        },
        leave: () => app.go(sanctumScreen(app)),
        toast: (html, color) => app.toast(html, color),
      };
      app.go(runScreen(link, welcome, journey, host));
    } catch (err) {
      link.close();
      overlay.remove();
      app.toast(`The way is shut: ${esc(String((err as Error).message ?? err))}. Is the dungeon running?`, '#ff7a6b');
    }
  }

  return {
    mount(ui) {
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
          <select id="descent" data-tip="descent"></select>
          <button class="primary" id="run" data-tip="walk">Walk into the dark</button>
          <button class="small" id="mute" data-tip="mute">♪</button>
          <button class="small" id="title" data-tip="home">⌂</button>
        </div>
        <div class="advice" id="advice" data-tip="advice"></div>
        <div class="cols">
          <div class="panel codex-panel"><h2 data-tip="=Meditation seeks your true name for a spirit. Each truth requires twice as much meditation to unveil as the last. A truer name draws more, strains less and outshouts rivals at a crowded well.">Name Book</h2>
            <div id="codex"></div></div>
          <div class="panel"><h2>Scrying</h2>
            <div class="hint">Choose a region and a depth, then search it division by division. Shallow layers are small and soon exhausted. The deep is endless and sparse.</div>
            <div class="scryform">
              <label data-tip="scryRegion">element</label><select id="s-el">${ELEMENT_NAMES.map((n, i) => `<option value="${i}">${ELEMENT_GLYPH[i]} ${n}</option>`).join('')}</select>
              <label data-tip="scryRegion">aspect</label><select id="s-asp"></select>
              <label data-tip="scryRegion">tradition</label><select id="s-trad"></select>
              <label data-tip="depth">depth</label><input id="s-depth" type="number" min="${MIN_SPIRIT_DEPTH}" max="24" value="7">
            </div>
            <div id="s-info" style="font-size:14px; line-height:1.45; margin-bottom:8px"></div>
            <button id="s-go" data-tip="scry">Scry here</button> <button id="s-chart" data-tip="chart">Chart of the astral</button>
            <h2 style="margin-top:16px">Under way</h2><div id="tasks"></div>
            <h2 style="margin-top:12px">Finds</h2><div class="feed" id="feed"></div>
          </div>
          <div class="panel"><h2>Loadout</h2>
            <div class="hint">Bind up to four learned names. In the dark: left and right click speak the first two, keys 1 and 2 the others. Aim with the mouse. Move with WASD.</div>
            <div class="slots" id="slots"></div>
            <h2 style="margin-top:16px" data-tip="walks">Walks</h2><div class="feed" id="runs"></div>
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
      dsel.innerHTML = Array.from({ length: save.descent + 1 }, (_, i) => `<option value="${i}">${i + 1} · ${descentName(i)}</option>`).join('');
      save.lastDescent = Math.min(save.lastDescent, save.descent);
      dsel.value = String(save.lastDescent);
      dsel.addEventListener('change', () => { save.lastDescent = Number(dsel.value); persist(save); });
      root.querySelector('#s-chart')!.addEventListener('click', () => openChart(app, (e, a, d) => {
        (root.querySelector('#s-el') as HTMLSelectElement).value = String(e);
        refreshAspectOptions();
        (root.querySelector('#s-asp') as HTMLSelectElement).value = String(a);
        refreshTradOptions();
        (root.querySelector('#s-depth') as HTMLInputElement).value = String(d);
        renderScryInfo();
      }));
      root.querySelector('#run')!.addEventListener('click', () => walk(save.lastDescent));
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
      clearInterval(timer);
      offs.forEach((f) => f());
    },
  };
}
