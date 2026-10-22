// A publication link takes a copy for this browser's person, then opens it. The copy
// is remembered per publication, so coming back finds the same one.
import { api, askName, own, remember } from './ui.js';
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
    const by = await askName('Playing gives you your own copy of this ludant, and it will know you by this name.');
    document.getElementById('msg').textContent = 'taking a copy…';
    let owner;
    ({ id, owner } = await api('POST', `published/${p}/copy`, { by }));
    own(id, owner);
    try { localStorage.setItem(key, id); } catch {}
  }
  remember(id);
  // Someone arriving from a play link came to play: start with the stage alone.
  location.replace(`/frame.html?l=${id}&play`);
} catch (err) {
  report('crash', { where: 'play copy', message: err.message });
  document.getElementById('msg').textContent = `couldn't take a copy: ${err.message}`;
}
