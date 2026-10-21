// Status: lights in the top bar. The frame owns the people light (who is sitting here),
// the ludant's life light (asleep / thinking / resting / error) and the cost meter (what
// this sitting has cost, and its rate); the ludant may integrate by setting a line of its
// own beside its name.
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
    this.lineAt = 0;
    this.spent = 0;
    this.since = Date.now();   // when this sitting began, for the rate
  }

  /** Dollars an hour this sitting, once it has run long enough to say. */
  rate() {
    const hours = (Date.now() - this.since) / 3600000;
    return hours > 2 / 60 && this.spent > 0 ? this.spent / hours : null;
  }

  /** How often (in dollars) the frame checks in with the person; 0 means never. */
  checkInEvery() {
    try { const v = localStorage.getItem('gactant-check-in'); return v == null ? 1 : Number(v) || 0; } catch { return 1; }
  }

  describe() {
    return `status: lights at the top of the frame showing who is here and whether you're awake; you can set a short status line beside your name${this.line ? ` (now: "${this.line}"${this.lineAt ? `, set ${ago(this.lineAt)}` : ''})` : ''}.`;
  }

  actions(who) {
    return { say: (text) => this.say(who, text) };
  }

  say(who, text) {
    this.line = String(text ?? '').slice(0, 80);
    this.lineAt = Date.now();
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
    this.root.replaceChildren(...[
      el('span', { class: 'light people', title: 'sitting here' }, el('i'), [...this.frame.people].join(' · ')),
      el('span', { class: `light life ${this.life}`, title: this.detail || this.life },
        el('i'), this.frame.actant?.name ?? '…', el('em', {}, this.life)),
      this.line ? el('span', { class: 'status-line' }, `“${this.line}”`) : null,
      this.detail ? el('span', { class: 'status-detail' }, this.detail) : null,
      this.meter(),
    ].filter(Boolean));
  }

  /** The cost meter, and what opens from it: who pays, the rate, how often to check in. */
  meter() {
    const rate = this.rate();
    const payer = this.frame.payer?.();
    const warm = this.spent >= 1 ? 'hot' : this.spent >= 0.25 ? 'warm' : '';
    const button = el('button', { class: `spend ${warm}`, title: 'what thinking has cost this sitting' },
      payer ? `$${this.spent.toFixed(2)}${rate ? ` · $${rate.toFixed(2)}/h` : ''}` : 'connect thinking');
    button.addEventListener('click', () => this.openMeter());
    return button;
  }

  openMeter() {
    document.querySelector('.meter-pop')?.remove();
    const frame = this.frame, payer = frame.payer(), rate = this.rate();
    const mins = Math.max(1, Math.round((Date.now() - this.since) / 60000));
    const every = el('input', { class: 'meter-every', type: 'number', min: '0', step: '0.25', value: String(this.checkInEvery()) });
    every.addEventListener('change', () => { try { localStorage.setItem('gactant-check-in', String(Math.max(0, Number(every.value) || 0))); } catch {} });
    const pop = el('div', { class: 'meter-pop' },
      el('p', {}, `This sitting: $${this.spent.toFixed(3)} over ${mins} min${rate ? `, about $${rate.toFixed(2)} an hour` : ''}. A ludant thinks when something wakes it: someone talking to it, or anything its own hooks decide is worth waking for, even mid-game. It's told this meter too.`),
      el('p', {}, payer === 'own' ? 'Paid by your own OpenRouter account.' : payer === 'server' ? 'Paid by this install\'s key (a local setup).' : 'Nothing is connected, so it can\'t think yet.'),
      el('label', { class: 'meter-row' }, 'check in with me every $', every),
      el('div', { class: 'meter-row' },
        payer === 'own'
          ? el('button', { class: 'wb-btn', onclick: () => { frame.disconnectThinking(); pop.remove(); } }, 'disconnect OpenRouter')
          : el('button', { class: 'wb-btn primary', onclick: async () => { await frame.connectThinking(); pop.remove(); } }, 'connect OpenRouter'),
        el('button', { class: 'wb-btn', onclick: () => pop.remove() }, 'close')));
    document.body.append(pop);
  }

  toJSON() { return { line: this.line, lineAt: this.lineAt }; }
  load(json) { this.line = json?.line ?? ''; this.lineAt = json?.lineAt ?? 0; }
}

function ago(at) {
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
