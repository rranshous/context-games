// A publication link takes a copy for this browser's person, then opens it. The copy
// is remembered per publication, so coming back finds the same one.
import { api, askName, el, remember } from './ui.js';
import { PadNav, Pads } from './pads.js';
import { report, watchPage } from './telemetry.js';
watchPage('play');
new PadNav(new Pads(), { scope: () => document.querySelector('.cover') });
const p = new URLSearchParams(location.search).get('p');
const key = `gactant-copy-${p}`;
let id = null;
try { id = localStorage.getItem(key); } catch {}
try {
  if (id) await api('GET', `ludants/${id}`).catch(() => { id = null; });
  if (!id) {
    document.getElementById('msg').textContent = '';
    const by = await askName('You get your own copy to play, and it will know you by this name.', await gameCard(p));
    document.getElementById('msg').textContent = 'taking a copy…';
    ({ id } = await api('POST', `published/${p}/copy`, { by }));
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
async function gameCard(id) {
  const [pub, pic] = await Promise.all([api('GET', `published/${id}`).catch(() => null), api('GET', `thumbs/p/${id}`).catch(() => null)]);
  if (!pub) return null;
  return el('div', { class: 'game-card' },
    pic?.url ? el('img', { src: pic.url, alt: pub.title }) : null,
    el('strong', {}, pub.title || pub.name),
    pub.by ? el('span', { class: 'game-card-by' }, `by ${pub.by}`) : null,
    el('p', {}, 'This game is alive: it\'s also an AI. Play it, tell it what you\'d change, and it changes itself.'));
}
