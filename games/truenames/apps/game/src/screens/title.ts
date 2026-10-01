import type { App, Screen } from '../main.ts';
import { frag } from '../dom.ts';
import { ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, HEARTH_GOD, spiritTitle, nameRunes, addressOf, truths } from '../lore.ts';
import { newAura, persist, rememberSpirit, wipeSave, emptySave, wordKey } from '../save.ts';
import { spiritAt, wordBar } from '@truenames/universe';
import { sanctumScreen } from './sanctum.ts';
import { sigilURL } from '../sigil.ts';

export function titleScreen(app: App): Screen {
  let root: HTMLElement;
  return {
    mount(ui) {
      const has = !!app.save.aura;
      root = frag(`<div class="center-screen">
        <div class="title">TRUENAMES</div>
        <div class="subtitle">Beings dwell in the eightfold division, uncountably deep: wisps in the shallows, gods far below. To find one is work. To grasp its words of power is work. Your hands, and the engine beneath them, do that work.</div>
        ${app.save.sundered ? `<div class="advice" style="max-width:560px">The astral is not as you left it. Your aura remains, but every being you knew, and every word you held, is gone. Begin again with the hearth.</div>` : ''}
        <div style="display:flex; gap:12px; margin-top:10px">
          ${has ? `<button class="primary" data-a="enter">Return to the sanctum</button>` : `<button class="primary" data-a="begin">Begin</button>`}
        </div>
        ${has ? `<button class="small" data-a="forsake" style="margin-top:30px; opacity:.6">Forsake this aura and begin anew</button>` : ''}
      </div>`);
      root.addEventListener('click', async (e) => {
        const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
        if (a === 'begin') app.go(elementScreen(app));
        if (a === 'enter') {
          if (app.services.learned(HEARTH_GOD)) app.go(sanctumScreen(app));
          else app.go(attuneScreen(app));
        }
        if (a === 'forsake') {
          if (!confirm('Forsake your aura? Every word you hold is bound to it and will be lost.')) return;
          await wipeSave();
          Object.assign(app.save, emptySave());
          location.reload();
        }
      });
      ui.appendChild(root);
    },
    unmount() {},
  };
}

function elementScreen(app: App): Screen {
  return {
    mount(ui) {
      const root = frag(`<div class="center-screen">
        <h1 style="font-size:28px; color:var(--gold)">Which division calls to you?</h1>
        <div class="subtitle">Your element is where you first look. It colors nothing else; every being in the astral can be known by anyone.</div>
        <div class="elements">
          ${ELEMENT_NAMES.map((n, i) => `<div class="element-card" data-e="${i}" style="color:${ELEMENT_COLOR[i]}; border-color:${ELEMENT_COLOR[i]}44"><span class="g">${ELEMENT_GLYPH[i]}</span><span class="n">${n}</span></div>`).join('')}
        </div>
      </div>`);
      root.addEventListener('click', (e) => {
        const c = (e.target as HTMLElement).closest('[data-e]');
        if (!c) return;
        const element = Number(c.getAttribute('data-e'));
        app.save.aura = newAura(element);
        app.services.authority.registerAura(app.save.aura.pub);
        persist(app.save);
        app.go(attuneScreen(app));
      });
      ui.appendChild(root);
    },
    unmount() {},
  };
}

export function attuneScreen(app: App): Screen {
  const god = spiritAt(HEARTH_GOD)!;
  const bar = wordBar(god.magnitude);
  const word = wordKey(HEARTH_GOD, 0); // a wisp has one facet
  rememberSpirit(app.save, god, 'lore');
  delete app.save.sundered;
  persist(app.save);
  let off: (() => void)[] = [];
  let chant: HTMLElement, bitsEl: HTMLElement, status: HTMLElement, go: HTMLButtonElement;
  let tries = 0;
  return {
    mount(ui) {
      const root = frag(`<div class="center-screen">
        <img src="${sigilURL(god, 128)}" width="128" height="128" alt="" style="filter: drop-shadow(0 0 12px rgba(255,122,61,.5))">
        <h1 style="font-size:26px; color:var(--gold)">Attunement</h1>
        <div class="prose">Every apprentice's first word is spoken to <em>the hearth</em>, <em>${spiritTitle(god)}</em>, whose sign every household keeps. It has dwelt at <span class="mono">${HEARTH_GOD}</span> (${addressOf(HEARTH_GOD)}) since before the first scholar.<br><br>A word of power is never the same in two mouths. Yours must come through your own meditation, and it is yours once it holds <em>${truths(bar)}</em>. It takes a little while; mightier beings ask far more.</div>
        <div class="chant" id="chant" data-tip="runes"></div>
        <div class="bitsbig" id="bits" data-tip="truths">0</div>
        <div class="dim" id="status">meditating…</div>
        <button class="primary" id="go" style="visibility:hidden">Enter the sanctum</button>
      </div>`);
      chant = root.querySelector('#chant')!;
      bitsEl = root.querySelector('#bits')!;
      status = root.querySelector('#status')!;
      go = root.querySelector('#go')!;
      go.onclick = () => app.go(sanctumScreen(app));
      ui.appendChild(root);
      const show = () => {
        const s = app.services.strength(word);
        bitsEl.textContent = truths(s);
        if (s >= bar) {
          status.innerHTML = `The hearth answers. Your word holds <span class="gold">${truths(s)}</span>. Meditation will go on deepening it while you rest.`;
          chant.textContent = nameRunes(app.save.names[word]!.claim.nonce, 9);
          go.style.visibility = 'visible';
          if (!app.save.loadout.includes(word)) {
            const i = app.save.loadout.findIndex((c) => !c);
            if (i >= 0) { app.save.loadout[i] = word; persist(app.save); }
          }
        }
      };
      off.push(app.services.names.on((e) => { if (e.cell === HEARTH_GOD) show(); }));
      off.push(app.services.hum.on((r) => {
        tries++;
        if (app.services.strength(word) < bar) {
          chant.textContent = nameRunes(String(tries * 7919 + Math.floor(Math.random() * 1e9)), 9);
          const left = Math.max(0, 2 ** bar / Math.max(1, r));
          status.textContent = `meditating… ${Math.round(r).toLocaleString()} utterances a second · a word comes in about ${left < 90 ? `${Math.round(left)} s` : `${Math.round(left / 60)} min`}, give or take`;
        }
      }));
      app.services.meditate(HEARTH_GOD, true);
      show();
    },
    unmount() {
      off.forEach((f) => f());
    },
  };
}
