// The lobby. Most people arrive knowing nothing about ludants, so it leads with a few
// good ones to play, and says only what's needed to start. People coming back find
// their own ludants first. Everything published is further down, as family trees, and
// starting from nothing is last.

import { handOver, newRecovery } from './identity.js';
import { titled } from './names.js';
import { PadNav, Pads } from './pads.js';
import { api, askName, el, forget, mine, myName, recoveryDue, showRecovery } from './ui.js';
import { watchPage } from './telemetry.js';

watchPage('lobby');

const FEATURED = 6;
const POPULAR_FROM = 3;   // copies (and hours played, three each) before a game counts as popular

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 2 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`);
const costLine = (cost) => (cost ? `about $${cost.rate.toFixed(2)} an hour to play` : null);

/** What's worth trying first: played and copied the most, with a little room for the new. */
/** How much it's been played: copies taken, and hours spent playing. */
const played = (p) => (p.copies ?? 0) + 3 * (p.cost?.hours ?? 0);

/** A picture of its stage, fetched when it scrolls near, or a placeholder in the meantime. */
function thumb(kind, id, name) {
  // Until its picture comes (or if it has none), a colour of its own, from its name.
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const box = el('div', { class: 'thumb', style: `--hue: ${h}` }, el('span', { class: 'thumb-name' }, String(name).trim()[0]?.toUpperCase() ?? ''));
  new IntersectionObserver(async ([e], obs) => {
    if (!e.isIntersecting) return;
    obs.disconnect();
    try {
      const { url } = await api('GET', `thumbs/${kind}/${id}`);
      if (url) box.replaceChildren(el('img', { src: url, alt: `${name}, as it looks` }));
    } catch {}
  }, { rootMargin: '200px' }).observe(box);
  return box;
}

function pubCard(p, big = false, fresh = false) {
  const facts = [
    p.by ? `by ${p.by}` : null,
    fresh ? ago(p.at) : null,
    p.cost ? `played ${hours(p.cost.hours)}` : p.copies ? `${p.copies} ${p.copies === 1 ? 'player' : 'players'}` : 'new',
    costLine(p.cost),
  ].filter(Boolean).join(' · ');
  return el('a', { class: `card${big ? ' big' : ''}`, href: `/play.html?p=${p.id}` },
    thumb('p', p.id, titled(p.title) || p.name),
    el('div', { class: 'card-text' },
      el('strong', {}, titled(p.title) || p.name),
      p.note ? el('span', { class: 'card-note' }, p.note) : null,
      el('span', { class: 'card-facts' }, facts)));
}

/** A ludant this browser has sat with. If it has been published, the card says so: the
 *  publication is a snapshot others play, and this is the one that goes on changing. */
function mineCard(l, pubs = []) {
  const from = l.lineage?.from ? `your copy of ${l.lineage.from.name}` : l.lineage?.seededBy ? `seeded by ${l.lineage.seededBy}` : 'seeded here';
  const latest = pubs.at(-1);
  const players = pubs.reduce((n, p) => n + (p.copies ?? 0), 0);
  const published = latest ? `published as ${latest.name}${pubs.length > 1 ? ` (and ${pubs.length - 1} earlier)` : ''} · ${players} ${players === 1 ? 'player' : 'players'}` : null;
  return el('a', { class: 'card', href: `/frame.html?l=${l.id}` },
    thumb('l', l.id, l.name),
    el('div', { class: 'card-text' },
      el('strong', {}, l.name),
      published ? el('span', { class: 'card-published' }, published) : null,
      el('span', { class: 'card-facts' }, [from, l.updated ? `changed ${ago(l.updated)}` : null, l.spent >= 0.01 ? `$${l.spent.toFixed(2)} of thinking so far` : null].filter(Boolean).join(' · '))));
}

/** Publications grouped by family (given name), as trees. A publication's parent is the
 *  one before it from the same ludant ("then") or, failing that, the publication it was
 *  copied from ("copy"). */
function families(published, yours = new Set()) {
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
        el('strong', {}, titled(p.title) || p.name, yours.has(p.ludant) ? el('span', { class: 'yours' }, ' yours') : null),
        el('span', {}, [p.by ? `by ${p.by}` : null, `${p.copies} ${p.copies === 1 ? 'copy' : 'copies'}`, costLine(p.cost), ago(p.at)].filter(Boolean).join(' · ')),
        p.note ? el('span', { class: 'pub-note' }, `“${p.note}”`) : null),
      kids.length ? el('ul', { class: 'tree' }, ...kids.map(node)) : null);
  };
  const groups = new Map();
  for (const p of byTime) if (!parent.has(p.id)) groups.set(p.given, [...(groups.get(p.given) ?? []), p]);
  return [...groups].reverse().map(([given, roots]) => el('li', { class: 'family' },
    el('div', { class: 'family-name' }, `${given}'s family`),
    el('ul', { class: 'tree root' }, ...roots.map(node))));
}

