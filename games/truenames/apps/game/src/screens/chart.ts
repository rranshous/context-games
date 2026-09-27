// The chart: every element/aspect region, how much of each layer you've scried, and what you know there.
import type { App } from '../main.ts';
import { frag, esc } from '../dom.ts';
import { ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, ASPECTS, spiritName } from '../lore.ts';
import { spiritOf } from '../save.ts';
import { cellsBelow } from '@truenames/universe';
import { expectedSpirits } from '../services.ts';
import { sigilURL } from '../sigil.ts';

export const CHART_DEPTHS = [7, 8, 9, 10, 11, 12];

/** Fraction of the (element, aspect) layer at `depth` that is scanned, from element- and aspect-level scans. */
export function aspectCoverage(app: App, element: number, aspect: number, depth: number): number {
  const S = app.services;
  const N = cellsBelow(depth - 2);
  const fromElement = S.scanned(String(element), depth) - BigInt(aspect) * N;
  const fromAspect = S.scanned(`${element}${aspect}`, depth);
  const best = fromElement > fromAspect ? fromElement : fromAspect;
  if (best <= 0n) return 0;
  if (best >= N) return 1;
  return Number(best) / Number(N);
}

export function shallowestOpen(app: App, element: number, aspect: number): number {
  for (const d of CHART_DEPTHS) if (aspectCoverage(app, element, aspect, d) < 1) return d;
  return CHART_DEPTHS.at(-1)! + 1;
}

export function openChart(app: App, onPick: (element: number, aspect: number, depth: number) => void) {
  const save = app.save;
  const known = new Map<string, string[]>();
  for (const cell of Object.keys(save.spirits)) {
    const k = cell.slice(0, 2);
    if (!known.has(k)) known.set(k, []);
    known.get(k)!.push(cell);
  }
  const cellHtml = (e: number, a: number) => {
    const list = known.get(`${e}${a}`) ?? [];
    const bars = CHART_DEPTHS.map((d) => {
      const c = aspectCoverage(app, e, a, d);
      return `<i style="--f:${(c * 100).toFixed(1)}%"></i>`;
    }).join('');
    const names = list.map((c) => spiritOf(save, c)).filter(Boolean);
    const title = names.length ? names.map((s) => spiritName(s!)).join(', ') : 'no spirits known';
    const sig = names.sort((x, y) => y!.magnitude - x!.magnitude)[0];
    return `<div class="chart-cell" data-e="${e}" data-a="${a}" style="--c:${ELEMENT_COLOR[e]}" data-tip="=${esc(`<b>${ELEMENT_NAMES[e]} / ${ASPECTS[e]![a]}</b><br>${CHART_DEPTHS.map((d) => `depth ${d}: ${(aspectCoverage(app, e, a, d) * 100).toFixed(0)}% searched, ~${expectedSpirits(`${e}${a}`, d).toFixed(1)} spirits in all`).join('<br>')}<br>known here: ${title}<br><em>click to aim your scrying here</em>`)}">
      <div class="cc-name">${esc(ASPECTS[e]![a]!)}</div>
      <div class="cc-bars">${bars}</div>
      <div class="cc-known">${sig ? `<img src="${sigilURL(sig)}" alt="">` : ''}${list.length ? `<span>${list.length}</span>` : ''}</div>
    </div>`;
  };
  const root = frag(`<div class="overlay chart-overlay">
    <div class="chart-panel">
      <div style="display:flex; align-items:baseline; gap:12px; margin-bottom:6px">
        <h2 style="color:var(--gold); font-size:20px">Chart of the Astral</h2>
        <span class="dim" style="font-size:14px">rows: element · columns: aspect · bars: depths ${CHART_DEPTHS[0]}–${CHART_DEPTHS.at(-1)} scried · click to aim your scrying</span>
        <span style="flex:1"></span><button class="small" data-close>close</button>
      </div>
      <div class="chart-grid">
        <div></div>${Array.from({ length: 8 }, (_, a) => `<div class="cc-head" style="color:${ELEMENT_COLOR[a]}">${ELEMENT_GLYPH[a]}</div>`).join('')}
        ${Array.from({ length: 8 }, (_, e) => `<div class="cc-head row" style="color:${ELEMENT_COLOR[e]}">${ELEMENT_GLYPH[e]} ${ELEMENT_NAMES[e]}</div>${Array.from({ length: 8 }, (_, a) => cellHtml(e, a)).join('')}`).join('')}
      </div>
    </div>
  </div>`);
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-close]') || t === root) { root.remove(); return; }
    const c = t.closest('.chart-cell');
    if (c) {
      const e = Number(c.getAttribute('data-e')), a = Number(c.getAttribute('data-a'));
      root.remove();
      onPick(e, a, shallowestOpen(app, e, a));
    }
  });
  document.getElementById('ui')!.appendChild(root);
}
