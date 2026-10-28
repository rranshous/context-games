// The studio: pick who you work with, then design units with them. One design on the
// bench at a time; kept designs go to your roster, and come back to the bench to revise.

import { AIDS } from './aids.js';
import { Aid } from './aid.js';
import { cutout } from './cutout.js';
import { SIZES, STATS } from './spec.js';

const $ = (id) => document.getElementById(id);
const el = (tag, { dataset, ...props } = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); Object.assign(e.dataset, dataset); e.append(...kids); return e; };
const remember = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

let aid = null;
const busy = new Set();

// ---------- who you work with ----------

function showPick() {
  delete document.body.dataset.aid;
  $('lab').hidden = true; $('pick').hidden = false;
  $('aids').replaceChildren(...Object.values(AIDS).map((a) => el('button', { className: 'aid', onclick: () => start(a.id) },
    el('img', { src: `img/${a.id}.jpg`, alt: '' }),
    el('strong', { textContent: a.name }),
    el('span', { className: 'title', textContent: `${a.title}, ${a.makes} in ${a.lab}` }),
    el('span', { className: 'craft' }, ...Object.values(a.abilities).map((x) => ability(x))),
    el('span', { className: 'lean', textContent: a.leanText.replace(/^In (your|their) \w+, /, '').replace(/^./, (c) => c.toUpperCase()) }),
  )));
}

function start(aidId) {
  remember('mantle-aid', aidId);
  const a = AIDS[aidId];
  document.documentElement.style.setProperty('--aid', a.color);
  document.body.dataset.aid = aidId;   // the lab is dressed as theirs: the vats or the shop
  aid = new Aid(aidId, { onChange: showBench, onSay: say, onBusy: setBusy });
  $('pick').hidden = true; $('lab').hidden = false;
  $('where').textContent = `${a.lab}, with ${a.name}`;
  $('who').replaceChildren(el('img', { src: `img/${a.id}.jpg`, alt: '' }), el('div', {}, el('strong', { textContent: a.name }), el('span', { textContent: a.title })));
  $('log').replaceChildren();
  say(a.id === 'hollis'
    ? 'The vats are warm. Tell me what you need out there, and I\'ll grow you something for it.'
    : 'Shop\'s open. Tell me the job and I\'ll build you something that does it.');
  showBench(null);
  showRoster();
}

// ---------- talking ----------

function say(text, kind = 'aid') {
  $('log').append(el('p', { className: kind, textContent: text }));
  $('log').scrollTop = $('log').scrollHeight;
}

function setBusy(kind, on) {
  on ? busy.add(kind) : busy.delete(kind);
  const a = aid.aid;
  const words = [busy.has('thinking') && `${a.name.split(' ').at(-1)} is thinking…`, busy.has('drawing') && `${a.lab} are making a likeness…`].filter(Boolean);
  let note = $('log').querySelector('.busy');
  if (!words.length) return note?.remove();
  if (!note) { note = el('p', { className: 'busy' }); }
  note.textContent = words.join(' ');
  $('log').append(note);
  $('log').scrollTop = $('log').scrollHeight;
  $('words').disabled = busy.has('thinking');
  if (!busy.has('thinking')) $('words').focus();
}

$('say').onsubmit = (e) => {
  e.preventDefault();
  const text = $('words').value.trim();
  if (!text || busy.has('thinking')) return;
  $('words').value = '';
  say(text, 'me');
  aid.hear(text).then(() => { $('words').disabled = false; $('words').focus(); });
};
$('words').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('say').requestSubmit(); } };

// ---------- the bench ----------

/** An ability, marked as one: hover it to hear what it does (and, on a unit, what it adds to the cost). */
const ability = (x, cost) => el('span', { className: 'ability', tabIndex: 0, dataset: { tip: x.word, about: `${x.about[0].toUpperCase()}${x.about.slice(1)}.`, ...(cost != null ? { cost: `Adds ${cost} to this unit's cost.` } : {}) } },
  el('i', { className: 'mark', ariaHidden: 'true' }), x.word);

