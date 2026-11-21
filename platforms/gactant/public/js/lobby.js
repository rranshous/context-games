// The lobby. Most people arrive knowing nothing about ludants, so it talks about games,
// leads with a few good ones to play, and says only what's needed to start. People coming
// back find their own first. ("Ludant" is said once, in the intro: it's the name for what
// they are, not a word anyone needs to start.)

import { ago, hours, playLink, stat, thumb, treeLink } from './cards.js';
import { handOver, newRecovery } from './identity.js';
import { titled } from './names.js';
import { PadNav, Pads } from './pads.js';
import { api, askName, el, forget, mine, myName, recoveryDue, showRecovery } from './ui.js';
import { watchPage } from './telemetry.js';

watchPage('lobby');

const FEATURED = 6;
const POPULAR_FROM = 3;   // copies (and hours played, three each) before a game counts as popular

const costLine = (cost) => (cost ? `about $${cost.rate.toFixed(2)} an hour to play` : null);

/** How much it's been played: copies taken, and hours spent playing. */
const played = (p) => (p.copies ?? 0) + 3 * (p.cost?.hours ?? 0);

function pubCard(p, big = false, fresh = false) {
  const facts = [
    p.by ? `by ${p.by}` : null,
    fresh ? ago(p.at) : null,
    p.cost ? `played ${hours(p.cost.hours)}` : p.copies ? `${p.copies} ${p.copies === 1 ? 'player' : 'players'}` : 'new',
    costLine(p.cost),
  ].filter(Boolean).join(' · ');
  return el('a', { class: `card${big ? ' big' : ''}`, href: playLink(p) },
    thumb('p', p.id, titled(p.title) || p.name),
    el('div', { class: 'card-text' },
      el('strong', {}, titled(p.title) || p.name),
      p.note ? el('span', { class: 'card-note' }, p.note) : null,
      p.fromName ? el('span', { class: 'card-from' }, `based on ${p.fromName}`) : null,
      el('span', { class: 'card-facts' }, facts)));
}

/** A ludant this browser has sat with. If it has been shared, the card says so: copies
 *  follow it, and this is the one that goes on changing. */
function mineCard(l, pubs = []) {
  const from = l.lineage?.from ? `your copy of ${l.lineage.from.name}${l.following ? ', following it' : ', your own version'}` : l.lineage?.seededBy ? `seeded by ${l.lineage.seededBy}` : 'seeded here';
  const latest = pubs.at(-1);
  const players = pubs.reduce((n, p) => n + (p.copies ?? 0), 0);
  const published = latest ? `shared${pubs.length > 1 ? `, version ${latest.version ?? pubs.length}` : ''} · ${players} ${players === 1 ? 'player' : 'players'}` : null;
  return el('a', { class: 'card', href: `/frame.html?l=${l.id}` },
    thumb('l', l.id, l.name),
    el('div', { class: 'card-text' },
      el('strong', {}, l.name),
      published ? el('span', { class: 'card-published' }, published) : null,
      el('span', { class: 'card-facts' }, [from, l.updated ? `changed ${ago(l.updated)}` : null, l.spent >= 0.01 ? `$${l.spent.toFixed(2)} of thinking so far` : null].filter(Boolean).join(' · '))));
}

/** The games you shape: the ones you started, and copies you've made your own. (A copy
 *  that's still following someone's game is theirs to shape; its card in the lobby opens
 *  it.) Under each one you've shared, who follows it and its spin-offs, each a way into
 *  its tree. */
