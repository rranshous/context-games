// The lobby. Most people arrive knowing nothing about ludants, so it leads with a few
// good ones to play, and says only what's needed to start. People coming back find
// their own ludants first. Everything published is further down, as family trees, and
// starting from nothing is last.

import { PadNav, Pads } from './pads.js';
import { api, askName, el, mine, myName } from './ui.js';

const FEATURED = 6;

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 2 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`);
const costLine = (cost) => (cost ? `about $${cost.rate.toFixed(2)} an hour to play` : null);

/** What's worth trying first: played and copied the most, with a little room for the new. */
function score(p) {
  const days = (Date.now() - new Date(p.at).getTime()) / 86400000;
  return (p.copies ?? 0) + 3 * (p.cost?.hours ?? 0) + Math.max(0, 2 - days / 3);
}

/** A picture of its stage, fetched when it scrolls near, or a placeholder in the meantime. */
function thumb(kind, id, name) {
  const box = el('div', { class: 'thumb' }, el('span', { class: 'thumb-name' }, name));
  new IntersectionObserver(async ([e], obs) => {
    if (!e.isIntersecting) return;
    obs.disconnect();
    try {
      const { image } = await api('GET', `thumbs/${kind}/${id}`);
      if (image) box.replaceChildren(el('img', { src: image, alt: `${name}, as it looks` }));
    } catch {}
  }, { rootMargin: '200px' }).observe(box);
  return box;
}

function pubCard(p, big = false) {
  const facts = [
    p.by ? `by ${p.by}` : null,
    p.cost ? `played ${hours(p.cost.hours)}` : p.copies ? `${p.copies} ${p.copies === 1 ? 'player' : 'players'}` : 'new',
    costLine(p.cost),
  ].filter(Boolean).join(' · ');
  return el('a', { class: `card${big ? ' big' : ''}`, href: `/play.html?p=${p.id}` },
    thumb('p', p.id, p.title || p.name),
    el('div', { class: 'card-text' },
      el('strong', {}, p.title || p.name),
      el('span', { class: 'card-given' }, p.name),
      p.note ? el('span', { class: 'card-note' }, p.note) : null,
      el('span', { class: 'card-facts' }, facts)));
}

function mineCard(l) {
  const from = l.lineage?.from ? `your copy of ${l.lineage.from.name}` : l.lineage?.seededBy ? `seeded by ${l.lineage.seededBy}` : 'seeded here';
  return el('a', { class: 'card', href: `/frame.html?l=${l.id}` },
    thumb('l', l.id, l.name),
    el('div', { class: 'card-text' },
      el('strong', {}, l.name),
      el('span', { class: 'card-facts' }, [from, l.updated ? `changed ${ago(l.updated)}` : null, costLine(l.cost)].filter(Boolean).join(' · '))));
}

/** Publications grouped by family (given name), as trees. A publication's parent is the
 *  one before it from the same ludant ("then") or, failing that, the publication it was
 *  copied from ("copy"). */
function families(published) {
  const byTime = published.slice().sort((x, y) => x.at.localeCompare(y.at));
  const parent = new Map();
  for (const p of byTime) {
    const earlier = byTime.filter((q) => q.ludant === p.ludant && q.at < p.at).at(-1);
    if (earlier) parent.set(p.id, { id: earlier.id, how: 'then' });
    else if (p.from && published.some((q) => q.id === p.from)) parent.set(p.id, { id: p.from, how: 'copy' });
  }
  const children = (id) => byTime.filter((p) => parent.get(p.id)?.id === id);
  const node = (p) => {
    const how = parent.get(p.id)?.how;
    const kids = children(p.id);
    return el('li', { class: 'tree-node' },
      el('a', { class: 'tree-card', href: `/play.html?p=${p.id}` },
        how ? el('span', { class: `tree-how ${how}` }, how === 'then' ? 'then' : `copy, changed by ${p.by ?? 'someone'}`) : null,
        el('strong', {}, p.name),
        el('span', {}, [p.by ? `by ${p.by}` : null, `${p.copies} ${p.copies === 1 ? 'copy' : 'copies'}`, costLine(p.cost), ago(p.at)].filter(Boolean).join(' · ')),
        p.note ? el('span', { class: 'pub-note' }, `“${p.note}”`) : null),
      kids.length ? el('ul', { class: 'tree' }, ...kids.map(node)) : null);
  };
  const groups = new Map();
  for (const p of byTime) if (!parent.has(p.id)) groups.set(p.given, [...(groups.get(p.given) ?? []), p]);
  return [...groups].reverse().map(([given, roots]) => el('li', { class: 'family' },
    el('div', { class: 'family-name' }, `the ${given} family`),
    el('ul', { class: 'tree root' }, ...roots.map(node))));
}

const section = (title, hint, ...body) => el('section', { class: 'lobby-section' },
  el('h2', {}, title), hint ? el('p', { class: 'hint' }, hint) : null, ...body);

async function seed() {
  const by = await askName('A new ludant starts as a pulsing dot and becomes whatever the two of you make. It will know you by this name.');
  const { id } = await api('POST', 'ludants', { by });
  location.href = `/frame.html?l=${id}`;
}

async function render() {
  const ids = mine().map((m) => m.id);
  const [config, published, yours] = await Promise.all([
    api('GET', 'config'),
    api('GET', 'published'),
    ids.length ? api('GET', `ludants?ids=${ids.join(',')}`) : Promise.resolve([]),
  ]);
  // A local install can also show every ludant here, for the person running it.
  const everyone = config.public ? [] : await api('GET', 'ludants');
  const order = new Map(ids.map((id, i) => [id, i]));
  yours.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

  // For someone coming back, "new" means ones they don't already have a copy of.
  const have = new Set(yours.map((l) => l.lineage?.from?.published).filter(Boolean));
  const featured = published.filter((p) => !have.has(p.id)).sort((a, b) => score(b) - score(a)).slice(0, FEATURED);
  const parts = [];
  const returning = yours.length > 0;

  if (!returning) {
    parts.push(el('section', { class: 'intro' },
      el('h1', {}, 'Pick a game and play it. Then tell it what you\'d change.'),
      el('p', {}, 'These are ludants: games that are also AIs. A ludant can change itself while you play it: faster, stranger, kinder to your little brother. Each one you play is your own copy, and you can share what it becomes.')));
  }
  if (returning) parts.push(section('Your ludants', null, el('div', { class: 'cards-row' }, ...yours.slice(0, 8).map(mineCard))));
  if (featured.length) {
    parts.push(section(returning ? 'Play something new' : 'Jump in', returning ? null : 'Click one to play. Ludants think with an AI model, whenever their own body decides to. That costs a few cents at a time, on your own OpenRouter account, and a meter shows what your sitting has cost.',
      el('div', { class: 'cards-grid' }, ...featured.map((p) => pubCard(p, !returning)))));
  }
  if (published.length > featured.length || returning) {
    parts.push(section('Every published ludant', 'Ludants are published by whoever plays them. A copy that changes can be published again, so they grow into families.',
      el('ul', { class: 'trees' }, ...families(published))));
  }
  parts.push(section('Start from nothing', 'Seed a new ludant: it begins as a pulsing dot with no game at all, and becomes whatever you make together.',
    el('button', { class: 'seed-btn', onclick: seed }, 'seed a new ludant')));
  if (everyone.length) {
    parts.push(section('Everyone here', 'Every ludant on this install (you\'re running it yourself, so you see them all).',
      el('div', { class: 'cards-row' }, ...everyone.map(mineCard))));
  }
  document.getElementById('lobby').replaceChildren(...parts);
}

function renderMe() {
  const name = myName();
  const span = document.getElementById('me');
  if (!name) { span.replaceChildren(); return; }
  span.replaceChildren('you\'re ', el('button', { class: 'me-name', title: 'change your name', onclick: () => {
    const next = prompt('What should ludants call you?', name)?.trim();
    if (next) { try { localStorage.setItem('gactant-name', next); } catch {} renderMe(); }
  } }, name));
}

// A controller moves between the cards (and through any question on top).
const pads = new Pads();
new PadNav(pads, { scope: () => document.querySelector('.cover') ?? document.body });
// On Xbox, Edge gives pages the controller only in its controller mode; until a
// controller shows up here, say how.
const tip = el('p', { class: 'lobby-tip' }, 'Playing with a controller on an Xbox? Turn on controller mode in Edge\'s menu, or the controller only moves a pointer.');
if (navigator.getGamepads) {
  document.querySelector('.top').after(el('div', { class: 'tip-bar' }, tip));
  pads.on(() => { tip.parentElement?.remove(); });
}

renderMe();
render().catch((err) => document.getElementById('lobby').replaceChildren(el('p', { class: 'boot-fault' }, `couldn't load the lobby: ${err.message}`)));