/** Your ludants as family trees, so what's what is visible: the ludant you shape at the
 *  root, the snapshots it was published as beneath it, and any copy you took under the
 *  publication it came from. A copy of someone else's publication is rooted at theirs. */
function yourTrees(yours, published) {
  const mineIds = new Set(yours.map((l) => l.id));
  const pubById = new Map(published.map((p) => [p.id, p]));
  const byTime = (a, b) => (a.at ?? a.updated ?? '').localeCompare(b.at ?? b.updated ?? '');
  const copiesOf = (pubId) => yours.filter((l) => l.lineage?.from?.published === pubId);
  const pubsOf = (ludantId) => published.filter((p) => p.ludant === ludantId).sort(byTime);

  const row = (kind, href, thumbKind, id, name, tag, facts, kids = []) => el('li', { class: 'ytree-node' },
    el('a', { class: `ytree-row ${kind}`, href },
      thumb(thumbKind, id, name),
      el('div', { class: 'ytree-text' },
        el('strong', {}, name),
        el('span', { class: `ytree-tag ${kind}` }, tag),
        facts ? el('span', { class: 'card-facts' }, facts) : null)),
    kids.length ? el('ul', { class: 'ytree' }, ...kids) : null);

  const ludantNode = (l, tag) => row(l.lineage?.from ? 'copy' : 'mine', `/frame.html?l=${l.id}`, 'l', l.id, l.name, tag,
    [l.updated ? `changed ${ago(l.updated)}` : null, l.spent >= 0.01 ? `$${l.spent.toFixed(2)} of thinking so far` : null].filter(Boolean).join(' · '),
    pubsOf(l.id).map(pubNode));
  const pubNode = (p) => row('pub', `/play.html?p=${p.id}`, 'p', p.id, p.name,
    mineIds.has(p.ludant) ? 'published: a snapshot others play' : `published by ${p.by ?? 'someone'}`,
    [`${p.copies} ${p.copies === 1 ? 'player' : 'players'}`, costLine(p.cost), ago(p.at)].filter(Boolean).join(' · '),
    copiesOf(p.id).map((c) => ludantNode(c, 'your copy: the one you play')));

  // Roots: ludants of yours that aren't copies of a publication shown under one of yours,
  // and the publications (someone else's) that your copies came from.
  const roots = [];
  for (const l of yours.slice().sort(byTime)) {
    const from = l.lineage?.from?.published, pub = from && pubById.get(from);
    if (!from) roots.push(ludantNode(l, 'yours: you\'re shaping this'));
    else if (!pub) roots.push(ludantNode(l, `your copy of ${l.lineage.from.name}`));
    else if (!mineIds.has(pub.ludant) && !roots.some((r) => r.dataset?.pub === from)) {
      const node = pubNode(pub);
      node.dataset.pub = from;
      roots.push(node);
    }
  }
  return el('div', { class: 'ytrees' }, ...roots.map((r) => el('ul', { class: 'ytree root' }, r)));
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
    // Every one this browser's person owns, from any device.
    api('GET', 'ludants?mine=1'),
  ]);
  // A local install can also show every ludant here, for the person running it.
  const everyone = config.public ? [] : await api('GET', 'ludants');
  // Ones that aren't theirs (gone, or someone else's) quietly leave this browser's list; it
  // only orders them, most recently sat with first.
  for (const id of ids) if (!yours.some((l) => l.id === id)) forget(id);
  for (const l of yours) if (!ids.includes(l.id)) ids.push(l.id);
  const order = new Map(ids.map((id, i) => [id, i]));
  yours.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

  // For someone coming back, "new" means not theirs: not ones they have a copy of, and not
  // their own ludants' publications.
  const have = new Set(yours.map((l) => l.lineage?.from?.published).filter(Boolean));
  const mineIds = new Set(yours.map((l) => l.id));
  const pubsOf = (id) => published.filter((p) => p.ludant === id).sort((a, b) => a.at.localeCompare(b.at));
  const returning = yours.length > 0;
  // The front rows are the same for everyone, your own included, so the page you'd point
  // someone to is the page they'll see: only publications that passed the publish check
  // with no open report (or a person cleared). New is the latest snapshot of each ludant,
  // newest first. Popular is the most played of the rest, leaving out, for someone back,
  // what they already have.
  const trusted = published.filter((p) => p.trusted);
  const latest = new Map();
  for (const p of trusted) if (!latest.has(p.ludant) || p.at > latest.get(p.ludant).at) latest.set(p.ludant, p);
  const fresh = [...latest.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEATURED);
  const inFresh = new Set(fresh.map((p) => p.id));
  const popular = trusted.filter((p) => !inFresh.has(p.id) && played(p) >= POPULAR_FROM && !have.has(p.id) && !mineIds.has(p.ludant))
    .sort((a, b) => played(b) - played(a)).slice(0, FEATURED);
  const parts = [];

  // Making one is half of what this is, so it's up top for everyone, beside playing.
  parts.push(el('section', { class: 'make-banner' },
    el('span', { class: 'make-dot', 'aria-hidden': 'true' }),
    el('div', { class: 'make-text' },
      el('strong', {}, 'Make your own game.'),
      el('span', {}, ' A new ludant begins as a pulsing dot. Tell it what you\'d like to play, and it builds itself into that.')),
    el('button', { class: 'seed-btn make-go', onclick: seed }, 'seed a new ludant →')));

  // The explanation stays until someone has made a ludant of their own: a copy or two
  // doesn't mean they've got what this is.
  const maker = yours.some((l) => !l.lineage?.from);
  if (!maker) {
    const step = (n, title, text) => el('li', { class: 'step' }, el('span', { class: 'step-n' }, n), el('strong', {}, title), el('span', {}, text));
    // A real change, recorded: what was asked, and the game before and after.
    const demo = el('figure', { class: 'demo' },
      el('div', { class: 'demo-screen' },
        el('img', { class: 'demo-before', src: '/img/demo-before.jpg', alt: 'Little Catch: a fishing boat on a Hokusai-style day sea, with purple fish' }),
        el('img', { class: 'demo-after', src: '/img/demo-after.jpg', alt: 'The same game after: a night sea under a full moon, a lantern on the boat, and fish glowing cyan, gold and magenta' }),
        el('div', { class: 'demo-ask' }, el('span', {}, 'a player, in the chat'), 'make it a night sea under the moon, with fish that glow'),
        el('span', { class: 'demo-tag before' }, 'before'), el('span', { class: 'demo-tag after' }, 'after')),
      el('figcaption', {}, 'A real change: one sentence in the chat, and Little Catch rebuilt itself. It cost 19¢ in AI thinking.'));
    parts.push(el('section', { class: 'intro' },
      el('div', { class: 'intro-top' },
        el('div', {},
          el('h1', {}, 'Games that are alive.'),
          el('p', { class: 'intro-lead' }, 'Every game here is also an AI, called a ludant. While you play one, you can tell it what you\'d change, and it rewrites itself, right there.')),
        demo),
      el('ol', { class: 'steps' },
        step('1', 'Play one', 'Pick any game below. You get your own copy, so play it however you like.'),
        step('2', 'Tell it what you\'d change', '"Make the fish faster." "Add a second player." "Make it spooky." Say it in its chat.'),
        step('3', 'Watch it change', 'It rebuilds itself while you play. Like what it became? Publish it, and others can play it too.')),
      el('p', { class: 'intro-fine' }, 'You can play without an account. For a ludant to talk with you and change, connect your own OpenRouter account: it thinks with an AI model there, usually a few cents at a time, and a meter shows what your sitting has cost.')));
  }
  // Someone made here without seeing a recovery code (ui.js): now that they have ludants,
  // a way back to them, offered rather than forced.
  if (returning && recoveryDue()) {
    const box = el('section', { class: 'keep-box' },
      el('p', {}, el('strong', {}, 'Keep a way back to your ludants. '), 'They\'re tied to this browser. A recovery code gets them back if you lose it or clear it, and lets you add your other devices.'),
      el('button', { class: 'top-btn primary', onclick: async () => {
        try {
          const { recovery } = await newRecovery();
          const cover = el('div', { class: 'cover' });
          document.body.append(cover);
          showRecovery(cover, recovery, () => { cover.remove(); recoveryDue(false); box.remove(); }, true);
        } catch (err) { alert(`couldn't make one: ${err.message}`); }
      } }, 'make a recovery code'),
      el('button', { class: 'top-btn', onclick: () => box.remove() }, 'not now'));
    parts.push(box);
  }
  if (returning) parts.push(section('Your ludants', 'The ones you shape, what they were published as, and the copies you play.', yourTrees(yours, published)));
  if (fresh.length) {
    parts.push(section('New', 'Just published, newest first.',
      el('div', { class: 'cards-grid' }, ...fresh.map((p) => pubCard(p, !returning, true)))));
  }
  if (popular.length) {
    parts.push(section('Popular', 'The most played.', el('div', { class: 'cards-grid' }, ...popular.map((p) => pubCard(p, !returning)))));
  }
  if (published.length > fresh.length + popular.length || returning) {
    parts.push(section('Family trees', 'Anyone can change their copy of a ludant and publish what it became, so ludants grow into families. Here is every one, and where each came from.',
      el('ul', { class: 'trees' }, ...families(published, mineIds))));
  }
  if (everyone.length) {
    parts.push(section('Everyone here', 'Every ludant on this install (you\'re running it yourself, so you see them all).',
      el('div', { class: 'cards-row' }, ...everyone.map((l) => mineCard(l, pubsOf(l.id))))));
  }
  parts.push(el('footer', { class: 'lobby-foot' }, el('a', { href: '/rules.html' }, 'the rules'), ' · ', el('a', { href: '/privacy.html' }, 'privacy'), ' · see something that doesn\'t belong? press ⚑ in its top bar'));
  document.getElementById('lobby').replaceChildren(...parts);
}

function renderMe() {
  const name = myName();
  const span = document.getElementById('me');
  if (!name) { span.replaceChildren(); return; }
  span.replaceChildren('you\'re ', el('a', { class: 'me-name', href: '/me.html', title: 'your name and your devices' }, name));
}

// A controller moves between the cards (and through any question on top).
const pads = new Pads();
new PadNav(pads, { scope: () => document.querySelector('.cover') ?? document.body });
// On Xbox, Edge gives pages the controller only in its controller mode; until a
// controller shows up here, say how.
const tip = el('p', { class: 'lobby-tip' }, 'Playing with a controller on an Xbox? Turn on controller mode in Edge\'s menu, or the controller only moves a pointer.');
if (navigator.getGamepads && /xbox/i.test(navigator.userAgent)) {
  document.querySelector('.top').after(el('div', { class: 'tip-bar' }, tip));
  pads.on(() => { tip.parentElement?.remove(); });
}

renderMe();
// Another of this person's devices may be waiting for their key: hand it over.
handOver().catch(() => {});
render().catch((err) => document.getElementById('lobby').replaceChildren(el('p', { class: 'boot-fault' }, `couldn't load the lobby: ${err.message}`)));