function yourGames(yours) {
  const row = (l) => {
    const s = l.shared;
    const where = !s ? 'not shared yet' : `${s.public ? 'in the lobby' : 'shared by link'}${s.versions > 1 ? `, version ${s.versions}` : ''}`;
    return el('li', { class: 'yours' },
      el('a', { class: 'yours-row', href: `/frame.html?l=${l.id}` },
        thumb('l', l.id, l.name),
        el('div', { class: 'yours-text' },
          el('strong', {}, l.name),
          l.lineage?.from ? el('span', { class: 'card-from' }, `based on ${l.lineage.from.name}`) : null,
          el('span', { class: `yours-where${s ? ' shared' : ''}` }, where),
          el('span', { class: 'card-facts' }, [l.updated ? `changed ${ago(l.updated)}` : null, l.spent >= 0.01 ? `$${l.spent.toFixed(2)} of thinking so far` : null].filter(Boolean).join(' · ')))),
      s ? el('div', { class: 'stats' },
        stat(s.followers, 'following', 'following', treeLink(s.line, 'following')),
        stat(s.spinoffs, 'spin-off', 'spin-offs', treeLink(s.line, 'spinoffs'))) : null);
  };
  return el('ul', { class: 'yours-list' }, ...yours.map(row));
}

const section = (title, hint, ...body) => el('section', { class: 'lobby-section' },
  el('h2', {}, title), hint ? el('p', { class: 'hint' }, hint) : null, ...body);

