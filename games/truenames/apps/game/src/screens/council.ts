// The Council, as seen by a player: a turn-based card duel. THIN CLIENT: the dungeon decides
// every play. It sends a fresh view of the table whenever something changes; you see only your hand.
// Never touches the save or the sanctum (CLAUDE.md rule 6).
import type { Screen } from '../main.ts';
import type { CouncilWelcome, DungeonLink, Journey, RoundHost, RoundResult } from '../round.ts';
import { frag, esc } from '../dom.ts';
import { COUNCIL as C, councilPower, worldDescentName } from '@truenames/dungeon/balance';
import type { CouncilCard, CouncilCreature, CouncilEvent, CouncilTarget, CouncilView, WireTraits } from '@truenames/dungeon/protocol';
import { ELEMENT_COLOR, ELEMENT_GLYPH, FORMS, spiritName, truths, type SpiritLike } from '../lore.ts';
import { FORM_GLYPH } from './codex.ts';
import { sigilURL } from '../sigil.ts';
import { castCap, spiritStats, TUNABLES } from '@truenames/authority';
import * as sfx from '../audio.ts';

const toTraits = (t: WireTraits) => ({ ...t, flavor: BigInt(t.flavor) });
const colorOf = (el: number) => (el >= 0 ? ELEMENT_COLOR[el]! : '#9c8f74');
const needsTarget = (form: number) => form === 0 || form === 3 || form === 6;
const CARD_TEXT = [
  (p: number) => `Strike a creature or the Warden for ~${p}.`,
  (p: number) => `Ring out: ~${Math.max(1, Math.round(p * C.ringMult))} to every creature across the table.`,
  (p: number) => `Ward yourself: a shield of ~${Math.round(p * C.wardMult)}.`,
  (p: number) => `Lance a creature for ~${p}; what passes through strikes behind it.`,
  (p: number) => `Gather a nova: next turn it bursts for ~${Math.round(p * C.novaMult)} on the Warden, half on its creatures.`,
  (p: number) => `Send a servant: ${Math.max(1, Math.round(p * C.summonAtk))} attack, ${Math.max(1, Math.round(p * C.summonHp))} toughness. It strikes each turn.`,
  (p: number) => `Hex a foe: ~${Math.max(1, Math.round(p / C.hexTurns))} each turn for ${C.hexTurns} turns (a creature takes it at once).`,
  () => 'Step through the astral: draw two names and regain a voice.',
];

