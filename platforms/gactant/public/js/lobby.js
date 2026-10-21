import { api, el, myName } from './ui.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function lineageLine(l) {
  if (l?.from) return `copy of ${l.from.name}${l.from.by ? ` (published by ${l.from.by})` : ''}${l.takenBy ? `, taken by ${l.takenBy}` : ''}`;
  return l?.seededBy ? `seeded by ${l.seededBy}` : 'seeded here';
}

async function render() {
  const [config, ludants, published] = await Promise.all([api('GET', 'config'), api('GET', 'ludants'), api('GET', 'published')]);
  document.getElementById('config').textContent = config.hasKey ? config.model : 'no OpenRouter key: thinking is off';
  document.getElementById('published').replaceChildren(...published.map((p) =>
    el('li', {}, el('a', { href: `/play.html?p=${p.id}` },
      el('strong', {}, p.name),
      el('span', {}, `${p.by ? `published by ${p.by}` : 'published'}${p.fromName ? ` · grew from ${p.fromName}` : ''} · ${p.copies} ${p.copies === 1 ? 'copy' : 'copies'} · ${when(p.at)}`),
      p.note ? el('span', { class: 'pub-note' }, `“${p.note}”`) : null))));
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
