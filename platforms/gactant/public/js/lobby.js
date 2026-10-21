import { seedSoma } from './seed.js';
import { api, el } from './ui.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

async function render() {
  const [config, actants, releases] = await Promise.all([api('GET', 'config'), api('GET', 'actants'), api('GET', 'releases')]);
  document.getElementById('config').textContent = config.hasKey ? config.model : 'no OpenRouter key: thinking is off';
  document.getElementById('actants').replaceChildren(...actants.map((a) =>
    el('li', {}, el('a', { href: `/frame.html?a=${a.id}` }, el('strong', {}, a.name), el('span', {}, `${a.checkpoints} checkpoints · ${when(a.updated)}`)))));
  document.getElementById('releases').replaceChildren(...releases.map((r) =>
    el('li', {}, el('a', { href: `/play.html?r=${r.id}` }, el('strong', {}, r.title), el('span', {}, `checkpoint ${r.n} of ${r.actant} · ${r.installs} installs`)))));
}

document.getElementById('seed').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('seed-name').value.trim();
  if (!name) return;
  const { id } = await api('POST', 'actants', { soma: seedSoma(name), surfaces: {} });
  location.href = `/frame.html?a=${id}`;
});

render();