export function councilScreen(link: DungeonLink, welcome: CouncilWelcome, journey: Journey, host: RoundHost): Screen {
  const level = welcome.level;
  const me = welcome.seat;
  for (const r of welcome.refused) host.toast(`A name was not heard at the threshold: ${r}`, '#ff7a6b');
  let view: CouncilView | null = null;
  let targeting: CouncilCard | null = null;
  let over: RoundResult | null = null;
  let root: HTMLElement;
  let paused = false;
  const log: string[] = [];

  /** How your own browser sees a card: its true name and seal (the dungeon never learns them). */
  const own = (c: { slot: number; element: number; magnitude: number; traits: WireTraits }): SpiritLike => {
    const cos = journey.cosmetics[c.slot];
    return cos ? { element: cos.element, magnitude: cos.magnitude, traits: toTraits(cos.traits) } : { element: c.element, magnitude: c.magnitude, traits: toTraits(c.traits) };
  };
  const nameOf = (c: { slot: number; element: number; magnitude: number; traits: WireTraits }, seat: number) =>
    seat === me && journey.cosmetics[c.slot] ? spiritName(own(c)) : `${FORMS[c.traits.form]!.name} of ${['fire', 'frost', 'storm', 'stone', 'tide', 'shadow', 'light', 'rot'][c.element]}`;

  /** What a card should draw right now: truths less strain, limited by the patron's vessel. */
  function estimate(c: CouncilCard): number {
    const seat = view?.seats[me];
    const eff = c.strength - (seat?.strain ?? 0);
    const gen = spiritStats({ magnitude: c.magnitude, traits: toTraits(c.traits) }).generosity;
    const vessel = view?.vessels[c.id]?.level ?? Infinity;
    const grant = Math.min(castCap(eff, gen), vessel);
    return councilPower(grant, TUNABLES.formEfficiency[c.form]!);
  }

  link.onCouncil = (v) => {
    view = v;
    for (const e of v.events) onEvent(e);
    render();
  };
  link.onEnd = (r) => end(r);
  link.onClose = () => { if (!over) host.toast('The dungeon fell silent.', '#ff7a6b'); };

  function note(html: string) {
    log.push(html);
    if (log.length > 8) log.shift();
  }

  function float(targetSel: string, text: string, color: string) {
    const el = root?.querySelector(targetSel) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'cfloat';
    f.textContent = text;
    f.style.color = color;
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top + r.height / 3}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  function onEvent(e: CouncilEvent) {
    const who = (seat: number) => (seat === me ? 'You' : 'The Warden');
    switch (e.e) {
      case 'turn': if (e.seat === me) { sfx.sfxWave(); note(`<span class="gold">Turn ${e.turn}: your voice returns.</span>`); } else note(`<span class="dim">Turn ${e.turn}: the Warden considers…</span>`); return;
      case 'play': {
        const name = nameOf(e.card, e.seat);
        note(`${who(e.seat)} ${e.seat === me ? 'speak' : 'speaks'} <span style="color:${colorOf(e.card.element)}">${esc(name)}</span> (${FORMS[e.card.form]!.name}, rang ${e.effective.toFixed(1)}): <b>${e.power}</b>`);
        sfx.sfxCast(e.card.form, e.card.element, Math.min(1, e.power / 20));
        return;
      }
      case 'damage': {
        const sel = e.target.kind === 'face' ? `[data-face="${e.target.seat}"]` : `[data-creature="${e.target.id}"]`;
        setTimeout(() => float(sel, `−${e.amount}`, e.source === 'backlash' ? '#ff5040' : colorOf(e.element)), 30);
        if (e.target.kind === 'face' && e.target.seat === me) sfx.sfxHurt(); else sfx.sfxHit();
        return;
      }
      case 'shield': setTimeout(() => float(`[data-face="${e.seat}"]`, `+${e.amount} ward`, '#cfe8ff'), 30); return;
      case 'summon': note(`${who(e.creature.seat)} ${e.creature.seat === me ? 'send' : 'sends'} a servant (${e.creature.atk} / ${e.creature.hp}).`); return;
      case 'die': sfx.sfxKill(); return;
      case 'backlash': sfx.sfxBacklash(); note(`<span style="color:#ff7a6b">${who(e.seat)} overreached: backlash ${e.amount}.</span>`); return;
      case 'refused': host.toast(e.why, '#9c8f74'); return;
      case 'draw': return;
    }
  }

  function play(c: CouncilCard, target?: CouncilTarget) {
    targeting = null;
    link.play(c.id, target);
  }

  function seatHtml(seat: number) {
    const s = view!.seats[seat]!;
    const mine = seat === me;
    const lifeK = Math.max(0, s.life / s.lifeMax);
    const cap = Math.max(s.capacity * 1.6, s.strain * 1.05, 0.01);
    return `<div class="cseat ${mine ? 'mine' : 'theirs'} ${targeting ? 'targetable' : ''}" data-face="${seat}" data-tip="=${mine ? 'You.' : 'The Warden of the council: it plays the names of ancient spirits.'} Life, ward, voice and strain.${targeting ? ' <em>Click to target.</em>' : ''}">
      <div class="cseat-name">${mine ? 'You' : `the Warden of ${esc(worldDescentName('council', level))}`}${view!.active === seat ? ' <span class="gold">· speaking</span>' : ''}</div>
      <div class="cbar"><i style="width:${(100 * lifeK).toFixed(1)}%"></i></div>
      <div class="cseat-row"><span class="mono">life ${Math.max(0, s.life)}</span>${s.shield ? `<span class="mono" style="color:#cfe8ff">ward ${s.shield}</span>` : ''}
        <span class="mono gold">voice ${s.voice}/${s.voiceMax}</span>
        <span class="mono dim">strain ${s.strain.toFixed(1)}/${s.capacity.toFixed(1)}</span>
        ${s.hexes ? `<span style="color:#b56bff">hexed ×${s.hexes}</span>` : ''}${s.novaPending ? '<span class="gold">nova gathering</span>' : ''}
        ${mine ? '' : `<span class="dim">${s.handCount} in hand · ${s.deckCount} in deck</span>`}</div>
      <div class="cstrain"><i style="width:${Math.min(100, (100 * s.strain) / cap).toFixed(1)}%; background:${s.strain > s.capacity ? '#ff5040' : '#ff9e5a'}"></i><span style="left:${((100 * s.capacity) / cap).toFixed(1)}%"></span></div>
    </div>`;
  }

  function creatureHtml(c: CouncilCreature) {
    return `<div class="ccreature ${targeting ? 'targetable' : ''} ${c.fresh ? 'fresh' : ''}" data-creature="${c.id}" style="--c:${colorOf(c.element)}" data-tip="=A servant: it strikes the front creature across the table, or its master's foe, at the end of each of its master's turns${c.fresh ? ' (it arrived this turn, so it waits)' : ''}.">
      <div class="cglyph">${ELEMENT_GLYPH[c.element]}</div><div class="mono"><b>${c.atk}</b> / ${c.hp}</div></div>`;
  }

  function cardHtml(c: CouncilCard) {
    const v = view!;
    const canPlay = v.active === me && !over && c.cost <= v.seats[me]!.voice;
    const sp = own(c);
    const p = estimate(c);
    const vessel = v.vessels[c.id];
    return `<div class="ccard ${canPlay ? 'playable' : 'dim-card'} ${targeting?.id === c.id ? 'aiming' : ''}" data-card="${c.id}" style="--c:${colorOf(c.element)}"
      data-tip="=<b style='color:${colorOf(c.element)}'>${esc(spiritName(sp))}</b>: ${FORMS[c.form]!.name}. ${CARD_TEXT[c.form]!(p)}<br>Power is what the name actually draws when spoken: your truths, less your strain, limited by the patron's vessel (the bar), which refills between turns.">
      <div class="ccost">${c.cost}</div>
      <img src="${sigilURL(sp, 64)}" alt="">
      <div class="cname">${esc(spiritName(sp))}</div>
      <div class="cform">${FORM_GLYPH[c.form]} ${FORMS[c.form]!.name} · ${truths(c.strength)}</div>
      <div class="cpower">~${p}</div>
      <div class="cvessel"><i style="width:${vessel ? ((100 * vessel.level) / vessel.cap).toFixed(0) : 100}%"></i></div>
    </div>`;
  }

  function render() {
    if (!root || !view) return;
    const v = view;
    const board = (seat: number) => v.board.filter((c) => c.seat === seat).map(creatureHtml).join('') || '<div class="faint cempty">no servants</div>';
    const yourTurn = v.active === me && !over;
    root.querySelector('#ctable')!.innerHTML = `
      ${seatHtml(1 - me)}
      <div class="cboard">${board(1 - me)}</div>
      <div class="cmid">
        <div class="clog">${log.slice(-5).map((l) => `<div>${l}</div>`).join('')}</div>
        <button class="primary" id="cpass" ${yourTurn ? '' : 'disabled'} data-tip="=End your turn: your servants strike, strain ebbs and vessels refill.">${yourTurn ? (targeting ? 'choose a target…' : 'End turn') : 'The Warden speaks…'}</button>
      </div>
      <div class="cboard">${board(me)}</div>
      ${seatHtml(me)}
      <div class="chand">${v.hand.map(cardHtml).join('') || '<div class="dim">Your hand is empty.</div>'}</div>`;
    if (journey.newcomer) root.querySelector('#chint')!.textContent = 'Click a card to speak it (bolts, lances and hexes then need a target). End your turn to let your servants strike. Esc pauses.';
  }

  function end(result: RoundResult) {
    if (over) return;
    over = result;
    if (result.won) sfx.sfxVictory(); else sfx.sfxDeath();
    const { unlocked } = host.report(result);
    render();
    const o = frag(`<div class="overlay">
      <h1 style="font-size:40px; color:var(--gold)">${result.won ? 'The council yields' : 'You are silenced'}</h1>
      <div class="prose">${result.won ? `The Warden of ${worldDescentName('council', level)} bows.${unlocked ? `<br><em>A higher seat awaits: ${worldDescentName('council', level + 1)}.</em>` : ''}` : `The Warden outspoke you on turn ${result.wave}. Your names are kept; names are always kept.`}</div>
      <div class="dim">${result.kills} of the Warden's servants broken</div>
      <button class="primary" id="back">Return to the sanctum</button>
    </div>`);
    o.querySelector('#back')!.addEventListener('click', () => host.leave());
    root.appendChild(o);
  }

  function togglePause() {
    if (over) return;
    paused = !paused;
    link.pause(paused);
    root.querySelector('.overlay.cpause')?.remove();
    if (!paused) return;
    const o = frag(`<div class="overlay cpause">
      <h1 style="font-size:32px; color:var(--gold)">Stillness</h1>
      <div class="dim">The council waits.</div>
      <div style="display:flex; gap:10px"><button class="primary" id="resume">Resume</button><button id="abandon">Leave the council</button></div>
    </div>`);
    o.querySelector('#resume')!.addEventListener('click', togglePause);
    o.querySelector('#abandon')!.addEventListener('click', () => { paused = false; link.pause(false); o.remove(); link.abandon(); });
    root.appendChild(o);
  }

  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!view || over || paused || t.closest('.overlay')) return;
    if (t.closest('#cpass')) { targeting = null; link.pass(); return; }
    const cardEl = t.closest('[data-card]');
    if (cardEl) {
      const c = view.hand.find((x) => x.id === Number(cardEl.getAttribute('data-card')));
      if (!c || view.active !== me || c.cost > view.seats[me]!.voice) return;
      if (needsTarget(c.form)) { targeting = targeting?.id === c.id ? null : c; render(); }
      else play(c);
      return;
    }
    if (targeting) {
      const face = t.closest('[data-face]');
      const cr = t.closest('[data-creature]');
      if (face) play(targeting, { kind: 'face', seat: Number(face.getAttribute('data-face')) });
      else if (cr) play(targeting, { kind: 'creature', id: Number(cr.getAttribute('data-creature')) });
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { if (targeting) { targeting = null; render(); } else togglePause(); }
  };
  const onContext = (e: MouseEvent) => { e.preventDefault(); if (targeting) { targeting = null; render(); } };

  return {
    mount(ui) {
      root = frag(`<div class="council">
        <div class="council-top"><h1 style="font-size:18px; color:var(--gold)">the Council · ${esc(worldDescentName('council', level))}</h1><span class="faint" id="chint"></span></div>
        <div id="ctable" class="ctable"><div class="dim" style="margin:auto">The council gathers…</div></div>
      </div>`);
      ui.appendChild(root);
      root.addEventListener('click', onClick);
      window.addEventListener('keydown', onKey);
      window.addEventListener('contextmenu', onContext);
      (window as any).__council = {
        view: () => view,
        play: (id: number, target?: CouncilTarget) => link.play(id, target),
        pass: () => link.pass(),
        estimate: (id: number) => { const c = view?.hand.find((x) => x.id === id); return c ? estimate(c) : null; },
      };
    },
    unmount() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
      link.onCouncil = link.onEnd = link.onClose = null;
      link.close();
      delete (window as any).__council;
    },
  };
}
