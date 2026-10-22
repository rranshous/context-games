// You, on gactant: your name, the devices you play on (each with its own key), adding one
// with a short code, and your recovery code. See identity.js and people.mjs.

import { forgetDevice, mine } from './identity.js';
import { PadNav, Pads } from './pads.js';
import { watchPage } from './telemetry.js';
import { askName, el, showRecovery } from './ui.js';

watchPage('me');
new PadNav(new Pads(), { scope: () => document.querySelector('.cover') ?? document.body });
const root = document.getElementById('me');
const when = (at) => new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

async function render() {
  const me = await mine('me');
  const name = el('input', { class: 'name-input', value: me.name, maxlength: '40' });
  const saved = el('span', { class: 'hint' });
  const paired = el('div', { class: 'pair-box' });
  root.replaceChildren(
    el('h1', {}, me.name),
    el('p', {}, 'Your ludants are yours on every device you add here. Each device keeps its own key, which never leaves it; nobody needs a password.'),

    el('h2', {}, 'Your name'),
    el('div', { class: 'me-row' }, name, el('button', { class: 'top-btn', onclick: async () => {
      try { await mine('name', { name: name.value }); saved.textContent = 'saved'; } catch (err) { saved.textContent = err.message; }
    } }, 'save'), saved),

    el('h2', {}, 'Your devices'),
    el('ul', { class: 'devices' }, ...me.devices.map((d) => el('li', {},
      el('span', {}, el('strong', {}, d.label), d.current ? el('em', {}, ' (this one)') : null,
        el('span', { class: 'hint' }, ` · added ${when(d.added)} · last here ${when(`${d.seen}T12:00:00Z`)}${d.kind === 'secret' ? ' · over plain http, with a secret instead of a key' : ''}`)),
      el('button', { class: 'wb-btn danger', onclick: async () => {
        if (!confirm(d.current ? 'Remove this device? It stops being you here: your ludants stay yours on your other devices.' : `Remove ${d.label}? It stops being you at once.`)) return;
        await mine('remove', { device: d.id });
        if (d.current) { await forgetDevice(); location.href = '/'; return; }
        render();
      } }, 'remove')))),
    el('button', { class: 'top-btn primary', onclick: async () => {
      const { code, until } = await mine('pair');
      const left = el('span', { class: 'hint' });
      paired.replaceChildren(
        el('p', {}, 'On the other device, open gactant. When it asks your name, choose "Already play on another device?" and type:'),
        el('pre', { class: 'recovery-code pair-code' }, code), left);
      const tick = () => {
        const s = Math.max(0, Math.round((Date.parse(until) - Date.now()) / 1000));
        left.textContent = s ? `works once, for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} more` : 'expired: make a new one';
        if (s) setTimeout(tick, 1000);
      };
      tick();
    } }, 'add a device'),
    paired,

    el('h2', {}, 'Your recovery code'),
    el('p', {}, `If you lose every device here, your recovery code gets you and your ludants back. Yours was made ${me.recoveryAt ? when(me.recoveryAt) : 'when you started'}. Lost it, or think someone saw it? Make a new one: the old one stops working.`),
    el('button', { class: 'top-btn', onclick: async () => {
      if (!confirm('Make a new recovery code? The old one stops working.')) return;
      const { recovery } = await mine('recovery');
      const box = el('div', { class: 'cover' });
      document.body.append(box);
      showRecovery(box, recovery, () => box.remove(), true);
    } }, 'make a new recovery code'),

    el('p', {}, el('a', { href: '/' }, 'Back to the lobby'), ' · ', el('a', { href: '/privacy.html' }, 'privacy')),
  );
}

try {
  await askName('Ludants know the people who sit with them by name.');
  await render();
} catch (err) {
  root.replaceChildren(el('p', {}, `couldn't load you: ${err.message}`), el('a', { href: '/' }, 'to the lobby'));
}
