// The studio: pick who you work with, then design units with them. One design on the
// bench at a time; kept designs go to your roster, and come back to the bench to revise.
// From here you go to the front (war.js): pick a map, pick your roster, fight.

import { AIDS } from './aids.js';
import { Aid } from './aid.js';
import { cutout } from './cutout.js';
import { SIZES } from './spec.js';
import { $, ability, el, picture, priced, recall, remember, sheet } from './ui.js';
import { showWar } from './war.js';
import { icon } from './icons.js';
import { LEVELS } from './levels.js';
import { source } from './brain.js';
import { connect, disconnect } from './openrouter.js';
import { isMuted, setMuted, wake } from './sound.js';

let aid = null;
const busy = new Set();

// ---------- who you work with ----------

const SCREENS = ['title', 'pick', 'lab', 'war', 'match'];
const screen = (name) => { for (const s of SCREENS) $(s).hidden = s !== name; };
function showLab() { screen('lab'); showRoster(); }

// ---------- the title ----------

function showTitle() {
  const chosen = AIDS[recall('mantle-aid')];
  dressAs(chosen?.id);
  screen('title');
  const button = (text, onclick, className) => el('button', { className, onclick }, ...text);
  $('title-go').replaceChildren(...(chosen
    ? [button([`Continue with ${chosen.name}`, icon('forward')], () => start(chosen.id), 'main'), button(['Work with someone else'], showPick, 'plate')]
    : [button(['Begin', icon('forward')], showPick, 'main')]));
  let won = [];
  try { won = JSON.parse(recall('mantle-won') ?? '[]'); } catch {}
  $('title-progress').textContent = won.length ? `${won.length} of ${LEVELS.length} maps taken` : '';
}

/** The screens wear the aid's look: their color, their frames and buttons, their room. */
function dressAs(aidId) {
  if (aidId) { document.body.dataset.aid = aidId; document.documentElement.style.setProperty('--aid', AIDS[aidId].color); }
  else { delete document.body.dataset.aid; document.documentElement.style.removeProperty('--aid'); }
}

// The knobs every screen has: back (top left) and the menu (top right).
for (const k of document.querySelectorAll('.knob.back')) k.append(icon('back'));
for (const k of document.querySelectorAll('.knob.menu')) { k.append(icon('menu')); k.onclick = showMenu; }
$('pick-back').onclick = showTitle;
$('lab-back').onclick = showTitle;

// ---------- the menu: everything that isn't the next step ----------

async function showMenu() {
  const from = await source(), chosen = AIDS[recall('mantle-aid')];
  const close = () => { $('menu').hidden = true; };
  const item = (label, onclick, className = 'plate') => el('button', { className, onclick: () => { close(); onclick(); } }, ...[label].flat());
  $('menu').replaceChildren(el('div', { className: 'panel box' },
    el('h2', { textContent: 'Mantle' }),
    el('div', { className: 'thinking' },
      el('p', { textContent: from === 'yours' ? 'Your aid thinks on your OpenRouter account.' : from === 'server' ? 'Your aid thinks on this server\'s key.' : 'Your aid needs OpenRouter to think.' }),
      from === 'yours' ? item('Disconnect OpenRouter', () => { disconnect(); refreshThinking(); }) : item(from ? 'Connect your own OpenRouter' : 'Connect OpenRouter', () => connect().then(refreshThinking), from ? 'plate' : 'main')),
    item([icon(isMuted() ? 'muted' : 'sound'), isMuted() ? ' Sound is off' : ' Sound is on'], () => { setMuted(!isMuted()); wake(); }),
    chosen && item('Work with someone else', showPick),
    item('Title screen', showTitle),
    el('p', { className: 'links' }, el('a', { href: '/faq', target: '_blank', textContent: 'FAQ' }), ' · ', el('a', { href: '/privacy', target: '_blank', textContent: 'Privacy' })),
    item('Close', () => {}, 'quiet'),
  ));
  $('menu').hidden = false;
  $('menu').onclick = (e) => { if (e.target === $('menu')) close(); };
}
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('menu').hidden = true; });

