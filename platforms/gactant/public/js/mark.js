// A mark, for anyone checking one: what gactant recorded (when, by whom, for which game),
// whether the device that made it signed it, and a box to check words against it. The
// words come from the person's "how I made this" page; gactant only ever had the fingerprint.
//   mark.html?h=<sha256 hex>

import { sha256 } from './surfaces/made.js';
import { watchPage } from './telemetry.js';
import { api, el } from './ui.js';

watchPage('mark');
const root = document.getElementById('mark');
const hash = new URLSearchParams(location.search).get('h') ?? '';
const when = (at) => new Date(at).toLocaleString([], { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function render() {
  const m = await api('GET', `marks/${hash}`);
  let signed = 'It isn\'t signed: the device that made it keeps a secret instead of a key.';
  if (m.signed) {
    try {
      const key = await crypto.subtle.importKey('jwk', m.key, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64u(m.signature), new TextEncoder().encode(m.text));
      signed = ok ? `It's signed by the key of the device ${m.name ?? 'its person'} made it on, and the signature checks out (here, in your browser).` : 'Its signature does NOT check out.';
    } catch { signed = 'Its signature couldn\'t be checked in this browser.'; }
  }
  const words = el('textarea', { class: 'name-input', rows: 5, placeholder: 'paste the words here, exactly as fingerprinted' });
  const said = el('p', { class: 'hint' });
  root.replaceChildren(
    el('h1', {}, 'A mark'),
    el('p', {}, el('strong', {}, `Recorded by gactant on ${when(m.at)}`), `, for ${m.name ?? 'a person'}, working on ${m.game ?? 'a game that is no longer here'}.`),
    el('p', {}, signed),
    el('p', { class: 'hint' }, 'A mark is a fingerprint (SHA-256) of something a person contributed to a game: what they asked for, picked, drew or wrote. gactant keeps only the fingerprint and the time, never the words, so this shows that whoever holds words matching it had them then. Their "how I made this" page checks its own entries against their marks as it opens.'),
    el('p', { class: 'hint' }, `Fingerprint: ${m.hash}`),
    el('h2', {}, 'Check some words'),
    words,
    el('button', { class: 'top-btn primary', onclick: async () => {
      said.textContent = (await sha256(words.value)) === m.hash ? 'They match: these are the words this mark was made from.' : 'They don\'t match this mark.';
    } }, 'check'),
    said,
    el('p', {}, el('a', { href: '/terms.html' }, 'Terms'), ' · ', el('a', { href: '/' }, 'Home')),
  );
}

if (!/^[0-9a-f]{64}$/.test(hash)) root.replaceChildren(el('p', {}, 'This page needs a mark\'s link.'));
else render().catch((err) => root.replaceChildren(el('p', {}, err.status === 404 ? 'gactant has no such mark.' : `couldn't load the mark: ${err.message}`)));
