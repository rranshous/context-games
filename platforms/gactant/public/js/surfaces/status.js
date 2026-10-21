// Status: lights in the top bar. The frame owns the audience light and the actant's
// life light (asleep / thinking / resting / error); the actant may integrate by setting a
// line of its own beside its name.
//
// actions (as an actor)   say(text)   set the actor's status line ('' clears it)
// events                  status.said { who, text }

import { el } from '../ui.js';

export class Status {
  id = 'status';

  constructor(frame) {
    this.frame = frame;
    this.life = 'asleep';
    this.detail = '';
    this.line = '';
    this.spent = 0;
  }

  describe() {
    return `status: lights at the top of the frame showing the audience and whether you're awake; you can set a short status line beside your name${this.line ? ` (now: "${this.line}")` : ''}.`;
  }

  actions(who) {
    return { say: (text) => this.say(who, text) };
  }

  say(who, text) {
    this.line = String(text ?? '').slice(0, 80);
    this.render();
    this.frame.bus.emit('status.said', { who, text: this.line });
    this.frame.changed();
    return { line: this.line };
  }

  /** The frame's own lights. */
  setLife(life, detail = '') { this.life = life; this.detail = detail; this.render(); }
  addSpend(usd) { this.spent += usd || 0; this.render(); }

  mount(root) { this.root = root; this.render(); }

  render() {
    if (!this.root) return;
    const audience = this.frame.audience;
    this.root.replaceChildren(...[
      el('span', { class: `light audience ${audience}`, title: audience === 'shaper' ? 'being shaped' : 'hosting a player' },
        el('i'), audience === 'shaper' ? 'SHAPING' : 'HOSTING'),
      el('span', { class: `light life ${this.life}`, title: this.detail || this.life },
        el('i'), this.frame.actant?.name ?? '…', el('em', {}, this.life)),
      this.line ? el('span', { class: 'status-line' }, `“${this.line}”`) : null,
      this.detail ? el('span', { class: 'status-detail' }, this.detail) : null,
      el('span', { class: 'spend', title: 'inference spend this session' }, `$${this.spent.toFixed(3)}`),
    ].filter(Boolean));
  }

  toJSON() { return { line: this.line }; }
  load(json) { this.line = json?.line ?? ''; }
}