const rating = (r) => el('span', { className: 'bar' }, ...Array.from({ length: 10 }, (_, i) => el('i', { className: i < r ? 'on' : '' })));

function showBench(d) {
  $('keep').disabled = !d;
  $('bench').classList.toggle('empty', !d);
  if (!d) {
    $('art').replaceChildren(el('p', { className: 'hint', textContent: 'Nothing on the bench yet.' }));
    $('name').textContent = ''; $('description').textContent = ''; $('sheet').replaceChildren();
    return;
  }
  $('name').textContent = d.name;
  $('description').textContent = d.description;
  if (d.art) cutout(d.art).then((src) => { if (aid.bench === d) $('art').replaceChildren(el('img', { src, alt: d.name })); });
  else $('art').replaceChildren(el('p', { className: 'hint', textContent: 'Making a likeness…' }));

  const { spec, priced } = d, a = aid.aid;
  $('sheet').replaceChildren(
    el('div', { className: 'facts' },
      el('div', {}, el('b', { textContent: priced.cost }), el('span', { textContent: 'cost' })),
      el('div', {}, el('b', { textContent: priced.supply }), el('span', { textContent: 'room in the army' })),
      el('div', {}, el('b', { textContent: `${priced.seconds}s` }), el('span', { textContent: `to ${a.makes === 'grows' ? 'grow' : 'build'}` })),
    ),
    el('p', { className: 'size', textContent: `${SIZES[spec.size - 1]}` }),
    el('table', {}, ...Object.entries(STATS).map(([s, { word }]) => el('tr', {}, el('th', { textContent: word, dataset: { tip: word, about: `${STATS[s].about[0].toUpperCase()}${STATS[s].about.slice(1)}.` } }), el('td', {}, rating(spec.stats[s])), el('td', { className: 'n', textContent: spec.stats[s] })))),
    el('div', { className: 'abilities' }, el('h4', { textContent: 'Abilities' }),
      ...(spec.abilities.length ? spec.abilities.map((x) => ability(a.abilities[x], priced.lines.find((l) => l.what === a.abilities[x].word)?.cost)) : [el('em', { textContent: 'none' })])),
    el('details', {}, el('summary', { textContent: 'where the cost comes from' }),
      el('table', { className: 'price' }, ...priced.lines.map((l) => el('tr', {}, el('th', { textContent: l.what }), el('td', { className: 'n', textContent: l.cost }))))),
  );
}

$('keep').onclick = async () => {
  const d = aid.bench;
  const kept = await fetch('/api/designs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...d, aid: aid.id }) }).then((r) => r.json());
  d.id = kept.id;
  aid.messages.push({ role: 'user', content: `(The commander kept ${d.name} for their roster.)` });
  say(`${d.name} is in your roster.`, 'note');
  showRoster();
};
$('fresh').onclick = () => aid.clear();
$('switch').onclick = () => { remember('mantle-aid'); showPick(); };

// ---------- the roster ----------

async function showRoster() {
  const designs = (await fetch('/api/designs').then((r) => r.json())).filter((d) => d.aid === aid.id);
  $('kept').replaceChildren(...(designs.length ? designs.map((d) => {
    const pic = el('div', { className: 'pic' });
    if (d.art) cutout(d.art).then((src) => pic.append(el('img', { src, alt: '' })));
    return el('button', { className: 'unit', title: d.description, onclick: () => aid.load(d) }, pic, el('strong', { textContent: d.name }), el('span', { textContent: `${d.priced.cost} · ${SIZES[d.spec.size - 1]}` }));
  }) : [el('p', { className: 'hint', textContent: 'Keep a design and it shows up here.' })]));
}

// ---------- what things are, on hover ----------

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

const chosen = recall('mantle-aid');
AIDS[chosen] ? start(chosen) : showPick();
