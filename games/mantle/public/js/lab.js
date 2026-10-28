// The studio: pick who you work with, then design units with them. One design on the
// bench at a time; kept designs go to your roster, and come back to the bench to revise.
// From here you go to the front (war.js): pick a map, pick your roster, fight.

import { AIDS } from './aids.js';
import { Aid } from './aid.js';
import { cutout } from './cutout.js';
import { SIZES } from './spec.js';
import { $, ability, el, priced, recall, remember, sheet } from './ui.js';
import { showWar } from './war.js';
import { source } from './brain.js';
import { connect, disconnect } from './openrouter.js';

let aid = null;
const busy = new Set();

// ---------- who you work with ----------

const SCREENS = ['pick', 'lab', 'war', 'match'];
const screen = (name) => { for (const s of SCREENS) $(s).hidden = s !== name; };
function showLab() { screen('lab'); showRoster(); }

function showPick() {
  delete document.body.dataset.aid;
  screen('pick');
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
  showLab();
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

  $('sheet').replaceChildren(...sheet({ ...d, aid: aid.id }));
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
    return el('button', { className: 'unit', title: d.description, onclick: () => aid.load(d) }, pic, el('strong', { textContent: d.name }), el('span', { textContent: `${priced(d).cost} · ${SIZES[d.spec.size - 1]}` }));
  }) : [el('p', { className: 'hint', textContent: 'Keep a design and it shows up here.' })]));
}

// ---------- whose thinking ----------

async function showThinking() {
  const from = await source();
  $('thinking').replaceChildren(...(from === 'yours'
    ? [el('span', { className: 'quiet', textContent: 'thinking on your OpenRouter' }), el('button', { className: 'quiet', textContent: 'disconnect', onclick: () => { disconnect(); showThinking(); } })]
    : [from === 'server' && el('span', { className: 'quiet', textContent: 'thinking on this server\'s key' }),
      el('button', { className: from ? 'quiet' : 'connect', textContent: from ? 'connect your own OpenRouter' : 'Connect OpenRouter to design', onclick: () => connect().then(showThinking) })]));
}
addEventListener('storage', (e) => { if (e.key === 'mantle-openrouter-key') showThinking(); });
showThinking();

$('front').onclick = () => { screen('war'); showWar(aid.id, { back: showLab, screen }); };

const chosen = recall('mantle-aid');
AIDS[chosen] ? start(chosen) : showPick();
