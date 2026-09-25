// history.ts — the rise and fall of realms as a stacked area chart (towns or soldiers over time)

import { formatDate } from '../../shared/types.js';

export interface HistoryData {
  realms: { id: number; name: string; color: string }[];
  samples: { tick: number; held: number[]; soldiers: number[] }[];
}

const SVGNS = 'http://www.w3.org/2000/svg';
const SURFACE = '#15120e';
const INK = '#efe6d2', INK_DIM = '#b8ab8e', GRID = 'rgba(214,190,140,0.14)';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const shortName = (n: string) =>
  n.replace(/^(Kingdom|Crown|Principality|Free March|Dominion|Banner) of /, '').replace(/ (Realm|Compact)$/, '');

export interface Moment { tick: number; text: string; glyph: string }

export function drawHistory(root: HTMLElement, data: HistoryData, metric: 'held' | 'soldiers', moments: Moment[] = []) {
  root.innerHTML = '';
  const S = data.samples;
  if (S.length < 2) {
    root.innerHTML = '<p class="empty">History gathers month by month. Check back when the realms have lived a little.</p>';
    return;
  }
  const W = Math.max(240, root.clientWidth), H = 226;
  const m = { l: 30, r: 8, t: 24, b: 20 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const n = data.realms.length;
  const val = (s: HistoryData['samples'][0], k: number) => (metric === 'held' ? s.held : s.soldiers)[k] ?? 0;
  const totals = S.map(s => data.realms.reduce((a, r) => a + val(s, r.id), 0));
  const maxY = Math.max(1, ...totals);
  const t0 = S[0].tick, t1 = S[S.length - 1].tick;
  const X = (t: number) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const Y = (v: number) => m.t + ih - (v / maxY) * ih;

  const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${metric === 'held' ? 'Towns' : 'Soldiers'} held by each realm over time` });

  // Recessive grid: 3 horizontal hairlines with labels
  for (let i = 1; i <= 3; i++) {
    const v = (maxY * i) / 3;
    svg.append(el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: GRID, 'stroke-width': 1 }));
    const lbl = el('text', { x: m.l - 4, y: Y(v) + 3, 'text-anchor': 'end', fill: INK_DIM, 'font-size': 10 });
    lbl.textContent = v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
    svg.append(lbl);
  }
  // Years along the bottom
  const YEAR = 24 * 360;
  const y0 = Math.ceil(t0 / YEAR), y1 = Math.floor(t1 / YEAR);
  const step = Math.max(1, Math.ceil((y1 - y0 + 1) / 6));
  for (let y = y0; y <= y1; y += step) {
    const t = el('text', { x: X(y * YEAR), y: H - 6, 'text-anchor': 'middle', fill: INK_DIM, 'font-size': 10 });
    t.textContent = `Y${y + 1}`;
    svg.append(t);
  }

  // Stacked bands, bottom-up in realm order (color follows the realm, never its rank)
  const base = S.map(() => 0);
  const tops: number[][] = [];
  for (let k = 0; k < n; k++) {
    const r = data.realms[k];
    const top = S.map((s, i) => base[i] + val(s, r.id));
    tops.push(top);
    if (top.every((v, i) => v === base[i])) { continue; }
    let d = `M ${X(S[0].tick)} ${Y(top[0])}`;
    for (let i = 1; i < S.length; i++) d += ` L ${X(S[i].tick)} ${Y(top[i])}`;
    for (let i = S.length - 1; i >= 0; i--) d += ` L ${X(S[i].tick)} ${Y(base[i])}`;
    svg.append(el('path', { d: d + ' Z', fill: r.color, 'fill-opacity': 0.62 }));
    for (let i = 0; i < S.length; i++) base[i] = top[i];
  }
  // Surface gaps between bands
  for (let k = 0; k < n; k++) {
    let d = '';
    for (let i = 0; i < S.length; i++) d += `${i ? 'L' : 'M'} ${X(S[i].tick)} ${Y(tops[k][i])} `;
    svg.append(el('path', { d, fill: 'none', stroke: SURFACE, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }

  // Direct labels on the thickest living bands at the right edge
  const last = S.length - 1;
  let below = 0;
  for (let k = 0; k < n; k++) {
    const v = val(S[last], data.realms[k].id);
    const mid = below + v / 2;
    below += v;
    if (Y(below - v) - Y(below) < 13) continue;
    const t = el('text', { x: W - m.r - 4, y: Y(mid) + 3.5, 'text-anchor': 'end', fill: INK, 'font-size': 10.5, 'font-weight': 600 });
    t.textContent = shortName(data.realms[k].name);
    t.setAttribute('paint-order', 'stroke');
    t.setAttribute('stroke', SURFACE);
    t.setAttribute('stroke-width', '3');
    svg.append(t);
  }

  // The moments that shaped it, as glyphs along the top
  const marks: { x: number; m: Moment }[] = [];
  for (const mo of moments) {
    if (mo.tick < t0 || mo.tick > t1) continue;
    const x = X(mo.tick);
    const g = el('text', { x, y: 14, 'text-anchor': 'middle', 'font-size': 11, fill: INK_DIM });
    g.textContent = mo.glyph;
    svg.append(g);
    svg.append(el('line', { x1: x, x2: x, y1: 17, y2: m.t, stroke: GRID, 'stroke-width': 1 }));
    marks.push({ x, m: mo });
  }

  // Hover: crosshair + tooltip
  const cross = el('line', { y1: m.t, y2: m.t + ih, stroke: INK_DIM, 'stroke-width': 1, visibility: 'hidden' });
  svg.append(cross);
  const hit = el('rect', { x: m.l, y: 0, width: iw, height: m.t + ih, fill: 'transparent' });
  svg.append(hit);
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  root.style.position = 'relative';
  hit.addEventListener('mousemove', (ev: MouseEvent) => {
    const box = svg.getBoundingClientRect();
    const t = t0 + ((ev.clientX - box.left - m.l) / iw) * (t1 - t0);
    let i = 0, best = Infinity;
    for (let j = 0; j < S.length; j++) { const dd = Math.abs(S[j].tick - t); if (dd < best) { best = dd; i = j; } }
    const x = X(S[i].tick);
    cross.setAttribute('x1', String(x)); cross.setAttribute('x2', String(x));
    cross.setAttribute('visibility', 'visible');
    const rows = data.realms.map(r => ({ r, v: val(S[i], r.id) })).filter(o => o.v > 0).sort((a, b) => b.v - a.v);
    const near = marks.filter(k => Math.abs(k.x - x) < 6).slice(0, 3)
      .map(k => `<div class="tip-moment">${k.m.glyph} ${k.m.text.replace(/[<>&]/g, '')}</div>`).join('');
    tip.innerHTML = `<div class="tip-date">${formatDate(S[i].tick)}</div>` + near + rows.map(o =>
      `<div><span class="sw" style="background:${o.r.color}"></span>${shortName(o.r.name)} <b>${o.v.toLocaleString()}</b></div>`).join('');
    tip.hidden = false;
    tip.style.left = `${Math.min(x + 10, W - 150)}px`;
    tip.style.top = `${m.t}px`;
  });
  hit.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });

  root.append(svg, tip);

  // Legend: every realm that ever held anything
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = data.realms
    .filter(r => S.some(s => val(s, r.id) > 0))
    .map(r => `<span><span class="sw" style="background:${r.color}"></span>${shortName(r.name)}</span>`).join('');
  root.append(legend);
}