async function seed() {
  const by = await askName('A new game starts as a pulsing dot and becomes whatever the two of you make. It will know you by this name.');
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

  // For someone coming back, "new" means not theirs: not their own ludants' publications.
  // (Games they follow stay: a game's card is the way back to their copy of it.)
  const mineLines = new Set(yours.filter((l) => l.line).map((l) => l.line));
  const pubsOf = (l) => (l.line ? published.filter((p) => p.line === l.line) : []).sort((a, b) => a.at.localeCompare(b.at));
  const returning = yours.length > 0;
  const shaping = yours.filter((l) => !l.following);
  // The front rows are the same for everyone, your own included, so the page you'd point
  // someone to is the page they'll see: only publications that passed the publish check
  // with no open report (or a person cleared). New is the latest snapshot of each ludant,
  // newest first. Popular is the most played of the rest, leaving out, for someone back,
  // the ones they shape.
  const trusted = published.filter((p) => p.trusted);
  const latest = new Map();
  for (const p of trusted) if (!latest.has(p.line) || p.at > latest.get(p.line).at) latest.set(p.line, p);
  const fresh = [...latest.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEATURED);
  const inFresh = new Set(fresh.map((p) => p.id));
  const popular = trusted.filter((p) => !inFresh.has(p.id) && played(p) >= POPULAR_FROM && !mineLines.has(p.line))
    .sort((a, b) => played(b) - played(a)).slice(0, FEATURED);
  const parts = [];

  // Making one is half of what this is, so it's up top for everyone, beside playing.
  parts.push(el('section', { class: 'make-banner' },
    el('span', { class: 'make-dot', 'aria-hidden': 'true' }),
    el('div', { class: 'make-text' },
      el('strong', {}, 'Make your own game.'),
      el('span', {}, ' It begins as a pulsing dot. Tell it what you\'d like to play, and it builds itself into that.')),
    el('button', { class: 'seed-btn make-go', onclick: seed }, 'start a new game →')));

  // The explanation stays until someone has made a ludant of their own: a copy or two
  // doesn't mean they've got what this is.
  const maker = yours.some((l) => !l.lineage?.from);
  if (!maker) {
    const step = (n, title, text) => el('li', { class: 'step' }, el('span', { class: 'step-n' }, n), el('strong', {}, title), el('span', {}, text));
    // A change like any player could ask for: what was asked, and the game before and after.
    // (Shown the way people expect it to go, plain to painted; the two pictures are real
    // Little Catch, though the real change went the other way.)
    const demo = el('figure', { class: 'demo' },
      el('div', { class: 'demo-screen' },
        el('img', { class: 'demo-before', src: '/img/demo-plain.jpg', alt: 'Little Catch: a fishing boat on a night sea under a full moon, with fish glowing cyan, gold and magenta, drawn in simple shapes' }),
        el('img', { class: 'demo-after', src: '/img/demo-painted.jpg', alt: 'The same game after: the sea painted like a Japanese woodblock print, with a wave curling over the boat and painted purple fish' }),
        el('div', { class: 'demo-ask' }, el('span', {}, 'a player, in the chat'), 'paint it like an old Japanese woodblock print of the sea'),
        el('span', { class: 'demo-tag before' }, 'before'), el('span', { class: 'demo-tag after' }, 'after')),
      el('figcaption', {}, 'One sentence in the chat, and Little Catch painted itself new art and rebuilt its look. ', el('a', { href: '/how.html' }, 'How it works')));
    parts.push(el('section', { class: 'intro' },
      el('div', { class: 'intro-top' },
        el('div', {},
          el('h1', {}, 'Games that are alive.'),
          el('p', { class: 'intro-lead' }, 'Every game here is also an AI, called a ludant. While you play one, you can tell it what you\'d change, and it rewrites itself, right there.')),
        demo),
      el('ol', { class: 'steps' },
        step('1', 'Play one', 'Pick any game below. You get your own copy, so play it however you like.'),
        step('2', 'Tell it what you\'d change', '"Make the fish faster." "Add a second player." "Make it spooky." Say it in its chat.'),
        step('3', 'Watch it change', 'It rebuilds itself while you play, and paints its own pictures when it needs them: characters, backgrounds, a whole new style. Like what it became? Share it, and others can play it too.')),
      el('p', { class: 'intro-fine' }, 'You can play without an account. For a game to talk with you and change, connect your own OpenRouter account: it thinks with an AI model there, usually a few cents at a time, and a meter shows what your sitting has cost.')));
  }
  // Someone made here without seeing a recovery code (ui.js): now that they have ludants,
  // a way back to them, offered rather than forced.
  if (returning && recoveryDue()) {
    const box = el('section', { class: 'keep-box' },
      el('p', {}, el('strong', {}, 'Keep a way back to your games. '), 'They\'re tied to this browser. A recovery code gets them back if you lose it or clear it, and lets you add your other devices.'),
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
  if (shaping.length) parts.push(section('Your games', 'The ones you shape: the games you started, and copies you\'ve made your own.', yourGames(shaping)));
  if (fresh.length) {
    parts.push(section('New', 'Just shared, newest first.',
      el('div', { class: 'cards-grid' }, ...fresh.map((p) => pubCard(p, !returning, true)))));
  }
  if (popular.length) {
    parts.push(section('Popular', 'The most played.', el('div', { class: 'cards-grid' }, ...popular.map((p) => pubCard(p, !returning)))));
  }
  if (everyone.length) {
    parts.push(section('Everyone here', 'Every game on this install (you\'re running it yourself, so you see them all).',
      el('div', { class: 'cards-row' }, ...everyone.map((l) => mineCard(l, pubsOf(l))))));
  }
  parts.push(el('footer', { class: 'lobby-foot' }, el('a', { href: '/how.html' }, 'how it works'), ' · ', el('a', { href: '/rules.html' }, 'the rules'), ' · ', el('a', { href: '/privacy.html' }, 'privacy'), ' · ', el('a', { href: '/terms.html' }, 'terms'), ' · ', el('a', { href: 'mailto:admin@gactant.com' }, 'admin@gactant.com'), ' · see something that doesn\'t belong? press ⚑ in its top bar'));
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
// A recovery code from before codes were checked by proof doesn't work any more: once a
// sitting, ask whether theirs is one, and if so, offer a new one like any due code.
try {
  if (myName() && !recoveryDue() && !sessionStorage.getItem('gactant-recovery-checked')) {
    sessionStorage.setItem('gactant-recovery-checked', '1');
    mine('me').then((me) => { if (me.recoveryStale) { recoveryDue(true); render().catch(() => {}); } }).catch(() => {});
  }
} catch {}