function showPick() {
  dressAs(null);
  screen('pick');
  // Each card wears its own aid's look, and ends in its own way in.
  $('aids').replaceChildren(...Object.values(AIDS).map((a) => el('div', { className: 'aid panel', dataset: { aid: a.id }, style: `--aid: ${a.color}` },
    el('img', { src: `img/${a.id}.jpg`, alt: '' }),
    el('div', { className: 'about' },
      el('strong', { textContent: a.name }),
      el('span', { className: 'title', textContent: `${a.title}, ${a.makes} in ${a.lab}` }),
      el('span', { className: 'craft' }, ...Object.values(a.abilities).map((x) => ability(x))),
      el('span', { className: 'lean', textContent: a.leanText.replace(/^In (your|their) \w+, /, '').replace(/^./, (c) => c.toUpperCase()) })),
    el('button', { className: 'main', onclick: () => start(a.id) }, `Work with ${a.name.split(' ').at(-1)}`, icon('forward')),
  )));
}

function start(aidId) {
  remember('mantle-aid', aidId);
  const a = AIDS[aidId];
  dressAs(aidId);   // the lab is dressed as theirs: the vats or the shop
  aid = new Aid(aidId, { onChange: showBench, onSay: say, onBusy: setBusy });
  showLab();
  $('who').replaceChildren(el('img', { src: `img/${a.id}.jpg`, alt: '' }), el('div', {}, el('strong', { textContent: a.name }), el('span', { textContent: `${a.title}, ${a.lab}` })));
  $('log').replaceChildren();
  say(a.id === 'hollis'
    ? 'The vats are warm. Tell me what you need out there, and I\'ll grow you something for it.'
    : 'Shop\'s open. Tell me the job and I\'ll build you something that does it.');
  showBench(null);
  showRoster();
  refreshThinking();
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
    $('name').textContent = ''; $('description').textContent = '';
    $('sheet').replaceChildren(el('p', { className: 'hint', textContent: 'When there\'s a unit on the bench, its sheet is here: what it costs, how long it takes, its stats and its abilities.' }));
    return;
  }
  $('name').textContent = d.name;
  $('description').textContent = d.description;
  if (d.art) cutout(d.art).then((src) => { if (aid.bench === d) $('art').replaceChildren(el('img', { src, alt: d.name })); })
    .catch(() => { if (aid.bench === d) $('art').replaceChildren(el('p', { className: 'hint', textContent: 'Its likeness is lost. Ask for a new one.' })); });
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

// ---------- the roster ----------

async function showRoster() {
  const designs = (await fetch('/api/designs?by=me').then((r) => r.json())).filter((d) => d.aid === aid.id);
  // The front is the next step once there's something to take to it.
  $('front').className = designs.length ? 'main' : 'plate';
  $('kept').replaceChildren(...(designs.length ? designs.map((d) => {
    return el('button', { className: 'unit', title: d.description, onclick: () => aid.load(d) }, picture(d.art), el('strong', { textContent: d.name }), el('span', { textContent: `${priced(d).cost} · ${SIZES[d.spec.size - 1]}` }));
  }) : [el('p', { className: 'hint', textContent: 'Keep a design and it shows up here.' })]));
}

// ---------- whose thinking ----------

/** With nothing to think on, the talk ends in the way to connect; otherwise in the words. */
async function refreshThinking() {
  const none = !(await source());
  $('say').hidden = none;
  $('need-thinking').hidden = !none;
  if (none) $('need-thinking').replaceChildren(
    el('p', { textContent: `${aid ? aid.aid.name.split(' ').at(-1) : 'Your aid'} thinks and draws with AI models, on your own OpenRouter account. Connect it to start designing.` }),
    el('button', { className: 'main', onclick: () => connect().then(refreshThinking) }, 'Connect OpenRouter'));
}
addEventListener('storage', (e) => { if (e.key === 'mantle-openrouter-key') refreshThinking(); });
refreshThinking();
$('say').querySelector('button').append(icon('forward'));
$('front').append(icon('forward'));

$('front').onclick = () => { screen('war'); showWar(aid.id, { back: showLab, screen }); };

showTitle();
