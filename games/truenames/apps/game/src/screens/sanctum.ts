import type { App, Screen } from '../main.ts';
import { frag, esc } from '../dom.ts';
import {
  ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, ASPECTS, FORMS, HEARTH_GOD,
  addressOf, spiritName, magnitudeTitle, spiritStatsLine, nameRunes, fmtDuration, traditionName,
} from '../lore.ts';
import { persist, spiritOf } from '../save.ts';
import { expectedSpirits } from '../services.ts';
import { MIN_NAME_BITS, MIN_SPIRIT_DEPTH, cellsBelow, target, type Spirit } from '@truenames/universe';
import { runScreen } from './run.ts';
import { titleScreen } from './title.ts';
import { descentName } from '../balance.ts';

const MAX_BAR_BITS = 28;

export function sanctumScreen(app: App): Screen {
  const S = app.services;
  const save = app.save;
  let root: HTMLElement;
  let timer: ReturnType<typeof setInterval>;
  const offs: (() => void)[] = [];
  let picking: number | null = null;
  const freshCells = new Set<string>();
  const feed: string[] = [];

  function learnedSpirits(): Spirit[] {
    return Object.keys(save.spirits).map((c) => spiritOf(save, c)!).filter(Boolean);
  }

  // ---------- name book ----------
  function renderBook() {
    const box = root.querySelector('#book')!;
    const rate = S.pool.rate();
    const nameTasks = S.pool.list().length || 1;
    const perTask = rate / nameTasks;
    const spirits = learnedSpirits().sort((a, b) => {
      const sa = S.strength(a.cell), sb = S.strength(b.cell);
      const la = sa >= MIN_NAME_BITS ? 1 : 0, lb = sb >= MIN_NAME_BITS ? 1 : 0;
      return lb - la || b.magnitude - a.magnitude || sb - sa || (a.cell < b.cell ? -1 : 1);
    });
    if (!spirits.length) {
      box.innerHTML = `<div class="hint">You know no spirits. Scry to find one.</div>`;
      return;
    }
    box.innerHTML = spirits.map((sp) => {
      const s = S.strength(sp.cell);
      const learned = s >= MIN_NAME_BITS;
      const med = S.isMeditating(sp.cell);
      const color = ELEMENT_COLOR[sp.element]!;
      const rec = save.names[sp.cell];
      const next = med ? fmtDuration(2 ** (s + 1) / Math.max(1, perTask)) : null;
      const bound = save.loadout.includes(sp.cell);
      return `<div class="spirit ${freshCells.has(sp.cell) ? 'new' : ''}" style="--c:${color}">
        <div class="row"><span class="nm">${ELEMENT_GLYPH[sp.element]} ${esc(spiritName(sp))}</span>
          <span class="dim" style="font-size:13px">${magnitudeTitle(sp.magnitude)} · mag ${sp.magnitude}</span><span class="grow"></span>
          <span class="bits ${learned ? 'gold' : 'dim'}">${s ? s + ' bits' : 'unnamed'}</span></div>
        <div class="addr">${esc(addressOf(sp.cell))} <span class="mono faint">${sp.cell}</span>${sp.cell === HEARTH_GOD ? ' · <i>the hearth-god</i>' : ''}</div>
        <div class="stats">${spiritStatsLine(sp)}</div>
        <div class="bar"><i style="width:${(100 * s) / MAX_BAR_BITS}%"></i><span class="mark" style="left:${(100 * MIN_NAME_BITS) / MAX_BAR_BITS}%"></span></div>
        <div class="row">
          <button class="small ${med ? 'on' : ''}" data-med="${sp.cell}">${med ? 'meditating' : 'meditate'}</button>
          ${learned ? `<button class="small" data-bind="${sp.cell}" ${bound ? 'disabled' : ''}>${bound ? 'bound' : 'bind'}</button>` : `<span class="dim" style="font-size:13px">learn at ${MIN_NAME_BITS} bits</span>`}
          <span class="grow"></span>
          ${med ? `<span class="dim" style="font-size:13px">next bit ~${next}</span>` : ''}
          ${rec ? `<span class="runes" title="your name for this spirit">${nameRunes(rec.claim.nonce)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // ---------- scrying ----------
  function formPrefix(): { prefix: string; depth: number } {
    const e = (root.querySelector('#s-el') as HTMLSelectElement).value;
    const a = (root.querySelector('#s-asp') as HTMLSelectElement).value;
    const t = (root.querySelector('#s-trad') as HTMLSelectElement).value;
    const depth = Number((root.querySelector('#s-depth') as HTMLInputElement).value);
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
    info.innerHTML = `<div>${esc(addressOf(prefix))}, depth ${depth}</div>
      <div class="dim">${Number(total).toLocaleString()} divisions · 1 in ${Math.round(1 / perCell).toLocaleString()} holds a spirit · ~${exp < 10 ? exp.toFixed(1) : Math.round(exp)} spirits here</div>
      <div class="dim">scanned ${((100 * Number(done)) / Number(total)).toFixed(1)}% · a find every ~${fmtDuration(1 / perCell / cellsPerSec)} · whole layer ~${fmtDuration(remaining / cellsPerSec)}</div>`;
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
          return `<div class="task"><div class="row" style="display:flex; gap:8px"><span>${esc(addressOf(t.prefix))} · depth ${t.depth}</span><span style="flex:1"></span><span class="dim">${t.hits} found</span>
            <button class="small" data-stop="${t.id}">stop</button></div>
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
      const key = String(i + 1);
      const mouse = i === 0 ? ' · LMB' : i === 1 ? ' · RMB' : '';
      if (!sp) return `<div class="slot ${picking === i ? 'picking' : ''}" data-slot="${i}"><span class="key">${key}</span><span class="dim">${picking === i ? 'choose a learned spirit: press bind' : 'empty'}${mouse}</span></div>`;
      return `<div class="slot filled" data-slot="${i}" style="--c:${ELEMENT_COLOR[sp.element]}"><span class="key">${key}</span>
        <span style="flex:1"><span style="color:${ELEMENT_COLOR[sp.element]}">${esc(spiritName(sp))}</span> <span class="dim" style="font-size:13px">${FORMS[sp.traits.form]!.name}${mouse}</span></span>
        <span class="bits gold">${S.strength(sp.cell)}</span><button class="small" data-unbind="${i}">×</button></div>`;
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
    root.querySelector('#hum')!.textContent = `${Math.round(r).toLocaleString()} utterances/s`;
    root.querySelector('#workers')!.textContent = `${S.pool.getActive()} / ${S.pool.size}`;
    const cap = app.services.authority.auraState(save.aura!.pub).capacity;
    root.querySelector('#cap')!.textContent = cap.toFixed(1);
  }

  function renderAll() {
    renderTop();
    renderBook();
    renderScryInfo();
    renderTasks();
    renderLoadout();
  }

  function bind(cell: string) {
    let i = picking ?? save.loadout.findIndex((c) => !c);
    if (i < 0) i = save.loadout.length - 1;
    save.loadout[i] = cell;
    picking = null;
    persist(save);
    renderLoadout();
    renderBook();
  }

  return {
    mount(ui) {
      const aura = save.aura!;
      const el0 = aura.element;
      root = frag(`<div class="sanctum">
        <div class="topbar">
          <h1 style="font-size:20px; color:var(--gold)">The Sanctum</h1>
          <span style="color:${ELEMENT_COLOR[el0]}">${ELEMENT_GLYPH[el0]} ${ELEMENT_NAMES[el0]}</span>
          <span class="dim mono" title="your aura (public key)">aura ${aura.pub.slice(0, 10)}…</span>
          <span class="dim">capacity <span class="mono gold" id="cap"></span> bits</span>
          <span class="spacer"></span>
          <span class="dim">hum <span class="mono" id="hum"></span></span>
          <span class="dim">voices <button class="small" id="wdec">−</button> <span class="mono" id="workers"></span> <button class="small" id="winc">+</button></span>
          <select id="descent" title="how deep to walk"></select>
          <button class="primary" id="run">Walk into the dark</button>
          <button class="small" id="title">⌂</button>
        </div>
        <div class="cols">
          <div class="panel"><h2>Name Book</h2>
            <div class="hint">Meditation grinds your name for a spirit. Each bit of truth costs twice the last. A truer name draws more, strains less and outshouts rivals at a crowded well.</div>
            <div id="book"></div></div>
          <div class="panel"><h2>Scrying</h2>
            <div class="hint">Choose a region and a depth, then search it division by division. Shallow layers are small and soon exhausted. The deep is endless and sparse.</div>
            <div class="scryform">
              <label>element</label><select id="s-el">${ELEMENT_NAMES.map((n, i) => `<option value="${i}">${ELEMENT_GLYPH[i]} ${n}</option>`).join('')}</select>
              <label>aspect</label><select id="s-asp"></select>
              <label>tradition</label><select id="s-trad"></select>
              <label>depth</label><input id="s-depth" type="number" min="${MIN_SPIRIT_DEPTH}" max="24" value="7">
            </div>
            <div id="s-info" style="font-size:14px; line-height:1.45; margin-bottom:8px"></div>
            <button id="s-go">Scry here</button>
            <h2 style="margin-top:16px">Under way</h2><div id="tasks"></div>
            <h2 style="margin-top:12px">Finds</h2><div class="feed" id="feed"></div>
          </div>
          <div class="panel"><h2>Loadout</h2>
            <div class="hint">Bind up to six learned names. In the dark: keys 1–6, or left/right click for the first two. Aim with the mouse. Move with WASD.</div>
            <div class="slots" id="slots"></div>
            <h2 style="margin-top:16px">Walks</h2><div class="feed" id="runs"></div>
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
      root.querySelector('#run')!.addEventListener('click', () => app.go(runScreen(app, save.lastDescent)));
      root.querySelector('#title')!.addEventListener('click', () => app.go(titleScreen(app)));
      root.querySelector('#wdec')!.addEventListener('click', () => { S.pool.setActive(S.pool.getActive() - 1); save.workers = S.pool.getActive(); persist(save); renderTop(); });
      root.querySelector('#winc')!.addEventListener('click', () => { S.pool.setActive(S.pool.getActive() + 1); save.workers = S.pool.getActive(); persist(save); renderTop(); });
      // pointerdown, not click: panels re-render on a timer and a click can straddle a re-render
      root.addEventListener('pointerdown', (e) => {
        const t = e.target as HTMLElement;
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
        const c = ELEMENT_COLOR[f.spirit.element];
        feed.push(`<div><span style="color:${c}">${esc(spiritName(f.spirit))}</span>, ${magnitudeTitle(f.spirit.magnitude)} of ${esc(ASPECTS[f.spirit.element]![f.spirit.aspect]!)} <span class="faint mono">${f.spirit.cell}</span></div>`);
        app.toast(`A spirit answers: <span style="color:${c}">${esc(spiritName(f.spirit))}</span>, ${magnitudeTitle(f.spirit.magnitude)} of ${esc(ASPECTS[f.spirit.element]![f.spirit.aspect]!)}`, c);
        renderBook();
        renderTasks();
      }));
      offs.push(S.names.on((n) => {
        if (n.learned) {
          const sp = spiritOf(save, n.cell);
          if (sp) app.toast(`You have learned the name of <span style="color:${ELEMENT_COLOR[sp.element]}">${esc(spiritName(sp))}</span>.`, ELEMENT_COLOR[sp.element]);
        }
      }));
      renderAll();
      let n = 0;
      timer = setInterval(() => {
        renderTop();
        renderScryInfo();
        renderTasks();
        if (++n % 5 === 0) renderBook();
      }, 800);
      offs.push(S.names.on(() => renderBook()));
    },
    unmount() {
      clearInterval(timer);
      offs.forEach((f) => f());
    },
  };
}
