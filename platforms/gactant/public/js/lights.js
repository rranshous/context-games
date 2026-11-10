// The lights in the top bar: the frame's own, not a surface. Who is sitting here, the
// ludant's life (asleep / thinking / resting / error), and the cost meter (what this
// sitting has cost, and its rate).
//
// (There used to be a status surface, where a ludant could set a line beside its name.
// Ludants set it once and forgot it, so it said "waiting for an idea" long after they had
// one. It's gone; the chat is where a ludant says what it's up to.)

import { el } from './ui.js';
import { callName, titled } from './names.js';

// How its life reads to people: plain words. (resting is thinking that's held back: it woke
// itself too often, or nobody here has connected an AI for it to think with.)
export const LIFE_WORDS = { asleep: 'ready', thinking: 'thinking…', resting: 'waiting', error: 'stuck' };

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

  /** Its life in words, as a sentence's end ("is ready"). Ready means it would answer, so
   *  until an AI is connected here it says that instead. */
  lifeWords() {
    if ((this.life === 'asleep' || this.life === 'resting') && !this.frame.payer?.()) return 'needs an AI to answer';
    return `is ${LIFE_WORDS[this.life] ?? this.life}`;
  }

  render() {
    this.frame.showMarquee?.();
    if (!this.root) return;
    const soma = this.frame.actant?.soma;
    this.root.replaceChildren(...[
      el('span', { class: 'light people', title: 'sitting here' }, el('i'), [...this.frame.people].join(' · ')),
      // The game by its title, and the one you talk to by its given name ("Little Catch ·
      // Fishtest is ready"); its full name on hover.
      el('span', { class: `light life ${this.life}`, title: `${this.frame.actant?.name ?? ''}: ${this.detail || LIFE_WORDS[this.life] || this.life}` },
        el('i'), titled(soma?.sections?.title) || callName(soma) || '…',
        el('em', {}, `${titled(soma?.sections?.title) ? `${callName(soma)} ` : ''}${this.lifeWords()}`)),
      // (Without an AI connected, the words above already say so.)
      this.detail && this.frame.payer?.() ? el('span', { class: 'status-detail' }, this.detail) : null,
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
    // Until someone here connects an AI, this is the one thing that brings it to life, so
    // it looks like it.
    const button = el('button', { class: payer ? `spend ${warm}` : 'spend connect', title: payer ? 'what thinking has cost this sitting' : 'it talks and changes itself by thinking with an AI model, on your own OpenRouter account' },
      payer ? `$${this.spent.toFixed(2)}${rate ? ` · $${rate.toFixed(2)}/h` : ''}${room < 2 ? ` · $${Math.max(0, room).toFixed(2)} left` : ''}` : 'connect an AI');
    // Nobody connected: the button connects. Once someone has, it opens what it's cost.
    button.addEventListener('click', () => (payer ? this.openMeter() : this.frame.connectThinking()));
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
      el('p', {}, `This sitting: $${this.spent.toFixed(3)} over ${mins} min${rate ? `, about $${rate.toFixed(2)} an hour` : ''}. A ludant thinks with an AI model when something wakes it: mostly someone talking to it, though its own code can wake it too. So the cost depends on the ludant, and on how much you ask of it. It sees this meter too. Nothing is spent until someone here connects an account, and OpenRouter lets you put a spending limit on the key.`),
      el('p', {}, payer === 'own' ? 'Paid by your own OpenRouter account.' : payer === 'server' ? 'Paid by this install\'s key (a local setup).' : 'Nothing is connected, so it can\'t think yet.'),
      keyLine ? el('p', {}, keyLine) : null,
      el('label', { class: 'meter-row', title: 'a reminder of what it has cost so far; it doesn\'t stop anything' }, 'remind me each time this sitting passes another $', every),
      el('div', { class: 'meter-row' },
        payer === 'own'
          ? el('button', { class: 'wb-btn', onclick: () => { frame.disconnectThinking(); pop.remove(); } }, 'disconnect OpenRouter')
          : el('button', { class: 'wb-btn primary', onclick: async () => { await frame.connectThinking(); pop.remove(); } }, 'connect OpenRouter'),
        el('button', { class: 'wb-btn', onclick: () => pop.remove() }, 'close')));
    document.body.append(pop);
  }

}
