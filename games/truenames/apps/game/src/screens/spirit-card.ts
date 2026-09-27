// A spirit's card: its seal, its temper, and what your name for it can draw.
import type { App } from '../main.ts';
import { frag, esc } from '../dom.ts';
import {
  ELEMENT_COLOR, ELEMENT_NAMES, ASPECTS, FORMS, TEMPERS, HEARTH_GOD,
  addressOf, spiritName, magnitudeTitle, weightWord, generosityWord, nameRunes, fmtDuration, truths,
} from '../lore.ts';
import { spiritOf } from '../save.ts';
import { sigilURL } from '../sigil.ts';
import { spiritStats, castCap, castStrain } from '@truenames/authority';
import { MIN_NAME_BITS } from '@truenames/universe';

export function openSpiritCard(app: App, cell: string) {
  const S = app.services;
  const sp = spiritOf(app.save, cell);
  if (!sp) return;
  const st = spiritStats(sp);
  const color = ELEMENT_COLOR[sp.element]!;
  const s = S.strength(cell);
  const rec = app.save.names[cell];
  const rate = Math.max(1, S.pool.rate() / Math.max(1, S.pool.list().length));
  const form = FORMS[sp.traits.form]!;
  const rows = [MIN_NAME_BITS, 16, 20, 24, 28].filter((b) => b >= Math.max(MIN_NAME_BITS, s - 4)).slice(0, 5);
  const known = S.learned(cell);
  const root = frag(`<div class="overlay card-overlay">
    <div class="spirit-card" style="--c:${color}">
      <img src="${sigilURL(sp, 160)}" width="160" height="160" alt="" style="filter: drop-shadow(0 0 16px ${color}66)">
      <h1 style="color:${color}; font-size:30px; margin-top:8px">${esc(spiritName(sp))}</h1>
      <div class="dim" style="font-style:italic">${magnitudeTitle(sp.magnitude)} of ${esc(ASPECTS[sp.element]![sp.aspect]!)}${cell === HEARTH_GOD ? ', the hearth-god' : ''}</div>
      <div class="dim" style="font-size:14px; margin-top:4px">${esc(addressOf(cell))} <span class="mono faint">${cell}</span></div>
      <div class="card-grid">
        <div data-tip="element"><span class="dim">element</span> ${ELEMENT_NAMES[sp.element]}</div>
        <div data-tip="form"><span class="dim">form</span> ${form.name}: ${form.desc}</div>
        <div data-tip="magnitude"><span class="dim">magnitude</span> ${sp.magnitude}: its well holds ${Math.round(st.poolCap)} and refills ${st.refill.toFixed(1)} each breath</div>
        <div data-tip="weight"><span class="dim">weight</span> ${weightWord(sp.traits.weightIdx)}: each evocation strains you ~${castStrain(st, Math.max(s, MIN_NAME_BITS)).toFixed(2)}</div>
        <div data-tip="generosity"><span class="dim">generosity</span> ${generosityWord(sp.traits.generosityIdx)} (×${st.generosity.toFixed(2)})</div>
        <div data-tip="temper"><span class="dim">temper</span> ${TEMPERS[sp.traits.temperIdx]}</div>
      </div>
      <div style="margin-top:10px">${rec ? `Your name: <span class="runes" style="font-size:16px" data-tip="runes">${nameRunes(rec.claim.nonce, 12)}</span> holds <span class="gold mono">${truths(s)}</span>` : `<span class="dim">You do not yet know its name.</span>`}</div>
      <table class="card-table">
        <tr><th data-tip="truths">name</th><th data-tip="=The most a single evocation can draw from this spirit with a name this true, before strain and crowding. The well itself may hold less.">draws up to</th><th data-tip="=How much strain each evocation adds to your aura. Truer names weigh less.">strain / cast</th><th data-tip="=Roughly how long meditation would take to reach this, at this name's current share of your hum.">meditation to reach</th></tr>
        ${rows.map((b) => `<tr class="${b <= s ? 'reached' : ''}"><td class="mono">${truths(b)}</td><td class="mono">${castCap(b, st.generosity).toFixed(1)}</td><td class="mono">${castStrain(st, b).toFixed(2)}</td><td>${b <= s ? '✓' : `~${fmtDuration((2 ** b - 2 ** s) / rate)} here`}</td></tr>`).join('')}
      </table>
      <div class="faint" style="font-size:13px; max-width:460px">Draw is before strain and crowding. Every point of strain you carry costs you a truth at the moment you speak. ${known ? '' : `Meditate until it holds ${truths(MIN_NAME_BITS)} to call it.`}</div>
      <button data-close style="margin-top:8px">close</button>
    </div>
  </div>`);
  const opened = performance.now(); // opened on pointerdown: ignore the click that finishes that same press
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (performance.now() - opened < 350) return;
    if (t === root || t.closest('[data-close]')) root.remove();
  });
  document.getElementById('ui')!.appendChild(root);
}
