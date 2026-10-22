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
  const res = await fetch(`/api/${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error || `${method} ${path}: ${res.status}`), { status: res.status, body: json });
  return json;
};

/** The name this browser's person goes by, or '' if they haven't said. */
export function myName() {
  try { return localStorage.getItem('gactant-name') || ''; } catch { return ''; }
}

/** Ask the person's name, inline, the first time it's needed. Resolves with it (and keeps it). */
export function askName(why = 'Ludants know the people who sit with them by name.') {
  const known = myName();
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const input = el('input', { class: 'name-input', placeholder: 'your name', maxlength: '40', autocomplete: 'nickname' });
    const done = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      try { localStorage.setItem('gactant-name', name); } catch {}
      box.remove();
      resolve(name);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
    const box = el('div', { class: 'cover' }, el('div', { class: 'cover-box' },
      el('p', {}, el('strong', {}, 'What should we call you? '), why),
      input, el('button', { class: 'top-btn primary', onclick: done }, 'that\'s me')));
    document.body.append(box);
    input.focus();
  });
}

// Owner keys: a ludant this browser seeded or copied is its own, and changing it takes the
// key (core.mjs). Another device gets it from an "open on another device" link.
const OWNERS = 'gactant-owners';
const owners = () => { try { return JSON.parse(localStorage.getItem(OWNERS) || '{}'); } catch { return {}; } };
export function ownerOf(id) { return owners()[id] ?? null; }
export function own(id, key) { if (!key) return; try { localStorage.setItem(OWNERS, JSON.stringify({ ...owners(), [id]: key })); } catch {} }

// The ludants this browser has sat with, newest first: how someone finds their way back.
const MINE = 'gactant-mine';
export function mine() { try { return JSON.parse(localStorage.getItem(MINE) || '[]'); } catch { return []; } }
export function forget(id) {
  try { localStorage.setItem(MINE, JSON.stringify(mine().filter((m) => m.id !== id))); } catch {}
}
export function remember(id) {
  try { localStorage.setItem(MINE, JSON.stringify([{ id, at: Date.now() }, ...mine().filter((m) => m.id !== id)].slice(0, 40))); } catch {}
}
