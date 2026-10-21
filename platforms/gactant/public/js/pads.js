// Controllers, for the frame's pages: read through the Gamepad API every display frame,
// with buttons by name. (On Xbox, Edge passes controllers to pages only in its
// "controller mode"; otherwise a controller drives a pointer and nothing arrives here.)
//
//   const pads = new Pads()
//   pads.on((e) => …)    e: { pad, button, down, repeat }   a press, a release, or a held
//                                                          direction repeating (for moving
//                                                          around a page)
//   pads.list            [{ index, id, down: { a: true, … }, value: { lt, rt }, left: { x, y }, right: { x, y } }]
//
// The left stick also counts as the d-pad (up/down/left/right) past half way.

export const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'menu', 'ls', 'rs', 'up', 'down', 'left', 'right', 'home'];
const DIRS = ['up', 'down', 'left', 'right'];
const DEAD = 0.15;       // stick values under this are 0
const AS_DPAD = 0.5;     // a stick past this counts as the d-pad
const REPEAT_AFTER = 380, REPEAT_EVERY = 140;   // ms, for a held direction

const dead = (v) => (Math.abs(v) < DEAD ? 0 : +v.toFixed(3));

export class Pads {
  constructor() {
    this.list = [];
    this.listeners = new Set();
    this.held = new Map();   // `${pad}:${button}` -> { since, last }
    this.seen = false;       // a controller has been used on this page
    const loop = () => { this.poll(); requestAnimationFrame(loop); };
    if (navigator.getGamepads) requestAnimationFrame(loop);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e) { for (const fn of this.listeners) { try { fn(e); } catch (err) { console.warn('[pads]', err); } } }

  poll() {
    const raw = [...(navigator.getGamepads?.() ?? [])].filter((p) => p && p.connected !== false);
    const now = performance.now();
    this.list = raw.map((p) => {
      const down = {}, value = {};
      p.buttons.forEach((b, i) => { const name = BUTTONS[i]; if (name && b.pressed) down[name] = true; });
      value.lt = +(p.buttons[6]?.value ?? 0).toFixed(3);
      value.rt = +(p.buttons[7]?.value ?? 0).toFixed(3);
      const left = { x: dead(p.axes[0] ?? 0), y: dead(p.axes[1] ?? 0) }, right = { x: dead(p.axes[2] ?? 0), y: dead(p.axes[3] ?? 0) };
      // The left stick as a d-pad.
      if (left.y < -AS_DPAD) down.up = true;
      if (left.y > AS_DPAD) down.down = true;
      if (left.x < -AS_DPAD) down.left = true;
      if (left.x > AS_DPAD) down.right = true;
      return { index: p.index, id: p.id, down, value, left, right };
    });
    for (const pad of this.list) {
      for (const button of BUTTONS) {
        const key = `${pad.index}:${button}`, h = this.held.get(key), isDown = Boolean(pad.down[button]);
        if (isDown && !h) {
          this.held.set(key, { since: now, last: now });
          this.seen = true;
          this.emit({ pad: pad.index, button, down: true, repeat: false });
        } else if (!isDown && h) {
          this.held.delete(key);
          this.emit({ pad: pad.index, button, down: false, repeat: false });
        } else if (isDown && DIRS.includes(button) && now - h.since > REPEAT_AFTER && now - h.last > REPEAT_EVERY) {
          h.last = now;
          this.emit({ pad: pad.index, button, down: true, repeat: true });
        }
      }
    }
    // A controller unplugged with buttons held lets go of them.
    for (const key of [...this.held.keys()]) {
      const [index, button] = key.split(':');
      if (!this.list.some((p) => String(p.index) === index)) { this.held.delete(key); this.emit({ pad: Number(index), button, down: false, repeat: false }); }
    }
  }
}

/** Moving around a page with a d-pad: the nearest focusable thing in that direction. */
export class PadNav {
  constructor(pads, { scope = () => document.body, onBack = null } = {}) {
    this.scope = scope;
    this.onBack = onBack;
    this.enabled = true;
    this.current = null;
    pads.on((e) => {
      if (!this.enabled || !e.down) return;
      if (DIRS.includes(e.button)) this.move(e.button);
      else if (e.button === 'a' && !e.repeat) this.activate();
      else if (e.button === 'b' && !e.repeat) this.onBack?.();
    });
  }

  focusables() {
    const root = this.scope();
    if (!root) return [];
    return [...root.querySelectorAll('a[href], button, input, textarea, select, [tabindex="0"]')].filter((n) => {
      if (n.disabled) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
    });
  }

  focus(node) {
    this.current?.classList.remove('pad-focus');
    this.current = node;
    if (!node) return;
    node.classList.add('pad-focus');
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  /** The closest thing in that direction, favouring what's straight ahead. */
  move(dir) {
    const all = this.focusables();
    if (!all.length) return;
    if (!this.current || !all.includes(this.current)) { this.focus(all[0]); return; }
    const from = this.current.getBoundingClientRect();
    const cx = from.left + from.width / 2, cy = from.top + from.height / 2;
    let best = null, bestScore = Infinity;
    for (const n of all) {
      if (n === this.current) continue;
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      const ahead = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const aside = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      if (ahead <= 4) continue;
      const score = ahead + aside * 2.5;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) this.focus(best);
  }

  activate() {
    const n = this.current && this.focusables().includes(this.current) ? this.current : null;
    if (!n) { this.move('down'); return; }
    if (n.matches('input, textarea')) { n.focus(); n.click(); return; }
    n.click();
  }

  clear() { this.focus(null); }
}
