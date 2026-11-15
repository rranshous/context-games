// A shared game's link takes a copy for this browser's person, then opens it. The copy
// follows the game it came from (its updates arrive as it's opened). The copy is remembered
// per link, so coming back finds the same one.
//   play.html?line=<id>   a shared game (an invite, or a card in the lobby)
//   play.html?p=<id>      an older link to one version: the same, by the game it's a version of
import { api, askName, el, remember } from './ui.js';
import { PadNav, Pads } from './pads.js';
import { report, watchPage } from './telemetry.js';
watchPage('play');
new PadNav(new Pads(), { scope: () => document.querySelector('.cover') });
const q = new URLSearchParams(location.search);
let line = q.get('line');
const p = q.get('p');
try {
  if (!line && p) line = (await api('GET', `published/${p}`)).line ?? null;
  const key = `gactant-copy-${line ?? p}`;
  let id = null;
  try { id = localStorage.getItem(key); } catch {}
  if (id) await api('GET', `ludants/${id}`).catch(() => { id = null; });
  if (!id) {
    const game = line ? await api('GET', `lines/${line}`) : null;
    document.getElementById('msg').textContent = '';
    const by = await askName('You get your own copy to play, and it will know you by this name.', gameCard(game));
    document.getElementById('msg').textContent = 'taking a copy…';
    ({ id } = await api('POST', line ? `lines/${line}/copy` : `published/${p}/copy`, { by }));
    try { localStorage.setItem(key, id); } catch {}
  }
  remember(id);
  // Someone arriving from a play link came to play: start with the stage alone.
  location.replace(`/frame.html?l=${id}&play`);
} catch (err) {
  report('crash', { where: 'play copy', message: err.message });
  document.getElementById('msg').textContent = `couldn't take a copy: ${err.message}`;
}

/** What the link is to: its picture, its title, who made it, and what's odd about it. */
function gameCard(game) {
  if (!game) return null;
  return el('div', { class: 'game-card' },
    game.picture ? el('img', { src: game.picture, alt: game.title ?? '' }) : null,
    el('strong', {}, game.title || game.given || 'a game'),
    game.latest?.by ? el('span', { class: 'game-card-by' }, `by ${game.latest.by}`) : null,
    el('p', {}, 'This game is alive: it\'s also an AI. Play it, tell it what you\'d change, and it changes itself.'),
    el('p', { class: 'game-card-fine' }, `Your copy keeps getting ${game.latest?.by ?? 'its maker'}'s updates until you change it. Playing needs no account. For it to talk back and change, you connect your own AI account (OpenRouter): usually a few cents a change.`));
}
