import { become, join, pass } from './identity.js';

// Tiny DOM helper: el('div', { class: 'x', onclick: fn }, child, 'text', ...)
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

export const api = async (method, path, body) => {
  // Every request says who's asking, with this device's pass (identity.js), if it has one.
  const p = await pass().catch(() => null);
  const res = await fetch(`/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(p ? { 'X-Gactant-Pass': p } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || `${method} ${path}: ${res.status}`), { status: res.status, body: json });
  return json;
};

/** The name this browser's person goes by, or '' if they haven't said. */
export function myName() {
  try { return localStorage.getItem('gactant-name') || ''; } catch { return ''; }
}

/** Who's here, the first time it's needed: a name, which makes them a person on gactant
 *  with this device (identity.js), or a code from another of their devices. Resolves with
 *  their name once this device is theirs. */
export async function askName(why = 'Ludants know the people who sit with them by name.') {
  if (myName() && await pass().catch(() => null)) return myName();
  return new Promise((resolve) => {
    const box = el('div', { class: 'cover' });
    const fail = (where, err) => { where.textContent = err.message; };
    const asName = () => {
      const input = el('input', { class: 'name-input', placeholder: 'your name', maxlength: '40', autocomplete: 'nickname', value: myName() });
      const said = el('p', { class: 'ask-fail' });
      const done = async () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        try { const { recovery } = await become(name); showRecovery(box, recovery, () => { box.remove(); resolve(name); }); }
        catch (err) { fail(said, err); }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
      box.replaceChildren(el('div', { class: 'cover-box' },
        el('p', {}, el('strong', {}, 'What should we call you? '), why),
        input, el('button', { class: 'top-btn primary', onclick: done }, 'that\'s me'), said,
        el('button', { class: 'link-btn', onclick: asCode }, 'Already play on another device? Use a code from it')));
      input.focus();
    };
    const asCode = () => {
      const input = el('input', { class: 'name-input', placeholder: 'the code, or your recovery code', autocomplete: 'off' });
      const said = el('p', { class: 'ask-fail' });
      const done = async () => {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        // A device code is eight letters and digits; a recovery code is twelve words.
        const isRecovery = v.split(/[^a-z]+/i).filter(Boolean).length >= 6;
        try {
          const { recovery, name } = await join(isRecovery ? { recovery: v } : { code: v });
          if (recovery) showRecovery(box, recovery, () => { box.remove(); resolve(name); }, true);
          else { box.remove(); resolve(name); }
        } catch (err) { fail(said, err); }
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
      box.replaceChildren(el('div', { class: 'cover-box' },
        el('p', {}, el('strong', {}, 'Use this device as you. '), 'On a device where you already play, open "you" in the lobby and make a code for a new device, then type it here. Lost all your devices? Your recovery code works too.'),
        input, el('button', { class: 'top-btn primary', onclick: done }, 'use it'), said,
        el('button', { class: 'link-btn', onclick: asName }, 'I\'m new here')));
      input.focus();
    };
    asName();
    document.body.append(box);
  });
}

/** A recovery code, shown once: the spare key, for if every device of theirs is lost. */
export function showRecovery(box, code, then, fresh = false) {
  const copy = el('button', { class: 'top-btn', onclick: async () => { try { await navigator.clipboard.writeText(code); copy.textContent = 'copied'; } catch { copy.textContent = 'select it and copy'; } } }, 'copy');
  box.replaceChildren(el('div', { class: 'cover-box' },
    el('p', {}, el('strong', {}, fresh ? 'Your new recovery code. ' : 'Your recovery code. '),
      'If you ever lose every device you play on, this gets you and your ludants back. It\'s shown only now: keep it somewhere safe and private (on paper, or in a password manager). Anyone who has it can become you here.'),
    el('pre', { class: 'recovery-code' }, code),
    copy, el('button', { class: 'top-btn primary', onclick: then }, 'I\'ve kept it')));
}

// The ludants this browser has sat with, newest first: how someone finds their way back.
const MINE = 'gactant-mine';
export function mine() { try { return JSON.parse(localStorage.getItem(MINE) || '[]'); } catch { return []; } }
export function forget(id) {
  try { localStorage.setItem(MINE, JSON.stringify(mine().filter((m) => m.id !== id))); } catch {}
}
export function remember(id) {
  try { localStorage.setItem(MINE, JSON.stringify([{ id, at: Date.now() }, ...mine().filter((m) => m.id !== id)].slice(0, 40))); } catch {}
}
