// The front: the maps, one after another, and the briefing for each. The briefing is a
// scouting report (the rival's units, priced like yours) and the roster you take in: up
// to five of your designs. Seeing what you face before you pick is the point: go back to
// the lab and design an answer.

import { AIDS } from './aids.js';
import { icon } from './icons.js';
import { LEVELS, RIVAL_UNITS, ROSTER_SIZE } from './levels.js';
import { startMatch } from './match.js';
import { $, ability, el, picture, priced, recall, remember, sheet } from './ui.js';

let ctx = null;   // { aidId, back, screen, designs, level }

const won = () => { try { return JSON.parse(recall('mantle-won') ?? '[]'); } catch { return []; } };
const open = (i) => i === 0 || won().includes(LEVELS[i - 1].id);
const picked = () => { try { return JSON.parse(recall(`mantle-roster-${ctx.aidId}`) ?? '[]'); } catch { return []; } };

export async function showWar(aidId, { back, screen }) {
  ctx = { aidId, back, screen, designs: (await fetch('/api/designs?by=me').then((r) => r.json())).filter((d) => d.aid === aidId) };
  $('to-lab').onclick = back;
  $('war-where').textContent = `${won().length} of ${LEVELS.length} maps taken`;
  const first = LEVELS.findIndex((l, i) => open(i) && !won().includes(l.id));
  showMaps(LEVELS[first < 0 ? 0 : first]);
}

function showMaps(level) {
  ctx.level = level;
  $('maps').replaceChildren(el('h3', { textContent: 'The campaign' }), ...LEVELS.map((l, i) => el('button', {
    className: `map plate${l === level ? ' on' : ''}${won().includes(l.id) ? ' won' : ''}`, disabled: !open(i),
    onclick: () => showMaps(l),
  }, el('span', { className: 'n', textContent: i + 1 }), el('strong', { textContent: l.name }),
  el('span', { textContent: won().includes(l.id) ? 'taken' : open(i) ? `held by ${l.holder}` : 'win the one before to open it' }))));
  showBrief(level);
}

function supplyLine(x) {
  return x < 0.85 ? 'thinner than yours' : x < 1.05 ? 'about as rich as yours' : x < 1.4 ? 'richer than yours' : 'much richer than yours';
}

function showBrief(level) {
  const r = level.rival;
  const harder = [
    `Their supply line runs ${supplyLine(r.income)}.`,
    r.start.length ? `They start with ${r.start.length} unit${r.start.length > 1 ? 's' : ''} already in the field.` : 'They start with nothing in the field, as you do.',
    `There are ${level.deposits.length} deposits to fight over.`,
    `Their first push comes at about ${Math.round(r.firstWave / 60 * 2) / 2} minutes${r.ambush ? ', and things lie in wait on the roads' : ''}.`,
  ];
  const mine = new Set(picked().filter((id) => ctx.designs.some((d) => d.id === id)));
  const a = AIDS[ctx.aidId];
  const cards = new Map();
  // Taking a unit changes its card and the muster, not the whole briefing.
  const update = () => {
    remember(`mantle-roster-${ctx.aidId}`, JSON.stringify([...mine]));
    for (const [id, card] of cards) setCard(card, { on: mine.has(id), full: !mine.has(id) && mine.size >= ROSTER_SIZE });
    showMuster(level, mine, toggle);
  };
  const toggle = (id) => {
    if (mine.has(id)) mine.delete(id); else if (mine.size < ROSTER_SIZE) mine.add(id);
    update();
  };

  $('brief').replaceChildren(
    el('h2', { textContent: level.name }),
    el('p', { className: 'lede', textContent: level.blurb }),
    el('ul', { className: 'harder' }, ...harder.map((h) => el('li', { textContent: h }))),

    el('h3', { textContent: 'Scouting report' }),
    el('div', { className: 'scouted' }, ...level.units.map((k) => unitCard(RIVAL_UNITS[k], { rival: true }))),

    el('h3', { textContent: `Your roster: up to ${ROSTER_SIZE}, from what ${a.name} has ${a.makes === 'grows' ? 'grown' : 'built'} for you` }),
    ctx.designs.length
      ? el('div', { className: 'yours' }, ...ctx.designs.map((d) => { const c = unitCard(d, { onclick: () => toggle(d.id) }); cards.set(d.id, c); return c; }))
      : el('p', { className: 'hint', textContent: 'You have no designs yet. Go back to the lab and make some.' }),
  );
  update();
}

/** The muster: the roster you're taking in, slot by slot, and the way in. Always in view. */
function showMuster(level, mine, toggle) {
  const roster = ctx.designs.filter((d) => mine.has(d.id));
  const slots = Array.from({ length: ROSTER_SIZE }, (_, i) => {
    const d = roster[i];
    return d
      ? el('button', { className: 'slot plate', title: `${d.name}: tap to leave it behind`, onclick: () => toggle(d.id) }, picture(d.art), el('span', { textContent: d.name }))
      : el('span', { className: 'slot empty' }, el('span', { textContent: i + 1 }));
  });
  $('muster').replaceChildren(
    el('div', { className: 'shelf' }, el('h3', { textContent: `Taking in: ${roster.length} of ${ROSTER_SIZE}` }), el('div', { className: 'slots' }, ...slots)),
    el('button', { id: 'begin', className: 'main', disabled: !roster.length, onclick: () => begin(level, roster) }, roster.length ? 'Begin' : 'Take a unit first', icon('forward')),
  );
}

function setCard(card, { on, full }) {
  card.classList.toggle('on', on); card.classList.toggle('full', full);
  const b = card.querySelector('.pick');
  if (!b) return;
  b.disabled = full && !on;
  b.replaceChildren(...(on ? [icon('check'), ' Taking it'] : [full ? 'Roster full' : 'Take it']));
}

/** A unit as a card: its picture, name, cost and time; tap to see the whole sheet. */
function unitCard(d, { rival = false, onclick } = {}) {
  const p = priced(d), lab = AIDS[d.aid];
  const card = el('div', { className: `card${rival ? ' rival' : ''}` },
    picture(d.art),
    el('div', { className: 'about' },
      el('strong', { textContent: d.name }),
      el('span', { className: 'line' },
        el('span', {}, icon('matter'), p.cost), el('span', {}, icon('time'), `${p.seconds}s`), el('span', {}, icon('army'), p.supply),
        ...(rival ? [el('span', { textContent: `from ${lab.title === 'biologist' ? 'the vats' : 'a shop'}` })] : [])),
      el('span', { className: 'craft' }, ...d.spec.abilities.map((x) => ability(lab.abilities[x]))),
      el('p', { className: 'desc', textContent: d.description }),
    ),
    el('details', { className: 'more' }, el('summary', { textContent: 'stats' }), el('div', { className: 'sheet' }, ...sheet(d, { compact: true }))),
  );
  if (onclick) card.append(el('button', { className: 'pick plate', textContent: 'Take it', onclick }));
  return card;
}

function begin(level, roster) {
  ctx.screen('match');
  startMatch({ level, aidId: ctx.aidId, roster, onEnd: (result) => {
    if (result === 'won' && !won().includes(level.id)) remember('mantle-won', JSON.stringify([...won(), level.id]));
    ctx.screen('war');
    const i = LEVELS.indexOf(level);
    showMaps(result === 'won' && LEVELS[i + 1] ? LEVELS[i + 1] : level);
  } });
}
