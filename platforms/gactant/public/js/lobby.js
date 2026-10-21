import { api, el, myName } from './ui.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function lineageLine(l) {
  if (l?.from) return `copy of ${l.from.name}${l.from.by ? ` (published by ${l.from.by})` : ''}${l.takenBy ? `, taken by ${l.takenBy}` : ''}`;
  return l?.seededBy ? `seeded by ${l.seededBy}` : 'seeded here';
}

/** Publications grouped by family (given name), as trees. A publication's parent is the
 *  one before it from the same ludant ("then") or, failing that, the publication it was
 *  copied from ("copy of"). */
function families(published) {
  const byTime = published.slice().sort((x, y) => x.at.localeCompare(y.at));
  const parent = new Map();
  for (const p of byTime) {
    const earlier = byTime.filter((q) => q.ludant === p.ludant && q.at < p.at).at(-1);
    if (earlier) parent.set(p.id, { id: earlier.id, how: 'then' });
    else if (p.from && published.some((q) => q.id === p.from)) parent.set(p.id, { id: p.from, how: 'copy' });
  }
  const children = (id) => byTime.filter((p) => parent.get(p.id)?.id === id);
  const node = (p) => {
    const how = parent.get(p.id)?.how;
    const kids = children(p.id);
    return el('li', { class: 'tree-node' },
      el('a', { class: 'tree-card', href: `/play.html?p=${p.id}` },
        how ? el('span', { class: `tree-how ${how}` }, how === 'then' ? 'then' : `copy, changed by ${p.by ?? 'someone'}`) : null,
        el('strong', {}, p.name),
        el('span', {}, `${p.by ? `published by ${p.by}` : 'published'} · ${p.copies} ${p.copies === 1 ? 'copy' : 'copies'} · ${when(p.at)}`),
        p.note ? el('span', { class: 'pub-note' }, `“${p.note}”`) : null),
      kids.length ? el('ul', { class: 'tree' }, ...kids.map(node)) : null);
  };
  const groups = new Map();
  for (const p of byTime) if (!parent.has(p.id)) groups.set(p.given, [...(groups.get(p.given) ?? []), p]);
  return [...groups].reverse().map(([given, roots]) => el('li', { class: 'family' },
    el('div', { class: 'family-name' }, `the ${given} family`),
    el('ul', { class: 'tree root' }, ...roots.map(node))));
}

async function render() {
  const [config, ludants, published] = await Promise.all([api('GET', 'config'), api('GET', 'ludants'), api('GET', 'published')]);
  document.getElementById('config').textContent = config.hasKey ? config.model : 'no OpenRouter key: thinking is off';
  document.getElementById('published').replaceChildren(...families(published));
  document.getElementById('ludants').replaceChildren(...ludants.map((l) =>
    el('li', {}, el('a', { href: `/frame.html?l=${l.id}` },
      el('strong', {}, l.name),
      el('span', {}, `${lineageLine(l.lineage)} · ${l.people.length ? `sat with ${l.people.join(', ')}` : 'nobody yet'} · ${when(l.updated)}`)))));
}

const nameInput = document.getElementById('me');
nameInput.value = myName();
nameInput.addEventListener('change', () => { try { localStorage.setItem('gactant-name', nameInput.value.trim()); } catch {} });

document.getElementById('seed').addEventListener('submit', async (e) => {
  e.preventDefault();
  const by = nameInput.value.trim();
  if (!by) { nameInput.focus(); nameInput.placeholder = 'say who you are first'; return; }
  try { localStorage.setItem('gactant-name', by); } catch {}
  const { id } = await api('POST', 'ludants', { by });
  location.href = `/frame.html?l=${id}`;
});

render();
