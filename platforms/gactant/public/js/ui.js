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
