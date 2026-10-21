// The lights in the top bar: the frame's own, not a surface. Who is sitting here, the
// ludant's life (asleep / thinking / resting / error), and the cost meter (what this
// sitting has cost, and its rate).
//
// (There used to be a status surface, where a ludant could set a line beside its name.
// Ludants set it once and forgot it, so it said "waiting for an idea" long after they had
// one. It's gone; the chat is where a ludant says what it's up to.)

import { el } from './ui.js';

export class Lights {
  constructor(frame) {
    this.frame = frame;
    this.life = 'asleep';
    this.detail = '';
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

  /** The frame's own lights. */
  setLife(life, detail = '') { this.life = life; this.detail = detail; this.render(); this.frame.chat?.showLife(); }
  addSpend(usd) { this.spent += usd || 0; this.render(); }

  mount(root) { this.root = root; this.render(); }

  render() {
    if (!this.root) return;
    this.root.replaceChildren(...[
      el('span', { class: 'light people', title: 'sitting here' }, el('i'), [...this.frame.people].join(' · ')),
      el('span', { class: `light life ${this.life}`, title: this.detail || this.life },
        el('i'), this.frame.actant?.name ?? '…', el('em', {}, this.life)),
      this.detail ? el('span', { class: 'status-detail' }, this.detail) : null,
      this.meter(),
    ].filter(Boolean));
  }

  /** The cost meter, and what opens from it: who pays, the rate, how often to check in. */
  meter() {
    const rate = this.rate();
    const payer = this.frame.payer?.();
    const left = this.frame.left?.();
    const room = left ? Math.min(left.remaining ?? Infinity, left.balance ?? Infinity) : Infinity;
    const warm = this.spent >= 1 || room < 0.5 ? 'hot' : this.spent >= 0.25 || room < 2 ? 'warm' : '';
    const button = el('button', { class: `spend ${warm}`, title: 'what thinking has cost this sitting' },
      payer ? `$${this.spent.toFixed(2)}${rate ? ` · $${rate.toFixed(2)}/h` : ''}${room < 2 ? ` · $${Math.max(0, room).toFixed(2)} left` : ''}` : 'connect thinking');
    button.addEventListener('click', () => this.openMeter());
    return button;
  }

  openMeter(fresh = false) {
    document.querySelector('.meter-pop')?.remove();
    const frame = this.frame, payer = frame.payer(), rate = this.rate();
    // Fresh numbers from OpenRouter, then draw it once more with them.
    if (payer === 'own' && !fresh) frame.refreshKey().then(() => { if (document.querySelector('.meter-pop')) this.openMeter(true); });
    const left = frame.left?.();
    const keyLine = left ? [left.remaining != null ? `Your key has $${left.remaining.toFixed(2)} left of its $${left.limit} limit${left.resets ? ` (it resets ${left.resets})` : ''}.` : 'Your key has no limit of its own.', left.balance != null ? `Your OpenRouter account has $${left.balance.toFixed(2)}.` : null].filter(Boolean).join(' ') : null;
    const mins = Math.max(1, Math.round((Date.now() - this.since) / 60000));
    const every = el('input', { class: 'meter-every', type: 'number', min: '0', step: '0.25', value: String(this.checkInEvery()) });
    every.addEventListener('change', () => { try { localStorage.setItem('gactant-check-in', String(Math.max(0, Number(every.value) || 0))); } catch {} });
    const pop = el('div', { class: 'meter-pop' },
      el('p', {}, `This sitting: $${this.spent.toFixed(3)} over ${mins} min${rate ? `, about $${rate.toFixed(2)} an hour` : ''}. A ludant thinks with an AI model whenever its own body decides to, so the cost depends on the ludant. It's told this meter too.`),
      el('p', {}, payer === 'own' ? 'Paid by your own OpenRouter account.' : payer === 'server' ? 'Paid by this install\'s key (a local setup).' : 'Nothing is connected, so it can\'t think yet.'),
      keyLine ? el('p', {}, keyLine) : null,
      el('label', { class: 'meter-row' }, 'check in with me every $', every),
      el('div', { class: 'meter-row' },
        payer === 'own'
          ? el('button', { class: 'wb-btn', onclick: () => { frame.disconnectThinking(); pop.remove(); } }, 'disconnect OpenRouter')
          : el('button', { class: 'wb-btn primary', onclick: async () => { await frame.connectThinking(); pop.remove(); } }, 'connect OpenRouter'),
        el('button', { class: 'wb-btn', onclick: () => pop.remove() }, 'close')));
    document.body.append(pop);
  }

}
