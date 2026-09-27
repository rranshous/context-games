import type { App, Screen } from '../main.ts';
import { frag } from '../dom.ts';
import { ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, HEARTH_GOD, spiritTitle, nameRunes, addressOf } from '../lore.ts';
import { newAura, persist, rememberSpirit, wipeSave, emptySave } from '../save.ts';
import { MIN_NAME_BITS, spiritAt } from '@truenames/universe';
import { sanctumScreen } from './sanctum.ts';
import { sigilURL } from '../sigil.ts';

export function titleScreen(app: App): Screen {
  let root: HTMLElement;
  return {
    mount(ui) {
      const has = !!app.save.aura;
      root = frag(`<div class="center-screen">
        <div class="title">TRUENAMES</div>
        <div class="subtitle">Spirits dwell in the eightfold division, uncountably deep. To find one is work. To know its name is work. Your hands, and the engine beneath them, do that work.</div>
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
          if (!confirm('Forsake your aura? Every name you hold is bound to it and will be lost.')) return;
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
        <div class="subtitle">Your element is where you first look. It colors nothing else; every spirit in the astral can be known by anyone.</div>
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
  rememberSpirit(app.save, god, 'lore');
  persist(app.save);
  let off: (() => void)[] = [];
  let chant: HTMLElement, bitsEl: HTMLElement, status: HTMLElement, go: HTMLButtonElement;
  let tries = 0;
  return {
    mount(ui) {
      const root = frag(`<div class="center-screen">
        <img src="${sigilURL(god, 128)}" width="128" height="128" alt="" style="filter: drop-shadow(0 0 12px rgba(255,122,61,.5))">
        <h1 style="font-size:26px; color:var(--gold)">Attunement</h1>
        <div class="prose">Every apprentice learns one word first: the name of the hearth-god, <em>${spiritTitle(god)}</em>, who has dwelt at <span class="mono">${HEARTH_GOD}</span> (${addressOf(HEARTH_GOD)}) since before the first scholar. Everyone knows her. Everyone draws from her. She is mighty, and she is stingy.<br><br>A name is never the same in two mouths. Yours must be found by your own meditation. Speak until it rings true, at least <em>${MIN_NAME_BITS} bits</em>.</div>
        <div class="chant" id="chant"></div>
        <div class="bitsbig" id="bits">0</div>
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
        const s = app.services.strength(HEARTH_GOD);
        bitsEl.textContent = `${s} bits`;
        if (s >= MIN_NAME_BITS) {
          status.innerHTML = `She hears you. Your name for her rings at <span class="gold">${s} bits</span>. Meditation will go on deepening it while you rest.`;
          chant.textContent = nameRunes(app.save.names[HEARTH_GOD]!.claim.nonce, 9);
          go.style.visibility = 'visible';
          if (!app.save.loadout.includes(HEARTH_GOD)) {
            const i = app.save.loadout.findIndex((c) => !c);
            if (i >= 0) { app.save.loadout[i] = HEARTH_GOD; persist(app.save); }
          }
        }
      };
      off.push(app.services.names.on((e) => { if (e.cell === HEARTH_GOD) show(); }));
      off.push(app.services.hum.on((r) => {
        tries++;
        if (app.services.strength(HEARTH_GOD) < MIN_NAME_BITS) {
          chant.textContent = nameRunes(String(tries * 7919 + Math.floor(Math.random() * 1e9)), 9);
          status.textContent = `meditating… ${Math.round(r).toLocaleString()} utterances a second`;
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
