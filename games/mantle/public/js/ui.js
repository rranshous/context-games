// What the pages share: making elements, a unit's sheet (its stats, abilities and price,
// as shown on the bench and in briefings), and the tips that say what things are.

import { AIDS } from './aids.js';
import { cutout } from './cutout.js';
import { icon } from './icons.js';
import { SIZES, STATS, price } from './spec.js';

export const $ = (id) => document.getElementById(id);
export const el = (tag, { dataset, ...props } = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); Object.assign(e.dataset, dataset); e.append(...kids.filter((k) => k != null && k !== false)); return e; };
export const remember = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
export const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const sentence = (s) => `${s[0].toUpperCase()}${s.slice(1)}.`;

/** An ability, marked as one: hover (or tap) it to hear what it does, and on a unit, what it adds to the cost. */
export const ability = (x, cost) => el('span', { className: 'ability', tabIndex: 0, dataset: { tip: x.word, about: sentence(x.about), ...(cost != null ? { cost: `Adds ${cost} to this unit's cost.` } : {}) } },
  el('i', { className: 'mark', ariaHidden: 'true' }), x.word);

/** A unit's picture, cut out of its background, in a frame (`.pic`). A picture that can't
 *  load (gone, or never drawn) shows the mark of an unknown unit instead of nothing. */
export function picture(url, className = 'pic') {
  const frame = el('span', { className });
  const missing = () => frame.replaceChildren(el('span', { className: 'unknown', title: 'no likeness' }, icon('unknown')));
  if (!url) missing();
  else cutout(url).then((src) => frame.replaceChildren(el('img', { src, alt: '' }))).catch(missing);
  return frame;
}

export const rating = (r) => el('span', { className: 'bar' }, ...Array.from({ length: 10 }, (_, i) => el('i', { className: i < r ? 'on' : '' })));

/** A design's price, worked out now: the contract can change, and a kept design's saved price with it. */
export const priced = (d) => price(d.spec, d.aid);

/** A unit's sheet: what it costs, its size, its stats, its abilities, and where the cost comes from. */
export function sheet(d, { compact = false } = {}) {
  const p = priced(d), a = AIDS[d.aid], spec = d.spec;
  return [
    el('div', { className: 'facts' },
      el('div', {}, el('b', {}, icon('matter'), p.cost), el('span', { textContent: 'cost' })),
      el('div', {}, el('b', {}, icon('army'), p.supply), el('span', { textContent: 'room in the army' })),
      el('div', {}, el('b', {}, icon('time'), `${p.seconds}s`), el('span', { textContent: `to ${a.makes === 'grows' ? 'grow' : 'build'}` })),
    ),
    el('p', { className: 'size', textContent: SIZES[spec.size - 1] }),
    el('table', {}, ...Object.entries(STATS).map(([s, { word, about }]) => el('tr', {},
      el('th', { textContent: word, dataset: { tip: word, about: sentence(about) } }), el('td', {}, rating(spec.stats[s])), el('td', { className: 'n', textContent: spec.stats[s] })))),
    el('div', { className: 'abilities' }, el('h4', { textContent: 'Abilities' }),
      ...(spec.abilities.length ? spec.abilities.map((x) => ability(a.abilities[x], p.lines.find((l) => l.what === a.abilities[x].word)?.cost)) : [el('em', { textContent: 'none' })])),
    !compact && el('details', {}, el('summary', { textContent: 'where the cost comes from' }),
      el('table', { className: 'price' }, ...p.lines.map((l) => el('tr', {}, el('th', { textContent: l.what }), el('td', { className: 'n', textContent: l.cost }))))),
  ].filter(Boolean);
}

// ---------- what things are, on hover or tap ----------

const tip = el('div', { id: 'tip', hidden: true });
document.body.append(tip);
function showTip(target) {
  const { tip: title, about, cost } = target.dataset;
  tip.replaceChildren(el('strong', { textContent: title }), el('p', { textContent: about }), ...(cost ? [el('p', { className: 'cost', textContent: cost })] : []));
  tip.hidden = false;
  const r = target.getBoundingClientRect(), t = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
  const top = r.top - t.height - 8 > 8 ? r.top - t.height - 8 : r.bottom + 8;
  Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
}
for (const kind of ['mouseover', 'focusin']) document.addEventListener(kind, (e) => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
for (const kind of ['mouseout', 'focusout']) document.addEventListener(kind, (e) => { if (e.target.closest?.('[data-tip]')) tip.hidden = true; });
