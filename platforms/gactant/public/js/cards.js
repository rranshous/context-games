// What the lobby and a game's tree page both show games with: when, how long, a picture.

import { api, el } from './ui.js';

export const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 2 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
export const hours = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`);

/** A shared game's link: by its line, so a copy follows it. */
export const playLink = (p) => (p.line ? `/play.html?line=${p.line}` : `/play.html?p=${p.id}`);
/** A shared game's tree: who follows it, and its spin-offs. */
export const treeLink = (line, part = '') => `/line.html?id=${line}${part ? `#${part}` : ''}`;

/** A picture of its stage, fetched when it scrolls near, or a placeholder in the meantime.
 *  kind: 'l' (a ludant) or 'p' (a publication); or give the picture's url as id with kind null. */
export function thumb(kind, id, name) {
  // Until its picture comes (or if it has none), a colour of its own, from its name.
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  const box = el('div', { class: 'thumb', style: `--hue: ${h}` }, el('span', { class: 'thumb-name' }, String(name).trim()[0]?.toUpperCase() ?? ''));
  const show = (url) => { if (url) box.replaceChildren(el('img', { src: url, alt: `${name}, as it looks` })); };
  if (!kind) { show(id); return box; }
  new IntersectionObserver(async ([e], obs) => {
    if (!e.isIntersecting) return;
    obs.disconnect();
    try { show((await api('GET', `thumbs/${kind}/${id}`)).url); } catch {}
  }, { rootMargin: '200px' }).observe(box);
  return box;
}

/** A count that opens a bigger view of it. */
export const stat = (n, one, many, href) => el('a', { class: 'stat', href },
  el('strong', {}, String(n)), el('span', {}, n === 1 ? one : many));
