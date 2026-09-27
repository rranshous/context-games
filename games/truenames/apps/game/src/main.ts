import { loadSave, type SaveData } from './save.ts';
import { Services } from './services.ts';
import { titleScreen } from './screens/title.ts';
import { drawAstral } from './astral.ts';
import { initAudio, setDrone, sfxFind, sfxName, isMuted, setMuted } from './audio.ts';
import { spiritOf } from './save.ts';
import { spiritName } from './lore.ts';

export interface Screen {
  mount(ui: HTMLElement): void;
  unmount(): void;
  /** Called every animation frame. Return true if the screen drew the canvas itself. */
  frame?(dt: number, ctx: CanvasRenderingContext2D, w: number, h: number): boolean;
}

export interface App {
  services: Services;
  save: SaveData;
  go(s: Screen): void;
  toast(html: string, color?: string): void;
}

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const ui = document.getElementById('ui')!;
let current: Screen | null = null;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const toasts = document.createElement('div');
toasts.className = 'toast-wrap';

async function boot() {
  const save = await loadSave();
  const services = new Services(save);
  const app: App = {
    services,
    save,
    go(s) {
      current?.unmount();
      ui.innerHTML = '';
      current = s;
      s.mount(ui);
      ui.appendChild(toasts);
    },
    toast(html, color) {
      const d = document.createElement('div');
      d.className = 'toast';
      if (color) d.style.borderColor = color;
      d.innerHTML = html;
      toasts.appendChild(d);
      setTimeout(() => d.remove(), 5200);
      while (toasts.children.length > 5) toasts.firstChild!.remove();
    },
  };
  (window as any).__truenames = { app, services, save };
  services.resume();
  const wake = () => initAudio();
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', (e) => {
    wake();
    if (e.key === 'm' && !(e.target instanceof HTMLInputElement)) {
      setMuted(!isMuted());
      app.toast(isMuted() ? 'Silence.' : 'The hum returns.');
    }
  });
  let lastChime = 0;
  const chime = (f: () => void) => { const t = performance.now(); if (t - lastChime > 350) { lastChime = t; f(); } };
  services.finds.on((f) => { if (f.isNew) chime(() => sfxFind(f.spirit.element, f.spirit.magnitude)); });
  services.names.on((n) => { const sp = spiritOf(save, n.cell); if (sp) chime(() => sfxName(n.strength, sp.element)); });
  // Idle touches: the tab title carries news while hidden; returning shows what the work found.
  let away: { t: number; strengths: Record<string, number>; spirits: number } | null = null;
  const snapshot = () => Object.fromEntries(Object.entries(save.names).map(([c, r]) => [c, r.strength]));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      away = { t: Date.now(), strengths: snapshot(), spirits: Object.keys(save.spirits).length };
      return;
    }
    document.title = 'Truenames';
    if (!away || Date.now() - away.t < 60_000) { away = null; return; }
    const grew: string[] = [];
    for (const [c, s] of Object.entries(snapshot())) {
      const before = away.strengths[c] ?? 0;
      const sp = spiritOf(save, c);
      if (s > before && sp) grew.push(`${spiritName(sp)} ${before ? `${before}→` : ''}${s}`);
    }
    const found = Object.keys(save.spirits).length - away.spirits;
    if (grew.length || found > 0) {
      app.toast(`<b>While you were away</b><br>${grew.length ? `truer: ${grew.slice(0, 6).join(', ')}${grew.length > 6 ? '…' : ''}` : ''}${found > 0 ? `${grew.length ? '<br>' : ''}${found} spirit${found > 1 ? 's' : ''} answered` : ''}`);
    }
    away = null;
  });
  services.names.on((n) => {
    if (!document.hidden) return;
    const sp = spiritOf(save, n.cell);
    if (sp) document.title = `✦ ${spiritName(sp)} ${n.strength} · Truenames`;
  });
  app.go(titleScreen(app));

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    const drew = current?.frame?.(dt, ctx, w, h) ?? false;
    const hum = services.pool.rate();
    setDrone(hum, drew ? 0.35 : 1);
    if (!drew) drawAstral(ctx, w, h, now / 1000, hum);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
