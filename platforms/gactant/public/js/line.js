// A shared game's tree: what it's based on, who follows it (and how each version has been
// played), and its spin-offs: copies people made their own. The spin-offs shared in the
// lobby are cards that open their own tree, so the tree can be walked down (and, by "based
// on", back up); the rest are private, so they're only counted.
//   line.html?id=<line>#following | #spinoffs

import { ago, hours, playLink, stat, thumb, treeLink } from './cards.js';
import { PadNav, Pads } from './pads.js';
import { watchPage } from './telemetry.js';
import { api, el } from './ui.js';

watchPage('line');
new PadNav(new Pads(), { scope: () => document.body });
const root = document.getElementById('tree');
const id = new URLSearchParams(location.search).get('id');

const section = (anchor, title, hint, ...body) => el('section', { class: 'lobby-section', id: anchor },
  el('h2', {}, title), hint ? el('p', { class: 'hint' }, hint) : null, ...body);

/** A spin-off, or what it's based on: a card into its own tree. */
const branch = (b) => el('a', { class: 'card', href: treeLink(b.line) },
  thumb(null, b.picture, b.title),
  el('div', { class: 'card-text' },
    el('strong', {}, b.title),
    el('span', { class: 'card-facts' }, [b.by ? `by ${b.by}` : null, ago(b.at)].filter(Boolean).join(' · ')),
    el('span', { class: 'card-facts' }, `${b.followers} following · ${b.spinoffs} ${b.spinoffs === 1 ? 'spin-off' : 'spin-offs'}`)));

async function render() {
  const t = await api('GET', `lines/${id}/tree`);
  document.title = `gactant · ${t.title}`;
  const players = t.versions.reduce((n, v) => n + v.players, 0);
  const played = t.versions.reduce((n, v) => n + v.hours, 0);
  const { listed, unlisted } = t.spinoffs;

  root.replaceChildren(
    el('section', { class: 'tree-head' },
      thumb(null, t.picture, t.title),
      el('div', { class: 'tree-text' },
        el('h1', {}, t.title),
        t.latest?.by ? el('span', { class: 'card-facts' }, `by ${t.latest.by}`) : null,
        t.from ? el('span', { class: 'card-from' }, 'based on ',
          t.from.line ? el('a', { href: treeLink(t.from.line) }, t.from.title) : t.from.title) : null,
        t.note ? el('p', { class: 'card-note' }, t.note) : null,
        el('div', { class: 'stats' },
          stat(t.followers, 'following', 'following', '#following'),
          stat(listed.length + unlisted, 'spin-off', 'spin-offs', '#spinoffs')),
        el('a', { class: 'seed-btn', href: playLink({ line: t.id }) }, 'play it →'))),

    section('following', 'Following',
      `${t.followers === 1 ? 'One copy follows' : `${t.followers} copies follow`} this game: each takes its updates as it's opened.${players ? ` ${players} ${players === 1 ? 'copy has' : 'copies have'} been taken${played ? `, and played ${hours(played)} in all` : ''}.` : ''}`,
      t.versions.length > 1 || players ? el('div', { class: 'versions-wrap' }, el('table', { class: 'versions' },
        el('thead', {}, el('tr', {}, el('th', {}, 'version'), el('th', {}, 'shared'), el('th', {}, 'copies taken'), el('th', {}, 'played'), el('th', {}, 'note'))),
        el('tbody', {}, ...t.versions.slice().reverse().map((v) => el('tr', {},
          el('td', {}, String(v.version)), el('td', {}, ago(v.at)), el('td', {}, String(v.players)),
          el('td', {}, v.hours ? hours(v.hours) : '—'), el('td', {}, v.note ?? '')))))) : null),

    section('spinoffs', 'Spin-offs',
      listed.length + unlisted
        ? `Copies people changed into their own version.${unlisted ? ` ${unlisted} ${unlisted === 1 ? 'is' : 'are'} kept private${listed.length ? '; the rest are shared, and each has a tree of its own' : ''}.` : ' Each has a tree of its own.'}`
        : 'Copies people change into their own version show up here. None yet.',
      listed.length ? el('div', { class: 'cards-grid' }, ...listed.map(branch)) : null),
  );
  // Arriving from a count (#following, #spinoffs): its part, once it's drawn.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

if (!id) root.replaceChildren(el('p', {}, 'Which game? This page needs a link from a game\'s counts.'));
else render().catch((err) => root.replaceChildren(el('p', {}, `couldn't load this game: ${err.message}`)));
