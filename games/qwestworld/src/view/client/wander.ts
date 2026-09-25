// wander.ts — a camera that drifts between whatever is happening, for leaving on a wall.

import { MetaResponse, StateResponse, MAP_W, MAP_H } from '../../shared/types.js';
import { Camera } from './render.js';

interface Sight {
  x: number;
  y: number;
  scale: number;
  caption: string;
  key: string; // to avoid lingering on the same thing twice in a row
}

const DWELL_MS = 16000;
const EASE = 0.025; // per frame at 24fps, toward the target

export class Wanderer {
  on = false;
  private target: Sight | null = null;
  private since = 0;
  private visits = 0;
  private lastKey = '';

  constructor(private cam: Camera, private captionEl: HTMLElement) {}

  toggle(force?: boolean) {
    this.on = force ?? !this.on;
    this.target = null;
    this.captionEl.hidden = !this.on;
    if (!this.on) this.captionEl.textContent = '';
  }

  /** Called every frame. Chooses a new sight when it's time, and eases the camera toward it. */
  step(now: number, meta: MetaResponse, state: StateResponse, viewW: number, viewH: number, panel: number) {
    if (!this.on) return;
    if (!this.target || now - this.since > DWELL_MS) {
      this.target = this.choose(meta, state, viewW, viewH, panel);
      this.since = now;
      this.captionEl.textContent = this.target.caption;
      this.captionEl.classList.remove('show');
      void this.captionEl.offsetWidth;
      this.captionEl.classList.add('show');
    }
    const t = this.target;
    const tx = t.x + panel / 2 / this.cam.scale;
    this.cam.scale += (t.scale - this.cam.scale) * EASE;
    this.cam.x += (tx - this.cam.x) * EASE;
    this.cam.y += (t.y - this.cam.y) * EASE;
  }

  private choose(meta: MetaResponse, state: StateResponse, viewW: number, viewH: number, panel: number): Sight {
    this.visits++;
    const overview = (): Sight => ({
      x: MAP_W / 2, y: MAP_H / 2, key: 'overview',
      scale: Math.min((viewW - panel) / MAP_W, viewH / MAP_H) * 0.98,
      caption: `The continent, ${state.date}`,
    });
    if (this.visits % 5 === 0) return this.remember(overview());

    const S = meta.settlements;
    const realm = (i: number) => state.kingdoms[i]?.name ?? '';
    const sights: (Sight & { weight: number })[] = [];
    for (const b of state.battles ?? []) {
      const near = S.reduce((p, m) => Math.hypot(m.x - b.x, m.y - b.y) < Math.hypot(p.x - b.x, p.y - b.y) ? m : p);
      sights.push({ x: b.x, y: b.y, scale: 4, key: `battle:${near.id}`, weight: 3 + Math.sqrt(b.deaths) / 4,
        caption: `The Battle of ${near.name}: ${b.factions.map(realm).join(' against ')}. ${b.days} day${b.days > 1 ? 's' : ''}, ${b.deaths} fallen.` });
    }
    for (const v of state.settlements) {
      if (v.siege <= 0) continue;
      const m = S[v.id];
      sights.push({ x: m.x, y: m.y, scale: 5, key: `siege:${m.id}`, weight: 3 + v.siege * 3,
        caption: `${m.name} of the ${realm(v.owner)} is besieged.` });
    }
    for (const k of state.kingdoms) {
      if (!k.alive || !k.thinking || k.brain === 'script') continue;
      const m = S[k.capital];
      sights.push({ x: m.x, y: m.y, scale: 3.2, key: `council:${k.id}`, weight: 2,
        caption: `${k.ruler.title} ${k.ruler.name} of the ${k.name} holds council.` });
    }
    for (const a of state.armies) {
      if (a.order !== 'march' || a.size < 200) continue;
      sights.push({ x: a.x, y: a.y, scale: 3.5, key: `army:${a.id}`, weight: 1 + a.size / 1500,
        caption: `General ${a.general} marches on ${S[a.target].name} with ${a.size.toLocaleString()} of the ${realm(a.faction)}.` });
    }
    for (const c of state.couriers ?? []) {
      if (c.kind !== 'envoy') continue;
      sights.push({ x: c.x0 + (c.x1 - c.x0) * c.t, y: c.y0 + (c.y1 - c.y0) * c.t, scale: 3, key: `envoy:${c.faction}:${c.x1}`, weight: 1.5,
        caption: `An envoy of the ${realm(c.faction)} is on the road.` });
    }
    const fresh = sights.filter(s => s.key !== this.lastKey);
    if (!fresh.length) return this.remember(overview());
    let r = Math.random() * fresh.reduce((n, s) => n + s.weight, 0);
    for (const s of fresh) { r -= s.weight; if (r <= 0) return this.remember(s); }
    return this.remember(fresh[0]);
  }

  private remember(s: Sight): Sight {
    this.lastKey = s.key;
    return s;
  }
}
