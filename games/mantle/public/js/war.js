// The front: the maps, one after another, and the briefing for each. The briefing is a
// scouting report (the rival's units, priced like yours) and the roster you take in: up
// to five of your designs. Seeing what you face before you pick is the point: go back to
// the lab and design an answer.

import { AIDS } from './aids.js';
import { cutout } from './cutout.js';
import { LEVELS, RIVAL_UNITS, ROSTER_SIZE } from './levels.js';
import { startMatch } from './match.js';
import { $, ability, el, priced, recall, remember, sheet } from './ui.js';

let ctx = null;   // { aidId, back, screen, designs, level }

const won = () => { try { return JSON.parse(recall('mantle-won') ?? '[]'); } catch { return []; } };
const open = (i) => i === 0 || won().includes(LEVELS[i - 1].id);
const picked = () => { try { return JSON.parse(recall(`mantle-roster-${ctx.aidId}`) ?? '[]'); } catch { return []; } };

export async function showWar(aidId, { back, screen }) {
  ctx = { aidId, back, screen, designs: (await fetch('/api/designs').then((r) => r.json())).filter((d) => d.aid === aidId) };
  $('to-lab').onclick = back;
  const first = LEVELS.findIndex((l, i) => open(i) && !won().includes(l.id));
  showMaps(LEVELS[first < 0 ? 0 : first]);
}

function showMaps(level) {
  ctx.level = level;
  $('maps').replaceChildren(el('h3', { textContent: 'The campaign' }), ...LEVELS.map((l, i) => el('button', {
    className: `map${l === level ? ' on' : ''}${won().includes(l.id) ? ' won' : ''}`, disabled: !open(i),
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
  const toggle = (id) => {
    if (mine.has(id)) mine.delete(id); else if (mine.size < ROSTER_SIZE) mine.add(id);
    remember(`mantle-roster-${ctx.aidId}`, JSON.stringify([...mine]));
    showBrief(level);
  };
  const a = AIDS[ctx.aidId];

  $('brief').replaceChildren(
    el('h2', { textContent: level.name }),
    el('p', { className: 'lede', textContent: level.blurb }),
    el('ul', { className: 'harder' }, ...harder.map((h) => el('li', { textContent: h }))),

    el('h3', { textContent: 'Scouting report' }),
    el('div', { className: 'scouted' }, ...level.units.map((k) => unitCard(RIVAL_UNITS[k], { rival: true }))),

    el('h3', { textContent: `Your roster: up to ${ROSTER_SIZE}, from what ${a.name} has ${a.makes === 'grows' ? 'grown' : 'built'} for you` }),
    ctx.designs.length
      ? el('div', { className: 'yours' }, ...ctx.designs.map((d) => unitCard(d, { on: mine.has(d.id), onclick: () => toggle(d.id), full: !mine.has(d.id) && mine.size >= ROSTER_SIZE })))
      : el('p', { className: 'hint', textContent: 'You have no designs yet. Go back to the lab and make some.' }),
    el('div', { className: 'go' },
      el('button', { className: 'quiet', textContent: '← design an answer in the lab', onclick: ctx.back }),
      el('button', { id: 'begin', textContent: `Begin (${mine.size} of ${ROSTER_SIZE})`, disabled: !mine.size, onclick: () => begin(level, ctx.designs.filter((d) => mine.has(d.id))) }),
    ),
  );
}

/** A unit as a card: its picture, name, cost and time; tap to see the whole sheet. */
function unitCard(d, { rival = false, on = false, full = false, onclick } = {}) {
  const pic = el('div', { className: 'pic' });
  if (d.art) cutout(d.art).then((src) => pic.append(el('img', { src, alt: '' })));
  const p = priced(d), lab = AIDS[d.aid];
  const card = el('div', { className: `card${rival ? ' rival' : ''}${on ? ' on' : ''}${full ? ' full' : ''}` },
    pic,
    el('div', { className: 'about' },
      el('strong', { textContent: d.name }),
      el('span', { className: 'line', textContent: `${p.cost} · ${p.seconds}s · ${p.supply} room${rival ? ` · from ${lab.title === 'biologist' ? 'the vats' : 'a shop'}` : ''}` }),
      el('span', { className: 'craft' }, ...d.spec.abilities.map((x) => ability(lab.abilities[x]))),
      el('p', { className: 'desc', textContent: d.description }),
    ),
    el('details', { className: 'more' }, el('summary', { textContent: 'stats' }), el('div', { className: 'sheet' }, ...sheet(d, { compact: true }))),
  );
  if (onclick) {
    card.append(el('button', { className: 'pick', textContent: on ? 'Taking it ✓' : full ? 'Roster full' : 'Take it', disabled: full && !on, onclick }));
  }
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
